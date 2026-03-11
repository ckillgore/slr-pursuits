export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getDevelopmentJobs, resolveConsolidatedProperties, getAdminConnection } from '@/lib/admin-db';
import categoryMappingRaw from '../data/category-mapping.json';

const categoryMapping = categoryMappingRaw as Record<string, string>;

// Maps cost code prefix to Major Category (subsection)
function getMajorCategory(costCode: string, originalGroup: string): string {
    const cleanCode = costCode.trim();
    if (cleanCode.length >= 2) {
        const prefix = cleanCode.substring(0, 2);
        if (categoryMapping[prefix]) {
            return categoryMapping[prefix];
        }
    }
    return originalGroup;
}

// Maps prefixes to Land/Hard/Soft for Summary grouping
function getSummaryGroup(costCode: string, originalGroup: string): string {
    const cleanCode = costCode.trim();
    if (cleanCode.length >= 2) {
        const prefix = cleanCode.substring(0, 2);

        // Land Costs (50-51)
        if (['50', '51'].includes(prefix)) {
            return 'Land Costs';
        }

        // Hard Costs (01-49)
        const pVal = parseInt(prefix, 10);
        if (pVal >= 1 && pVal <= 49) {
            return 'Hard Costs';
        }

        // Soft Costs (52-99)
        if (pVal >= 52 && pVal <= 99) {
            return 'Soft Costs';
        }
    }
    return originalGroup;
}

interface ComparisonProject {
    Property_Code: string;
    Property_Name: string;
    Total_Units: number | null;
    Total_SF: number | null;
    Gross_SF: number | null; // Added
    jobs: Array<{ Job_ID: number; Job_Name: string; Job_Type: string | null }>;
}

interface ComparisonCostCode {
    Cost_Code: string;
    Category_Name: string;
    Cost_Group: string;
    Major_Category: string;
    projectBudgets: Record<string, number>;
}

/**
 * Job Cost Comparison API
 * Returns comparison data for multiple projects side-by-side
 * 
 * Query Parameters:
 * - property_ids: Comma-separated list of Property_Codes to compare
 * - category_filter: Optional comma-separated Major Category names for spotlight
 */
export async function GET(request: NextRequest) {
    try {
        const pool = await getConnection();
        const adminPool = await getAdminConnection(); // Connect to Asset_Intelligence

        const searchParams = request.nextUrl.searchParams;
        const propertyIdsParam = searchParams.get('property_ids');
        const categoryFilter = searchParams.get('category_filter');

        if (!propertyIdsParam) {
            return NextResponse.json({
                error: 'Missing property_ids parameter',
                projects: [],
                costCodes: []
            }, { status: 400 });
        }

        const propertyIds = propertyIdsParam.split(',').filter(id => id.trim());

        if (propertyIds.length === 0) {
            return NextResponse.json({
                projects: [],
                costCodes: [],
                majorCategories: []
            });
        }

        // Limit to 6 projects for performance
        const limitedPropertyIds = propertyIds.slice(0, 6);

        // Fetch project metrics (Gross SF, Net SF override) from Admin DB
        const metricsMap = new Map<string, { Gross_SF: number | null; Net_Rentable_SF: number | null }>();
        try {
            const quotedIds = limitedPropertyIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
            const metricsResult = await adminPool.request().query(`
                SELECT Property_Code, Gross_SF, Net_Rentable_SF
                FROM App_Project_Metrics
                WHERE Property_Code IN (${quotedIds})
            `);
            for (const row of metricsResult.recordset) {
                metricsMap.set(row.Property_Code, {
                    Gross_SF: row.Gross_SF,
                    Net_Rentable_SF: row.Net_Rentable_SF
                });
            }
        } catch (err) {
            console.error('Failed to fetch project metrics:', err);
            // Non-fatal, continue without metrics
        }

        const projects: ComparisonProject[] = [];
        const allJobIds: number[] = [];
        const jobIdToPropertyCode: Map<number, string> = new Map();

        // Step 1: For each property, get metadata and job IDs
        for (const propertyId of limitedPropertyIds) {
            // Get property metadata
            const escapedId = propertyId.replace(/'/g, "''");
            const propInfoResult = await pool.request()
                .query(`
                    SELECT 
                        Property_Code,
                        Property_Name,
                        Total_Units,
                        Total_Net_Rentable_SqFt as Total_SF
                    FROM dbo.vw_WebApp_PropertyInfo
                    WHERE Property_Code = '${escapedId}'
                `);

            const propInfo = propInfoResult.recordset[0] || {
                Property_Code: propertyId,
                Property_Name: propertyId,
                Total_Units: null,
                Total_SF: null
            };

            // Merge with metrics
            const metrics = metricsMap.get(propertyId);
            const totalSF = metrics?.Net_Rentable_SF || propInfo.Total_SF; // Prefer custom metrics if available
            const grossSF = metrics?.Gross_SF || null;

            // Resolve consolidated properties for this property
            const consolidatedIds = await resolveConsolidatedProperties(propertyId);
            const allPropertyIds = new Set<string>(consolidatedIds);
            allPropertyIds.add(propertyId);

            // Get jobs for all consolidated properties
            const jobs: Array<{ Job_ID: number; Job_Name: string; Job_Type: string | null }> = [];

            for (const pid of allPropertyIds) {
                const forcedJobIds = await getDevelopmentJobs(pid);

                if (forcedJobIds && forcedJobIds.length > 0) {
                    const quotedCodes = forcedJobIds.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
                    const jobsResult = await pool.request()
                        .query(`
                            SELECT 
                                j.HMY AS Job_ID,
                                COALESCE(j.SDESC, j.SBRIEFDESC, j.SCODE) AS Job_Name,
                                jt.SDESC AS Job_Type
                            FROM dbo.JOB j
                            LEFT JOIN dbo.JOBTYPE jt ON j.IJOBTYPE = jt.HMY
                            WHERE j.SCODE IN (${quotedCodes})
                        `);
                    jobs.push(...jobsResult.recordset);
                } else {
                    const escapedPid = pid.replace(/'/g, "''");
                    const jobsResult = await pool.request()
                        .query(`
                            SELECT 
                                j.HMY AS Job_ID,
                                COALESCE(j.SDESC, j.SBRIEFDESC, j.SCODE) AS Job_Name,
                                jt.SDESC AS Job_Type
                            FROM dbo.JOB j
                            JOIN dbo.JOBPROPS jp ON j.HMY = jp.hJob
                            JOIN dbo.PROPERTY p ON jp.hProp = p.HMY
                            LEFT JOIN dbo.JOBTYPE jt ON j.IJOBTYPE = jt.HMY
                            WHERE p.SCODE = '${escapedPid}'
                              AND j.ISTATUS <> 3
                              AND jp.istatus <> 3
                        `);
                    jobs.push(...jobsResult.recordset);
                }
            }

            // Track job IDs to property code mapping
            for (const job of jobs) {
                allJobIds.push(job.Job_ID);
                jobIdToPropertyCode.set(job.Job_ID, propertyId);
            }

            projects.push({
                Property_Code: propertyId,
                Property_Name: propInfo.Property_Name,
                Total_Units: propInfo.Total_Units || null,
                Total_SF: totalSF,
                Gross_SF: grossSF,
                jobs
            });
        }

        if (allJobIds.length === 0) {
            return NextResponse.json({
                projects,
                costCodes: [],
                majorCategories: []
            });
        }

        // Step 2: Query job cost data for all jobs
        const jobIdsStr = allJobIds.join(',');
        const matrixResult = await pool.request()
            .query(`
                SELECT 
                    Job_ID,
                    Cost_Group,
                    Cost_Code,
                    Category_Name,
                    Original_Budget,
                    Revised_Budget
                FROM dbo.vw_Web_JobCost_Master_Matrix
                WHERE Job_ID IN (${jobIdsStr})
            `);

        // Step 3: Aggregate by Cost Code per property using MAX (not SUM)
        // The matrix view has one row per draw, but budget values are the same across draws
        // We need to track: Property_Code -> Cost_Code -> budget (take max)
        const propertyBudgets = new Map<string, Map<string, number>>(); // Property -> CostCode -> Max Budget
        const costCodeInfo = new Map<string, { Category_Name: string; Cost_Group: string; Major_Category: string }>();
        const majorCategoriesSet = new Set<string>();

        for (const row of matrixResult.recordset) {
            const costCode = row.Cost_Code?.trim();
            if (!costCode) continue;

            const propertyCode = jobIdToPropertyCode.get(row.Job_ID);
            if (!propertyCode) continue;

            const costGroup = getSummaryGroup(costCode, row.Cost_Group);
            const majorCategory = getMajorCategory(costCode, row.Cost_Group);
            majorCategoriesSet.add(majorCategory);

            const revisedBudget = Number(row.Revised_Budget) || 0;

            // Store cost code metadata
            if (!costCodeInfo.has(costCode)) {
                costCodeInfo.set(costCode, {
                    Category_Name: row.Category_Name || '',
                    Cost_Group: costGroup,
                    Major_Category: majorCategory
                });
            }

            // Initialize property map if needed
            if (!propertyBudgets.has(propertyCode)) {
                propertyBudgets.set(propertyCode, new Map());
            }

            // Use MAX for budget (same cost code appears multiple times for different draws)
            const currentMax = propertyBudgets.get(propertyCode)!.get(costCode) || 0;
            propertyBudgets.get(propertyCode)!.set(costCode, Math.max(currentMax, revisedBudget));
        }

        // Build final cost codes array
        const costCodeMap = new Map<string, ComparisonCostCode>();

        for (const [propertyCode, budgetMap] of propertyBudgets) {
            for (const [costCode, budget] of budgetMap) {
                if (!costCodeMap.has(costCode)) {
                    const info = costCodeInfo.get(costCode)!;
                    costCodeMap.set(costCode, {
                        Cost_Code: costCode,
                        Category_Name: info.Category_Name,
                        Cost_Group: info.Cost_Group,
                        Major_Category: info.Major_Category,
                        projectBudgets: {}
                    });
                }
                costCodeMap.get(costCode)!.projectBudgets[propertyCode] = budget;
            }
        }

        // Convert to array and sort by cost code prefix numerically
        let costCodes = Array.from(costCodeMap.values())
            .filter(cc => {
                // Filter out rows with no budget
                const totalBudget = Object.values(cc.projectBudgets).reduce((sum, v) => sum + v, 0);
                return Math.abs(totalBudget) > 0.01;
            })
            .sort((a, b) => {
                // Sort by numeric prefix first (01, 02, etc.), then by full code
                const getPrefix = (code: string) => {
                    const parts = code.split(/[-\.]/);
                    return parseInt(parts[0], 10) || 9999;
                };
                const prefixA = getPrefix(a.Cost_Code);
                const prefixB = getPrefix(b.Cost_Code);
                if (prefixA !== prefixB) return prefixA - prefixB;
                return a.Cost_Code.localeCompare(b.Cost_Code);
            });

        // Apply category filter if specified
        if (categoryFilter) {
            const filterCategories = categoryFilter.split(',').map(c => c.trim().toLowerCase());
            costCodes = costCodes.filter(cc =>
                filterCategories.includes(cc.Major_Category.toLowerCase())
            );
        }

        // Sort major categories by their typical cost code prefix order
        const majorCategories = Array.from(majorCategoriesSet).sort((a, b) => {
            // Try to find a representative cost code for ordering
            const getOrder = (cat: string) => {
                const cc = costCodes.find(c => c.Major_Category === cat);
                if (!cc) return 9999;
                const parts = cc.Cost_Code.split(/[-\.]/);
                return parseInt(parts[0], 10) || 9999;
            };
            return getOrder(a) - getOrder(b);
        });

        return NextResponse.json({
            projects,
            costCodes,
            majorCategories
        });

    } catch (error: any) {
        console.error('Job Cost Comparison API Error:', error);
        return NextResponse.json(
            {
                error: 'Failed to fetch comparison data',
                details: error.message,
                stack: error.stack
            },
            { status: 500 }
        );
    }
}
