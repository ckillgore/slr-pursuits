import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3-flash-preview';

// ────────────────────────── Prompts ──────────────────────────

const SUMMARIZE_PROMPT = `You are a multifamily real estate data analyst.
Summarize the following demographic, public parcel, and market data into a comprehensive 300-400 word summary
focused on what matters for multifamily development feasibility.

Cover:
- Key population, income, and housing metrics (cite specific ring distances)
- Growth trends (population, housing, income CAGRs) and affordability
- Zoning & development standards (allowed density, height, FAR, setbacks)
- FEMA/flood risk
- Property tax burden and recent sale history
- Notable observations about owner-renter mix, vacancy, and rental market

RULES:
- Use $ with commas for currency, % for percentages
- Reference specific data points from the input
- Be direct and analytical, no filler
- If a category has no data, skip it silently`;

const ASSESSMENT_PROMPT = `You are a senior multifamily real estate development analyst. 
Write a concise site assessment for the following property from a **development feasibility** perspective.
Use precise numbers from the provided data. Be direct and neutral — no filler or marketing language.

Structure your response in markdown with these sections:

## Site Overview
2-3 sentences: location, lot size, current use/zoning, year built if applicable.

## Market Context
2-3 sentences: use the pre-summarized demographic and market data to highlight key demand drivers,
rent levels vs HUD FMR, renter percentages, vacancy, income levels, and growth trends.

## Development Potential
2-3 sentences: what the zoning allows (density, height, FAR, setbacks), estimated buildable units based on lot size and zoning, any regulatory advantages (opportunity zone, etc.).

## Financial Summary
If one-pager scenario data is provided:
- Summarize all scenarios briefly, focusing on the best-performing one
- Include: total units, product type, estimated YOC, cost per unit, NOI per unit
- Compare scenario rents to HUD FMR where relevant
If no scenario data is provided, skip this section entirely.

## Risk Factors
Bullet list of 3-5 key risks: FEMA/flood risk, environmental concerns, market saturation, zoning constraints, construction cost factors, tax burden, etc. Only include risks that are supported by the data.

## Key Takeaway
One sentence summarizing the development opportunity.

RULES:
- Use $ with commas for currency (e.g., $1,234,567)
- Use % for percentages
- Reference specific data points, don't make up numbers
- If data is missing for a section, note it briefly and move on
- Keep the total response under 600 words
- Do NOT use the word "investment" — this is a development assessment`;

// ────────────────────────── Route ──────────────────────────

export async function POST(request: Request) {
    try {
        if (!GEMINI_API_KEY) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY must be configured in .env.local' },
                { status: 500 }
            );
        }

        const { parcelData, demographics, onePagers } = await request.json();

        // Diagnostic: log data availability
        console.log('[AI Summary] Data: parcel=%s, zoning=%s, demographics=%s (%s rings), fmr=%s, scenarios=%d',
            !!parcelData?.parcel, !!parcelData?.parcel?.zoning,
            !!demographics?.rings, demographics?.rings ? Object.keys(demographics.rings).join(',') : 'none',
            !!parcelData?.fmr, onePagers?.length || 0
        );

        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        // ─── Build enriched context for Pass 1 ───

        const pass1Context: Record<string, any> = {};

        // Parcel / public info
        const parcel = parcelData?.parcel;
        if (parcel) {
            const d = parcel.details || {};
            pass1Context.site = {
                address: d.address,
                city: d.city,
                state: d.state,
                zip: d.zip,
                county: d.county,
                lotSizeAcres: d.lotSizeAcres,
                lotSizeSF: d.lotSizeSF,
                yearBuilt: d.yearBuilt,
                stories: d.stories,
                numberOfUnits: d.numberOfUnits,
                numberOfBuildings: d.numberOfBuildings,
                buildingSF: d.buildingSF,
                useCode: d.useCodeDescription || d.useCode,
                landUse: d.landUse,
                lastSalePrice: d.lastSalePrice,
                lastSaleDate: d.lastSaleDate,
                legalDescription: d.legalDescription,
            };
            pass1Context.zoning = {
                code: parcel.zoning?.code,
                type: parcel.zoning?.type,
                subtype: parcel.zoning?.subtype,
                description: parcel.zoning?.description,
                municipality: parcel.zoning?.municipality,
                maxBuildingHeightFt: parcel.zoning?.maxBuildingHeightFt,
                maxFAR: parcel.zoning?.maxFAR,
                maxDensityPerAcre: parcel.zoning?.maxDensityPerAcre,
                maxCoveragePct: parcel.zoning?.maxCoveragePct,
                maxImperviousPct: parcel.zoning?.maxImperviousPct,
                minLotAreaSF: parcel.zoning?.minLotAreaSF,
                minFrontSetbackFt: parcel.zoning?.minFrontSetbackFt,
                minRearSetbackFt: parcel.zoning?.minRearSetbackFt,
                minSideSetbackFt: parcel.zoning?.minSideSetbackFt,
                minLandscapedPct: parcel.zoning?.minLandscapedPct,
                minOpenSpacePct: parcel.zoning?.minOpenSpacePct,
                permittedUses: parcel.zoning?.permittedUses,
                conditionalUses: parcel.zoning?.conditionalUses,
            };
            pass1Context.tax = {
                totalValue: parcel.tax?.totalValue,
                landValue: parcel.tax?.landValue,
                improvementValue: parcel.tax?.improvementValue,
                taxAmount: parcel.tax?.taxAmount,
                assessedYear: parcel.tax?.assessedYear,
            };
            pass1Context.fema = {
                nriRiskRating: d.femaNriRiskRating,
                floodZone: d.femaFloodZone,
                floodZoneSubtype: d.femaFloodZoneSubtype,
                highestElevation: d.highestElevation,
                lowestElevation: d.lowestElevation,
            };
            pass1Context.opportunityZone = {
                isQOZ: d.qualifiedOpportunityZone,
                censusTract: d.censusTract,
            };
            // Growth trends
            pass1Context.growthTrends = {
                populationGrowthPast5yr: d.populationGrowthPast5,
                populationGrowthNext5yr: d.populationGrowthNext5,
                housingGrowthPast5yr: d.housingGrowthPast5,
                housingGrowthNext5yr: d.housingGrowthNext5,
                householdIncomeGrowthNext5yr: d.householdIncomeGrowthNext5,
                housingAffordabilityIndex: d.housingAffordabilityIndex,
                populationDensity: d.populationDensity,
                medianHouseholdIncome: d.medianHouseholdIncome,
            };
        }

        // Tax summary
        const taxSummary = parcelData?.taxSummary;
        if (taxSummary) {
            pass1Context.taxSummary = {
                totalRealPropertyValue: taxSummary.totalRealPropertyValue,
                totalLandValue: taxSummary.totalLandValue,
                totalImprovementValue: taxSummary.totalImprovementValue,
                totalPersonalPropertyValue: taxSummary.totalPersonalPropertyValue,
                realPropertyCount: taxSummary.realPropertyCount,
                personalPropertyCount: taxSummary.personalPropertyCount,
            };
        }

        // HUD FMR
        const fmr = parcelData?.fmr;
        if (fmr) {
            pass1Context.hudFMR = {
                areaName: fmr.areaName,
                year: fmr.year,
                msaRents: fmr.msaRents,
                zipRents: fmr.zipRents,
                zip: fmr.zip,
            };
        }

        // Buildings
        const buildings = parcelData?.buildings;
        if (buildings && Array.isArray(buildings) && buildings.length > 0) {
            pass1Context.buildings = {
                count: buildings.length,
                totalFootprintSF: buildings.reduce((s: number, b: any) => s + (b.footprintSF || 0), 0),
            };
        }

        // Demographics — full data for all rings + block group
        if (demographics) {
            const rings = demographics.rings as any;
            const bg = demographics.block_group as any;

            if (rings) {
                pass1Context.demographics = {
                    source: 'ESRI GeoEnrichment',
                };
                for (const radius of ['1mi', '3mi', '5mi']) {
                    if (rings[radius]) {
                        pass1Context.demographics[radius] = {
                            population: rings[radius].population,
                            totalHouseholds: rings[radius].total_households,
                            avgHouseholdSize: rings[radius].avg_household_size,
                            medianHouseholdIncome: rings[radius].median_household_income,
                            avgHouseholdIncome: rings[radius].avg_household_income,
                            perCapitaIncome: rings[radius].per_capita_income,
                            medianAge: rings[radius].median_age,
                            populationDensity: rings[radius].population_density,
                            totalHousingUnits: rings[radius].total_housing_units,
                            renterPct: rings[radius].renter_pct,
                            ownerPct: rings[radius].owner_pct,
                            vacancyRatePct: rings[radius].vacancy_rate_pct,
                            medianRent: rings[radius].median_rent,
                            medianHomeValue: rings[radius].median_home_value,
                        };
                    }
                }
            }

            if (bg && Object.keys(bg).some((k: string) => !k.startsWith('_') && bg[k] != null)) {
                pass1Context.censusBlockGroup = {
                    population: bg.population,
                    medianAge: bg.median_age,
                    medianHouseholdIncome: bg.median_household_income,
                    perCapitaIncome: bg.per_capita_income,
                    numberOfHouseholds: bg.number_of_households,
                    medianRent: bg.median_rent,
                    medianHomeValue: bg.median_home_value,
                    renterOccupiedPct: bg.renter_occupied_pct,
                    ownerOccupiedPct: bg.owner_occupied_pct,
                    vacancyRatePct: bg.vacancy_rate_pct,
                    totalHousingUnits: bg.total_housing_units,
                    raceWhitePct: bg.race_white_pct,
                    raceBlackPct: bg.race_black_pct,
                    raceAsianPct: bg.race_asian_pct,
                    raceHispanicPct: bg.race_hispanic_pct,
                };
            }
        }

        // ─── Pass 1: Summarize demographic & public data ───

        console.log('[AI Summary] Pass 1: %d chars context → generating summary...', JSON.stringify(pass1Context).length);

        const pass1UserMessage = `${SUMMARIZE_PROMPT}

---

Here is the property and market data to summarize:

${JSON.stringify(pass1Context, null, 2)}

---

Now write the 300-400 word summary covering ALL the categories listed above. Be specific with numbers — cite actual values for income, rents, population, growth rates, zoning limits, etc.`;

        const pass1Response = await ai.models.generateContent({
            model: MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [{ text: pass1UserMessage }],
                },
            ],
            config: {
                temperature: 0.3,
                maxOutputTokens: 3000,
            },
        });

        const contextSummary = pass1Response.text || '';
        console.log('[AI Summary] Pass 1 complete: %d chars', contextSummary.length);

        // ─── Build Pass 2 context ───

        const pass2Context: Record<string, any> = {
            preSummarizedContext: contextSummary,
        };

        // One-pager scenarios
        if (onePagers && onePagers.length > 0) {
            pass2Context.scenarios = onePagers.map((op: any) => ({
                name: op.name,
                productType: op.product_type?.name,
                subProductType: op.sub_product_type?.name,
                totalUnits: op.total_units,
                efficiencyRatio: op.efficiency_ratio,
                hardCostPerNRSF: op.hard_cost_per_nrsf,
                landCost: op.land_cost,
                softCostPct: op.soft_cost_pct,
                vacancyRate: op.vacancy_rate,
                otherIncomePerUnitMonth: op.other_income_per_unit_month,
                mgmtFeePct: op.mgmt_fee_pct,
                taxMilRate: op.tax_mil_rate,
                // Calculated fields
                totalNRSF: op.calc_total_nrsf,
                totalGBSF: op.calc_total_gbsf,
                gpr: op.calc_gpr,
                netRevenue: op.calc_net_revenue,
                totalBudget: op.calc_total_budget,
                hardCost: op.calc_hard_cost,
                softCost: op.calc_soft_cost,
                totalOpex: op.calc_total_opex,
                noi: op.calc_noi,
                yoc: op.calc_yoc,
                costPerUnit: op.calc_cost_per_unit,
                noiPerUnit: op.calc_noi_per_unit,
                // Unit mix summary
                unitMix: op.unit_mix?.map((u: any) => ({
                    type: u.unit_type_label,
                    count: u.unit_count,
                    avgSF: u.avg_unit_sf,
                    monthlyRent: u.effective_monthly_rent || (u.rent_input_mode === 'per_sf' ? u.rent_per_sf * u.avg_unit_sf : u.rent_whole_dollar),
                })),
            }));
        }

        // ─── Pass 2: Full site assessment ───

        console.log('[AI Summary] Pass 2: Generating site assessment...');

        const pass2Response = await ai.models.generateContent({
            model: MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [{ text: `Here is the property data to analyze:\n\n${JSON.stringify(pass2Context, null, 2)}` }],
                },
            ],
            config: {
                systemInstruction: ASSESSMENT_PROMPT,
                temperature: 0.3,
                maxOutputTokens: 4000,
            },
        });

        const text = pass2Response.text || '';
        console.log(`[AI Summary] Pass 2 complete (${text.length} chars)`);

        return NextResponse.json({ summary: text });
    } catch (err: any) {
        console.error('[AI Summary] Error:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to generate summary' },
            { status: 500 }
        );
    }
}
