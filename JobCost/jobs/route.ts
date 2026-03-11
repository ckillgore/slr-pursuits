
import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search') || '';

        const pool = await getConnection();
        const requestBuilder = pool.request();

        // Base query - only active jobs
        let query = `
            SELECT TOP 50
                j.HMY as Job_ID,
                j.SCODE as Job_Code,
                COALESCE(j.SDESC, j.SBRIEFDESC, j.SCODE) as Job_Name,
                jt.SDESC as Job_Type,
                p.HMY as Property_ID,
                p.SCODE as Property_Code,
                p.SADDR1 as Property_Name
            FROM dbo.JOB j
            JOIN dbo.JOBPROPS jp ON j.HMY = jp.hJob
            JOIN dbo.PROPERTY p ON jp.hProp = p.HMY
            LEFT JOIN dbo.JOBTYPE jt ON j.IJOBTYPE = jt.HMY
            WHERE j.ISTATUS <> 3
        `;

        // Use parameterized query for search - prevents SQL injection
        if (search && search.length > 2) {
            requestBuilder.input('searchTerm', `%${search}%`);
            query += `
                AND (
                    j.SCODE LIKE @searchTerm OR 
                    j.SDESC LIKE @searchTerm OR
                    p.SADDR1 LIKE @searchTerm OR
                    p.SCODE LIKE @searchTerm
                )
            `;
        }

        query += " ORDER BY j.SCODE";

        const result = await requestBuilder.query(query);

        return NextResponse.json(result.recordset);
    } catch (error) {
        console.error('Jobs Search API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
    }
}
