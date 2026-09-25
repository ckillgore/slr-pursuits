import { NextResponse } from 'next/server';
import { requireAuth } from '@/app/api/_lib/auth';
import { createClient } from '@/lib/supabase/server';
import { buildMemoDocx, type MemoDocxData } from '@/lib/docx/docxBuilder';
import { upstreamErrorResponse } from '@/app/api/_lib/upstream';

// Columns the DOCX actually uses (pursuits/one_pagers carry large jsonb blobs
// such as parcel_data and drive_time_data that we don't want to pull here).
const PURSUIT_COLUMNS = 'id, name, address, city, state, zip, county, latitude, longitude, executive_memo, primary_one_pager_id';
// (A single string literal, so supabase-js can still infer the row type.)
const ONE_PAGER_COLUMNS = 'id, name, created_at, total_units, efficiency_ratio, vacancy_rate, other_income_per_unit_month, hard_cost_per_nrsf, land_cost, soft_cost_pct, mgmt_fee_pct, calc_total_nrsf, calc_total_gbsf, calc_gpr, calc_net_revenue, calc_total_budget, calc_hard_cost, calc_soft_cost, calc_total_opex, calc_noi, calc_yoc, calc_cost_per_unit, calc_noi_per_unit';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export async function POST(request: Request) {
    const { response: authError } = await requireAuth();
    if (authError) return authError;

    try {
        const { pursuitId } = await request.json();
        if (!pursuitId || typeof pursuitId !== 'string') {
            return NextResponse.json({ error: 'pursuitId is required' }, { status: 400 });
        }

        const supabase = await createClient();

        // ──── 1-5. Fetch pursuit, one-pagers and comps in parallel ────
        // (all keyed on pursuitId, so there's no reason to run them serially)
        const [
            { data: pursuit, error: pursuitErr },
            { data: onePagers = [] },
            { data: rentCompLinks = [] },
            { data: landCompLinks = [] },
            { data: saleCompLinks = [] },
        ] = await Promise.all([
            supabase.from('pursuits').select(PURSUIT_COLUMNS).eq('id', pursuitId).single(),
            supabase
                .from('one_pagers')
                .select(ONE_PAGER_COLUMNS)
                .eq('pursuit_id', pursuitId)
                .eq('is_archived', false)
                .order('created_at', { ascending: false }),
            // Units live in hellodata_units (there is no units/vacancies column on
            // hellodata_properties), so embed just the price columns we average.
            supabase
                .from('pursuit_rent_comps')
                .select('id, property:hellodata_properties(building_name, street_address, number_units, year_built, occupancy_over_time, units:hellodata_units(price, effective_price))')
                .eq('pursuit_id', pursuitId),
            supabase
                .from('pursuit_land_comps')
                .select('id, land_comp:land_comps(name, address, site_area_sf, sale_price, sale_price_psf, sale_date, buyer)')
                .eq('pursuit_id', pursuitId),
            // Sale price / cap rate live on sale_transactions, not sale_comps.
            supabase
                .from('pursuit_sale_comps')
                .select('id, sale_comp:sale_comps(name, address, year_built, total_units, transactions:sale_transactions(sale_date, sale_price, cap_rate, price_per_unit))')
                .eq('pursuit_id', pursuitId),
        ]);

        if (pursuitErr || !pursuit) {
            return NextResponse.json({ error: 'Pursuit not found' }, { status: 404 });
        }

        // Find primary or first active one-pager
        const primaryOnePager = onePagers?.find((op: any) => op.id === pursuit.primary_one_pager_id)
            || (onePagers && onePagers.length > 0 ? onePagers[0] : null);

        const rentComps: MemoDocxData['rentComps'] = (rentCompLinks || [])
            .filter((rc: any) => rc.property)
            .map((rc: any) => {
                const p = rc.property;
                const units = Array.isArray(p.units) ? p.units : [];
                const validPrices = units.filter((u: any) => u.price != null);
                const validEff = units.filter((u: any) => u.effective_price != null);
                const askingRent = validPrices.length > 0
                    ? validPrices.reduce((s: number, u: any) => s + (u.price || 0), 0) / validPrices.length
                    : null;
                const effectiveRent = validEff.length > 0
                    ? validEff.reduce((s: number, u: any) => s + (u.effective_price || 0), 0) / validEff.length
                    : null;
                // Latest leased fraction from the occupancy series (same source the
                // pursuit page uses).
                const occSeries = Array.isArray(p.occupancy_over_time) ? p.occupancy_over_time : [];
                const latestLeased = occSeries.length > 0 ? occSeries[occSeries.length - 1]?.leased : null;
                const occupancy = typeof latestLeased === 'number' ? latestLeased * 100 : null;

                return {
                    name: p.building_name || p.street_address || 'Unknown',
                    units: p.number_units ?? null,
                    yearBuilt: p.year_built ?? null,
                    askingRent: askingRent ? Math.round(askingRent) : null,
                    effectiveRent: effectiveRent ? Math.round(effectiveRent) : null,
                    occupancy,
                };
            });

        const landComps: MemoDocxData['landComps'] = (landCompLinks || [])
            .filter((lc: any) => lc.land_comp)
            .map((lc: any) => {
                const c = lc.land_comp;
                const acres = c.site_area_sf ? c.site_area_sf / 43560 : null;
                return {
                    name: c.name || c.address || 'Unknown',
                    acres,
                    salePrice: c.sale_price ?? null,
                    pricePerAcre: c.sale_price && acres ? c.sale_price / acres : null,
                    pricePerSf: c.sale_price_psf ?? null,
                    saleDate: c.sale_date ?? null,
                    buyer: c.buyer ?? null,
                };
            });

        const saleComps: MemoDocxData['saleComps'] = (saleCompLinks || [])
            .filter((sc: any) => sc.sale_comp)
            .map((sc: any) => {
                const c = sc.sale_comp;
                // Most recent transaction (undated ones sort last).
                type SaleTx = { sale_date?: string | null; sale_price?: number | null; cap_rate?: number | null; price_per_unit?: number | null };
                const txs: SaleTx[] = Array.isArray(c.transactions) ? [...c.transactions] : [];
                txs.sort((a, b) => String(b.sale_date ?? '').localeCompare(String(a.sale_date ?? '')));
                const tx: SaleTx = txs[0] ?? {};
                return {
                    name: c.name || c.address || 'Unknown',
                    units: c.total_units ?? null,
                    yearBuilt: c.year_built ?? null,
                    salePrice: tx.sale_price ?? null,
                    pricePerUnit: tx.price_per_unit ?? (tx.sale_price && c.total_units ? tx.sale_price / c.total_units : null),
                    capRate: tx.cap_rate ?? null,
                    saleDate: tx.sale_date ?? null,
                };
            });

        // ──── 6. Fetch static Mapbox image ────
        let mapImageBuffer: Buffer | null = null;
        if (MAPBOX_TOKEN && pursuit.latitude && pursuit.longitude) {
            try {
                const lng = Number(pursuit.longitude);
                const lat = Number(pursuit.latitude);
                if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error('Invalid coordinates');
                const mapUrl = `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-l+2563EB(${lng},${lat})/${lng},${lat},14,0/800x500@2x?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`;
                const mapRes = await fetch(mapUrl, { signal: AbortSignal.timeout(10_000) });
                if (mapRes.ok) {
                    const arrayBuf = await mapRes.arrayBuffer();
                    mapImageBuffer = Buffer.from(arrayBuf);
                }
            } catch (err) {
                console.warn('[DOCX Export] Failed to fetch static map image:', err);
            }
        }

        // ──── 7. Build DOCX ────
        const docxData: MemoDocxData = {
            pursuit: {
                name: pursuit.name,
                address: pursuit.address,
                city: pursuit.city,
                state: pursuit.state,
                zip: pursuit.zip,
                county: pursuit.county,
                latitude: pursuit.latitude,
                longitude: pursuit.longitude,
                executive_memo: pursuit.executive_memo,
            },
            onePager: primaryOnePager ? {
                name: primaryOnePager.name,
                total_units: primaryOnePager.total_units,
                efficiency_ratio: primaryOnePager.efficiency_ratio,
                vacancy_rate: primaryOnePager.vacancy_rate,
                other_income_per_unit_month: primaryOnePager.other_income_per_unit_month,
                hard_cost_per_nrsf: primaryOnePager.hard_cost_per_nrsf,
                land_cost: primaryOnePager.land_cost,
                soft_cost_pct: primaryOnePager.soft_cost_pct,
                mgmt_fee_pct: primaryOnePager.mgmt_fee_pct,
                calc_total_nrsf: primaryOnePager.calc_total_nrsf,
                calc_total_gbsf: primaryOnePager.calc_total_gbsf,
                calc_gpr: primaryOnePager.calc_gpr,
                calc_net_revenue: primaryOnePager.calc_net_revenue,
                calc_total_budget: primaryOnePager.calc_total_budget,
                calc_hard_cost: primaryOnePager.calc_hard_cost,
                calc_soft_cost: primaryOnePager.calc_soft_cost,
                calc_total_opex: primaryOnePager.calc_total_opex,
                calc_noi: primaryOnePager.calc_noi,
                calc_yoc: primaryOnePager.calc_yoc,
                calc_cost_per_unit: primaryOnePager.calc_cost_per_unit,
                calc_noi_per_unit: primaryOnePager.calc_noi_per_unit,
            } : null,
            rentComps,
            landComps,
            saleComps,
            mapImageBuffer,
        };

        const docxBuffer = await buildMemoDocx(docxData);

        // ──── 8. Return as downloadable file ────
        const filename = `Deal_Summary_${String(pursuit.name ?? 'Pursuit').replace(/[^a-zA-Z0-9]/g, '_')}.docx`;

        return new NextResponse(new Uint8Array(docxBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': String(docxBuffer.length),
            },
        });

    } catch (err: unknown) {
        return upstreamErrorResponse(err, 'DOCX Export', 'Failed to generate DOCX');
    }
}
