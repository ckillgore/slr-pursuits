import { NextResponse } from 'next/server';
import { requireAuth } from '@/app/api/_lib/auth';
import { createClient } from '@/lib/supabase/server';
import { buildMemoDocx, type MemoDocxData } from '@/lib/docx/docxBuilder';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export async function POST(request: Request) {
    const { response: authError } = await requireAuth();
    if (authError) return authError;

    try {
        const { pursuitId } = await request.json();
        if (!pursuitId) {
            return NextResponse.json({ error: 'pursuitId is required' }, { status: 400 });
        }

        const supabase = await createClient();

        // ──── 1. Fetch pursuit ────
        const { data: pursuit, error: pursuitErr } = await supabase
            .from('pursuits')
            .select('*')
            .eq('id', pursuitId)
            .single();

        if (pursuitErr || !pursuit) {
            return NextResponse.json({ error: 'Pursuit not found' }, { status: 404 });
        }

        // ──── 2. Fetch one-pagers ────
        const { data: onePagers = [] } = await supabase
            .from('one_pagers')
            .select('*')
            .eq('pursuit_id', pursuitId)
            .eq('is_archived', false)
            .order('created_at', { ascending: false });

        // Find primary or first active one-pager
        const primaryOnePager = onePagers?.find((op: any) => op.id === pursuit.primary_one_pager_id)
            || (onePagers && onePagers.length > 0 ? onePagers[0] : null);

        // ──── 3. Fetch rent comps (linked properties) ────
        const { data: rentCompLinks = [] } = await supabase
            .from('pursuit_rent_comps')
            .select('*, property:hellodata_properties(*)')
            .eq('pursuit_id', pursuitId);

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
                const occupancy = p.number_units ? ((p.number_units - (p.vacancies ?? 0)) / p.number_units) * 100 : null;

                return {
                    name: p.building_name || p.street_address || 'Unknown',
                    units: p.number_units ?? null,
                    yearBuilt: p.year_built ?? null,
                    askingRent: askingRent ? Math.round(askingRent) : null,
                    effectiveRent: effectiveRent ? Math.round(effectiveRent) : null,
                    occupancy,
                };
            });

        // ──── 4. Fetch land comps ────
        const { data: landCompLinks = [] } = await supabase
            .from('pursuit_land_comps')
            .select('*, land_comp:land_comps(*)')
            .eq('pursuit_id', pursuitId);

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

        // ──── 5. Fetch sale comps ────
        const { data: saleCompLinks = [] } = await supabase
            .from('pursuit_sale_comps')
            .select('*, sale_comp:sale_comps(*)')
            .eq('pursuit_id', pursuitId);

        const saleComps: MemoDocxData['saleComps'] = (saleCompLinks || [])
            .filter((sc: any) => sc.sale_comp)
            .map((sc: any) => {
                const c = sc.sale_comp;
                return {
                    name: c.name || c.address || 'Unknown',
                    units: c.units ?? null,
                    yearBuilt: c.year_built ?? null,
                    salePrice: c.sale_price ?? null,
                    pricePerUnit: c.price_per_unit ?? null,
                    capRate: c.cap_rate ?? null,
                    saleDate: c.sale_date ?? null,
                };
            });

        // ──── 6. Fetch static Mapbox image ────
        let mapImageBuffer: Buffer | null = null;
        if (MAPBOX_TOKEN && pursuit.latitude && pursuit.longitude) {
            try {
                const lng = pursuit.longitude;
                const lat = pursuit.latitude;
                const mapUrl = `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-l+2563EB(${lng},${lat})/${lng},${lat},14,0/800x500@2x?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`;
                const mapRes = await fetch(mapUrl);
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
        const filename = `Deal_Summary_${pursuit.name.replace(/[^a-zA-Z0-9]/g, '_')}.docx`;

        return new NextResponse(new Uint8Array(docxBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': String(docxBuffer.length),
            },
        });

    } catch (err: any) {
        console.error('[DOCX Export] Error:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to generate DOCX' },
            { status: 500 }
        );
    }
}
