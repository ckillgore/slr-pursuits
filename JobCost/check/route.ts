import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import sql from 'mssql';

import { getDevelopmentJobs } from '@/lib/admin-db';

/**
 * Check if a property has associated Jobs
 * Returns { hasJobs: boolean, jobCount: number }
 * Used by sidebar to conditionally show Job Cost navigation
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ property_id: string }> }
) {
    try {
        const { property_id } = await params;
        const pool = await getConnection();

        // Check for manual override first
        const forcedJobIds = await getDevelopmentJobs(property_id);
        if (forcedJobIds && forcedJobIds.length > 0) {
            return NextResponse.json({
                hasJobs: true,
                jobCount: forcedJobIds.length
            });
        }

        // Using direct SQL to avoid mssql parameter validation issue
        const escapedPropertyId = property_id.replace(/'/g, "''");
        const result = await pool.request()
            .query(`
                SELECT COUNT(*) AS JobCount
                FROM dbo.JOB j
                INNER JOIN dbo.PROPERTY p ON j.HPROPERTY = p.HMY
                WHERE p.SCODE = '${escapedPropertyId}'
                  AND j.ISTATUS <> 3
            `);

        const jobCount = result.recordset[0]?.JobCount || 0;

        return NextResponse.json({
            hasJobs: jobCount > 0,
            jobCount
        });

    } catch (error) {
        console.error('Job Check API Error:', error);
        return NextResponse.json({ hasJobs: false, jobCount: 0 });
    }
}
