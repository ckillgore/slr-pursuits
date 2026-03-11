export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getDevelopmentJobs, resolveConsolidatedProperties } from '@/lib/admin-db';
import sql from 'mssql';
import { JobInfo, JobCostMatrixRow, JobCostSummary, CostCodeRow, DrawColumn } from '@/types/job-cost';

/**
 * Job Cost Summary API
 * Returns executive summary metrics and matrix data for the Job Cost dashboard
 * 
 * Step 1: Resolve Property ID to Job IDs (1-to-Many relationship)
 * Step 2: Query the Job Cost Matrix view with those Job IDs
 * Step 3: Aggregate and return summary + matrix data
 */

// import { getForcedJobIds } from '@/lib/job-mapping'; // DEPRECATED
import categoryMappingRaw from '../../data/category-mapping.json';

const categoryMapping = categoryMappingRaw as Record<string, string>;

// Original logic: Maps "02" -> "Site Work" (Subsections)
function getMajorCategory(costCode: string, originalGroup: string): string {
    const cleanCode = costCode.trim();
    if (cleanCode.length >= 2) {
        const prefix = cleanCode.substring(0, 2);
        if (categoryMapping[prefix]) {
            return categoryMapping[prefix];
        }
    }
    return originalGroup; // Fallback
}


// New logic: Maps prefixes to Land/Hard/Soft for Summary Cards
function getSummaryGroup(costCode: string, originalGroup: string): string {
    const cleanCode = costCode.trim();
    if (cleanCode.length >= 2) {
        const prefix = cleanCode.substring(0, 2);

        // Land Costs (50-51)
        if (['50', '51'].includes(prefix)) {
            return 'Land Costs';
        }

        // Hard Costs (01-49)
        // Includes General Conditions (01), Site Work (02), Vertical (03-10, 14, 86?), Fees (15, 49), Deposits (48)
        // Note: 86 is Retail (Soft/Leasing?), 14 is Retail (Hard). 
        // Based on CSV "Total Hard Costs" at 49, we define 01-49 as Hard.
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

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ property_id: string }> }
) {
    try {
        const { property_id } = await params;
        const pool = await getConnection();
        const searchParams = request.nextUrl.searchParams;
        const combinedIdsInfo = searchParams.get('combined_ids');

        // Compile list of Property IDs to query
        const propertyIds = new Set<string>();

        // Resolve consolidation group first
        const consolidatedIds = await resolveConsolidatedProperties(property_id);
        consolidatedIds.forEach(id => propertyIds.add(id));

        if (combinedIdsInfo) {
            combinedIdsInfo.split(',').forEach(id => propertyIds.add(id));
        }

        let jobIds: number[] = [];
        let jobs: JobInfo[] = [];

        // Check for DB-configured Development Jobs for the PRIMARY property
        const forcedJobIds = await getDevelopmentJobs(property_id);

        for (const pid of propertyIds) {
            const forcedForPid = await getDevelopmentJobs(pid);

            if (forcedForPid && forcedForPid.length > 0) {
                // forcedForPid are SCODEs (strings) here
                // Use parameterized query or safe string injection if trusted (mapped from DB)
                // Better to map to quoted strings for IN clause
                const quotedCodes = forcedForPid.map(c => `'${c.replace(/'/g, "''")}'`).join(',');

                const forcedJobsResult = await pool.request()
                    .query(`
                        SELECT 
                            j.HMY AS Job_ID, 
                            j.SCODE AS Job_Code, 
                            COALESCE(j.SDESC, j.SBRIEFDESC, j.SCODE) AS Job_Name,
                            j.ISTATUS AS Job_Status,
                            jt.SDESC AS Job_Type
                        FROM dbo.JOB j
                        LEFT JOIN dbo.JOBTYPE jt ON j.IJOBTYPE = jt.HMY
                        WHERE j.SCODE IN (${quotedCodes})
                    `);
                jobs.push(...forcedJobsResult.recordset);
                // Push the resolved Job_IDs (HMY) to the list for subsequent queries
                jobIds.push(...forcedJobsResult.recordset.map((j: any) => j.Job_ID));
            } else {
                const escapedPropertyId = pid.replace(/'/g, "''");
                const jobsResult = await pool.request()
                    .query(`
                        SELECT 
                            j.HMY AS Job_ID,
                            j.SCODE AS Job_Code,
                            COALESCE(j.SDESC, j.SBRIEFDESC, j.SCODE) AS Job_Name,
                            j.ISTATUS AS Job_Status,
                            jt.SDESC AS Job_Type
                        FROM dbo.JOB j
                        JOIN dbo.JOBPROPS jp ON j.HMY = jp.hJob
                        JOIN dbo.PROPERTY p ON jp.hProp = p.HMY
                        LEFT JOIN dbo.JOBTYPE jt ON j.IJOBTYPE = jt.HMY
                        WHERE p.SCODE = '${escapedPropertyId}'
                          AND j.ISTATUS <> 3
                          AND jp.istatus <> 3
                    `);
                jobs.push(...jobsResult.recordset);
                jobIds.push(...jobsResult.recordset.map((j: any) => j.Job_ID));
            }
        }

        if (jobIds.length === 0) {
            return NextResponse.json({
                hasJobs: false,
                jobs: [],
                summary: [],
                matrix: [],
                draws: [],
                totals: { totalBudget: 0, totalSpent: 0, totalRemaining: 0 }
            });
        }

        // Step 2: Query the Job Cost Matrix view
        // We keep the original query for metadata, budgets, and draw history
        const jobIdsStr = jobIds.join(',');
        const matrixResult = await pool.request()
            .query(`
                SELECT 
                    Job_ID,
                    Job_Name,
                    Job_Type,
                    Cost_Group,
                    Cost_Code,
                    Category_Name,
                    Draw_Number,
                    Draw_Date,
                    Original_Budget,
                    Revised_Budget,
                    Base_Contract_Billed,
                    CO_Billed,
                    Total_Billed_This_Draw,
                    Total_Authorized_CO_Budget
                FROM dbo.vw_Web_JobCost_Master_Matrix
                WHERE Job_ID IN (${jobIdsStr})
                ORDER BY Cost_Code, Draw_Date
            `);

        const matrixRows: JobCostMatrixRow[] = matrixResult.recordset;

        // Step 3a: Query Actuals from JOBDETL (Source of Truth for Spent)
        // Joined with CATEGORY to get the Cost Code string
        const activeJobIdsStr = jobIds.join(',');
        const actualsResult = await pool.request()
            .query(`
                SELECT 
                    cat.sCode as Cost_Code, 
                    SUM(jd.SINVOICED) as Total_Spent
                FROM dbo.JOBDETL jd
                LEFT JOIN dbo.CATEGORY cat ON jd.HCATEG = cat.hMy
                WHERE jd.HJOB IN (${activeJobIdsStr})
                GROUP BY cat.sCode
            `);

        const actualsMap = new Map<string, number>();
        actualsResult.recordset.forEach((row: any) => {
            if (row.Cost_Code) {
                actualsMap.set(row.Cost_Code.trim(), row.Total_Spent);
            }
        });

        // Step 3b: Pivot matrix data into cost code rows
        const costCodeMap = new Map<string, CostCodeRow>();
        const drawsMap = new Map<string, Date | string>();

        for (const row of matrixRows) {
            // Track Draw Columns
            if (row.Draw_Number && !drawsMap.has(row.Draw_Number)) {
                drawsMap.set(row.Draw_Number, row.Draw_Date);
            }

            const key = row.Cost_Code.trim();
            const originalBudget = Number(row.Original_Budget) || 0;
            const revisedBudget = Number(row.Revised_Budget) || 0;
            const billedThisRow = Number(row.Total_Billed_This_Draw) || 0;

            if (!costCodeMap.has(key)) {
                costCodeMap.set(key, {
                    Job_ID: row.Job_ID,
                    Job_Type: row.Job_Type,
                    Cost_Group: getSummaryGroup(row.Cost_Code, row.Cost_Group),
                    Major_Category: getMajorCategory(row.Cost_Code, row.Cost_Group),
                    Cost_Code: row.Cost_Code.trim(),
                    Category_Name: row.Category_Name,
                    Original_Budget: originalBudget,
                    Approved_Revisions: revisedBudget - originalBudget,
                    Pending_Revisions: 0,
                    Revised_Budget: revisedBudget,
                    Total_Spent: 0, // Will be populated from actualsMap
                    Variance: 0,
                    Pct_Complete: 0,
                    draws: {}
                });
            } else {
                const existing = costCodeMap.get(key)!;
                // Update Budgets if they change over time (take latest/max)
                existing.Original_Budget = Math.max(existing.Original_Budget, originalBudget);
                existing.Revised_Budget = Math.max(existing.Revised_Budget, revisedBudget);
                existing.Approved_Revisions = existing.Revised_Budget - existing.Original_Budget;
            }

            // Draw History Logic:
            // Validating this is tricky with duplicates. 
            // For now, we will aggregate simply to populate the grid detail columns if needed.
            // But relying on actualsMap for the "Total Spent" column is key.
            const costCode = costCodeMap.get(key)!;
            if (row.Draw_Number) {
                // Warning: This might still sum up duplicates in the expandable draw history
                // But the main "Total Spent" column will be correct.
                costCode.draws[row.Draw_Number] = (costCode.draws[row.Draw_Number] || 0) + billedThisRow;
            }
        }

        // Apply Verified Actuals
        for (const [code, spent] of actualsMap) {
            if (costCodeMap.has(code)) {
                costCodeMap.get(code)!.Total_Spent = spent;
            } else {
                // If code exists in Actuals but not in Matrix main query (unlikely given same source)
            }
        }

        const draws: DrawColumn[] = Array.from(drawsMap.entries())
            .map(([number, date]) => ({ Draw_Number: number, Draw_Date: date }))
            .sort((a, b) => {
                const dateA = new Date(a.Draw_Date);
                const dateB = new Date(b.Draw_Date);
                return dateA.getTime() - dateB.getTime();
            });

        // Calculate variance and pct complete
        const costCodes: CostCodeRow[] = Array.from(costCodeMap.values())
            .map(row => ({
                ...row,
                Variance: row.Revised_Budget - row.Total_Spent,
                Pct_Complete: row.Revised_Budget > 0 ? (row.Total_Spent / row.Revised_Budget) * 100 : 0
            }))
            .filter(row => {
                const hasBudget = Math.abs(row.Original_Budget) > 0.01 || Math.abs(row.Revised_Budget) > 0.01;
                const hasSpent = Math.abs(row.Total_Spent) > 0.01;
                return hasBudget || hasSpent;
            });

        // Sort cost codes
        costCodes.sort((a, b) => a.Cost_Code.localeCompare(b.Cost_Code));

        // Step 5: Calculate Summary Totals from Validated Cost Codes
        const summaryMap = new Map<string, JobCostSummary>();

        for (const code of costCodes) {
            if (!summaryMap.has(code.Cost_Group)) {
                summaryMap.set(code.Cost_Group, {
                    Cost_Group: code.Cost_Group,
                    Original_Budget: 0,
                    Approved_Revisions: 0,
                    Pending_Revisions: 0,
                    Total_Budget: 0,
                    Total_Spent: 0,
                    Remaining: 0,
                    Pct_Complete: 0
                });
            }
            const group = summaryMap.get(code.Cost_Group)!;
            group.Original_Budget += code.Original_Budget;
            group.Approved_Revisions += code.Approved_Revisions;
            group.Total_Budget += code.Revised_Budget;
            group.Total_Spent += code.Total_Spent;
        }

        const summary: JobCostSummary[] = Array.from(summaryMap.values()).map(g => ({
            ...g,
            Remaining: g.Total_Budget - g.Total_Spent,
            Pct_Complete: g.Total_Budget > 0 ? (g.Total_Spent / g.Total_Budget) * 100 : 0
        }));

        const totals = {
            totalBudget: summary.reduce((sum, s) => sum + s.Total_Budget, 0),
            totalSpent: summary.reduce((sum, s) => sum + s.Total_Spent, 0),
            totalRemaining: summary.reduce((sum, s) => sum + s.Remaining, 0)
        };

        return NextResponse.json({
            hasJobs: true,
            jobs,
            summary,
            costCodes,
            draws,
            totals
        });

    } catch (error: any) {
        console.error('Job Cost API Error:', error);
        return NextResponse.json(
            {
                error: 'Failed to fetch job cost data',
                details: error.message,
                stack: error.stack
            },
            { status: 500 }
        );
    }
}
