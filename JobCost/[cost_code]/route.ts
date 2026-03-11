export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getDevelopmentJobs } from '@/lib/admin-db';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ property_id: string; cost_code: string }> }
) {
    try {
        const resolvedParams = await params;
        const { property_id, cost_code } = resolvedParams;

        // Decode Cost Code (handle URI encoding)
        const decodedCostCode = decodeURIComponent(cost_code);

        const pool = await getConnection();

        const searchParams = request.nextUrl.searchParams;
        const combinedIdsInfo = searchParams.get('combined_ids');

        // Compile list of Property IDs to query
        const propertyIds = new Set<string>([property_id]);
        if (combinedIdsInfo) {
            combinedIdsInfo.split(',').forEach(id => propertyIds.add(id));
        }

        let jobIds: number[] = [];

        for (const pid of propertyIds) {
            // Check for Manual Mapping Overrides (Returns SCODEs/Job Codes as strings)
            const forcedForPid = await getDevelopmentJobs(pid);

            if (forcedForPid && forcedForPid.length > 0) {
                // We have SCODEs, we need to get their HMY (Job IDs)
                // forcedForPid is string[] (Job Codes)
                const codes = forcedForPid.map(c => `'${c.replace(/'/g, "''")}'`).join(',');

                const mappedJobsResult = await pool.request()
                    .query(`
                        SELECT HMY FROM dbo.JOB WHERE SCODE IN (${codes})
                    `);

                jobIds.push(...mappedJobsResult.recordset.map((j: any) => j.HMY));

            } else {
                const escapedPropertyId = pid.replace(/'/g, "''");
                // Fetch Job IDs for this property standard way
                const jobsResult = await pool.request()
                    .query(`
                        SELECT j.HMY AS Job_ID
                        FROM dbo.JOB j
                        JOIN dbo.JOBPROPS jp ON j.HMY = jp.hJob
                        JOIN dbo.PROPERTY p ON jp.hProp = p.HMY
                        WHERE p.SCODE = '${escapedPropertyId}'
                            AND j.ISTATUS <> 3
                            AND jp.istatus <> 3
                    `);
                jobIds.push(...jobsResult.recordset.map((j: any) => j.Job_ID));
            }
        }

        if (jobIds.length === 0) {
            return NextResponse.json({ transactions: [] });
        }

        const jobIdsStr = jobIds.join(',');

        // Query DRAWDET for granular draw line items (more detailed than JOBDETL)
        // DRAWDET contains individual draw request line items with amounts per cost code
        // Join to TRANS -> PERSON to get vendor name and transaction description
        const result = await pool.request()
            .input('costCode', decodedCostCode)
            .query(`
                SELECT 
                    dd.HJOB as JobID,
                    dd.DTDATE as Date,
                    ISNULL(p.ULASTNAME, 'Unknown Vendor') as Vendor,
                    ISNULL(t.SNOTES, 'Draw Request') as Description,
                    dd.CEXP as Amount,
                    LTRIM(RTRIM(cat.sCode)) as Cost_Code
                FROM dbo.DRAWDET dd
                JOIN dbo.CATEGORY cat ON dd.HCATEG = cat.hMy
                LEFT JOIN dbo.TRANS t ON dd.HTRAN = t.HMY
                LEFT JOIN dbo.PERSON p ON t.HPERSON = p.HMY
                WHERE dd.HJOB IN (${jobIdsStr})
                  -- Normalize input and db code for comparison (remove dashes, spaces)
                  AND REPLACE(REPLACE(LTRIM(RTRIM(cat.sCode)), '-', ''), ' ', '') = REPLACE(REPLACE(@costCode, '-', ''), ' ', '')
                  AND dd.CEXP <> 0
                ORDER BY dd.DTDATE DESC
            `);

        let transactions: any[] = result.recordset;

        // Deduplication Logic for Consolidated Views
        if (jobIds.length > 1 && transactions.length > 0) {
            // Group by Job ID
            const jobGroups: Record<number, { sum: number, rows: any[] }> = {};

            transactions.forEach(t => {
                if (!jobGroups[t.JobID]) {
                    jobGroups[t.JobID] = { sum: 0, rows: [] };
                }
                jobGroups[t.JobID].rows.push(t);
                jobGroups[t.JobID].sum += t.Amount;
            });

            // Identify duplicates (Jobs with very similar sums)
            // We want to keep the job with the MOST detail (most rows)
            const jobIDs = Object.keys(jobGroups).map(Number);
            const jobsToExclude = new Set<number>();

            for (let i = 0; i < jobIDs.length; i++) {
                for (let j = i + 1; j < jobIDs.length; j++) {
                    const jobA = jobGroups[jobIDs[i]];
                    const jobB = jobGroups[jobIDs[j]];

                    // Check if sums match (within $1.00 tolerance for rounding)
                    if (Math.abs(jobA.sum - jobB.sum) < 1.0) {
                        // Duplicate detected!
                        // Logic: Keep the one with MORE rows.
                        // If one has 1 row and other has 20, the 1-row is the summary.
                        // If equal rows... keep the older one? Or keep both (risk!)? 
                        // For now, removing the one with FEWER rows is the safest bet for "Summary vs Detail".
                        if (jobA.rows.length > jobB.rows.length) {
                            jobsToExclude.add(jobIDs[j]);
                        } else if (jobB.rows.length > jobA.rows.length) {
                            jobsToExclude.add(jobIDs[i]);
                        } else {
                            // Same rows, same amount. Likely true duplicate or split?
                            // If description is "Job Cost Entry" (summary) vs something else?
                            // Hard to say. Keep both if unsure to avoid data loss, 
                            // OR logic: Keep the one with Earlier Date?
                            // Let's stick to Row Count for now as it solves the specific reported issue.
                        }
                    }
                }
            }

            if (jobsToExclude.size > 0) {
                transactions = transactions.filter(t => !jobsToExclude.has(t.JobID));
            }
        }

        // Remove JobID from final output to keep clean structure
        const finalTransactions = transactions.map(({ JobID, ...rest }: any) => rest);

        return NextResponse.json({
            transactions: finalTransactions
        });

    } catch (error: any) {
        console.error('Transaction API Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch transactions', details: error.message },
            { status: 500 }
        );
    }
}
