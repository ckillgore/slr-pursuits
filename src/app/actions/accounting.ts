'use server';

import { createYardiClient } from '@/lib/supabase/yardi-client';

export type YardiGLAccountSummary = {
    account_code: string;
    account_name: string;
    total_amount: number;
};

export type YardiPursuitCostSummary = {
    property_code: string;
    property_name: string;
    earnest_money: number;  // 11720000
    wip: number;            // 11410000
    wip_contra: number;     // 11415000
    net_cost: number;
    synced_at: string;
};

export async function fetchPursuitGLTotals(propertyCodes: string[]): Promise<YardiPursuitCostSummary[]> {
    if (!propertyCodes.length) return [];
    const client = createYardiClient();

    const { data: rows, error } = await client
        .from('gl_period_totals')
        .select('property_code, property_name, account_code, actual_period_amount, actual_beginning_balance, synced_at, financial_period')
        .in('property_code', propertyCodes)
        .in('account_code', ['11720000', '11410000', '11415000'])
        .order('financial_period', { ascending: false });

    if (error) {
        console.error('Failed to fetch GL Totals from Yardi:', error);
        throw new Error('Failed to fetch accounting data');
    }

    const propertyMaxPeriodMap = new Map<string, string>(); // property_code -> max_period

    // First pass: find the maximum financial period for each property
    for (const row of (rows || [])) {
        if (!propertyMaxPeriodMap.has(row.property_code)) {
            propertyMaxPeriodMap.set(row.property_code, row.financial_period);
        }
    }

    const summaryMap = new Map<string, YardiPursuitCostSummary>();

    // Second pass: sum all rows that match their property's max financial period
    for (const row of (rows || [])) {
        if (row.financial_period !== propertyMaxPeriodMap.get(row.property_code)) {
            continue;
        }

        if (!summaryMap.has(row.property_code)) {
            summaryMap.set(row.property_code, {
                property_code: row.property_code,
                property_name: row.property_name || '',
                earnest_money: 0,
                wip: 0,
                wip_contra: 0,
                net_cost: 0,
                synced_at: row.synced_at || new Date().toISOString()
            });
        }

        const summary = summaryMap.get(row.property_code)!;
        
        // Handle synced_at dates (keep the most recent)
        if (row.synced_at) {
            const rowDate = new Date(row.synced_at);
            if (!isNaN(rowDate.getTime())) {
                if (!summary.synced_at) {
                    summary.synced_at = row.synced_at;
                } else {
                    const sumDate = new Date(summary.synced_at);
                    if (!isNaN(sumDate.getTime()) && rowDate > sumDate) {
                        summary.synced_at = row.synced_at;
                    }
                }
            }
        }

        const amount = Number(row.actual_beginning_balance || 0) + Number(row.actual_period_amount || 0);

        if (row.account_code === '11720000') summary.earnest_money += amount;
        else if (row.account_code === '11410000') summary.wip += amount;
        else if (row.account_code === '11415000') summary.wip_contra += amount;
    }

    // Calculate net cost
    for (const summary of summaryMap.values()) {
        summary.net_cost = summary.earnest_money + summary.wip + summary.wip_contra;
    }

    return Array.from(summaryMap.values());
}

export type YardiDetailedGLSummary = {
    account_code: string;
    account_name: string;
    total_amount: number;
};

export async function fetchEntityGLTotals(propertyCode: string): Promise<YardiDetailedGLSummary[]> {
    if (!propertyCode) return [];
    const client = createYardiClient();

    // Fetch all accounts for this property
    const { data: rows, error } = await client
        .from('gl_period_totals')
        .select('account_code, account_name, actual_period_amount, actual_beginning_balance, financial_period')
        .eq('property_code', propertyCode)
        .order('financial_period', { ascending: false });

    if (error) {
        console.error(`Failed to fetch GL Totals for entity ${propertyCode}:`, error);
        throw new Error('Failed to fetch detailed accounting data');
    }

    const maxPeriodMap = new Map<string, string>(); // account_code -> max_period

    // First pass: find the maximum financial period for each account
    for (const row of (rows || [])) {
        if (!maxPeriodMap.has(row.account_code)) {
            maxPeriodMap.set(row.account_code, row.financial_period);
        }
    }

    const summaryMap = new Map<string, YardiDetailedGLSummary>();

    // Second pass: sum all rows that match their account's max financial period
    for (const row of (rows || [])) {
        if (row.financial_period !== maxPeriodMap.get(row.account_code)) {
            continue;
        }

        const accountKey = row.account_code;
        
        if (!summaryMap.has(accountKey)) {
            summaryMap.set(accountKey, {
                account_code: accountKey,
                account_name: row.account_name || '',
                total_amount: 0
            });
        }

        const summary = summaryMap.get(accountKey)!;
        summary.total_amount += Number(row.actual_beginning_balance || 0) + Number(row.actual_period_amount || 0);
    }

    // Filter out rows with 0 balance
    const results = Array.from(summaryMap.values())
        .filter(row => Math.abs(row.total_amount) > 0)
        .sort((a, b) => a.account_code.localeCompare(b.account_code));

    return results;
}

export async function fetchAllPursuitGLTotals(): Promise<YardiPursuitCostSummary[]> {
    const client = createYardiClient();

    const { data: rows, error } = await client
        .from('gl_period_totals')
        .select('property_code, property_name, account_code, account_name, actual_period_amount, actual_beginning_balance, synced_at, financial_period')
        .in('account_code', ['11720000', '11410000', '11415000'])
        .like('property_code', '11%') // pursuits start with 11
        .order('financial_period', { ascending: false });

    if (error) {
        console.error('Failed to fetch Global GL Totals from Yardi:', error);
        throw new Error('Failed to fetch global accounting data');
    }

    const propertyMaxPeriodMap = new Map<string, string>(); // property_code -> max_period

    // First pass: find the maximum financial period for each property
    for (const row of (rows || [])) {
        if (!propertyMaxPeriodMap.has(row.property_code)) {
            propertyMaxPeriodMap.set(row.property_code, row.financial_period);
        }
    }

    const summaryMap = new Map<string, YardiPursuitCostSummary>();

    // Second pass: sum all rows that match their property's max financial period
    for (const row of (rows || [])) {
        if (row.financial_period !== propertyMaxPeriodMap.get(row.property_code)) {
            continue;
        }

        if (!summaryMap.has(row.property_code)) {
            summaryMap.set(row.property_code, {
                property_code: row.property_code,
                property_name: row.property_name || '',
                earnest_money: 0,
                wip: 0,
                wip_contra: 0,
                net_cost: 0,
                synced_at: row.synced_at || new Date().toISOString()
            });
        }

        const summary = summaryMap.get(row.property_code)!;
        
        // Handle synced_at dates (keep the most recent)
        if (row.synced_at) {
            const rowDate = new Date(row.synced_at);
            if (!isNaN(rowDate.getTime())) {
                if (!summary.synced_at) {
                    summary.synced_at = row.synced_at;
                } else {
                    const sumDate = new Date(summary.synced_at);
                    if (!isNaN(sumDate.getTime()) && rowDate > sumDate) {
                        summary.synced_at = row.synced_at;
                    }
                }
            }
        }

        const amount = Number(row.actual_beginning_balance || 0) + Number(row.actual_period_amount || 0);

        if (row.account_code === '11720000') summary.earnest_money += amount;
        else if (row.account_code === '11410000') summary.wip += amount;
        else if (row.account_code === '11415000') summary.wip_contra += amount;
    }    
    // Calculate net cost
    for (const summary of summaryMap.values()) {
        summary.net_cost = summary.earnest_money + summary.wip + summary.wip_contra;
    }

    return Array.from(summaryMap.values());
}

export type YardiJobCostTransaction = {
    id: number;
    job_id: string;
    job_code?: string;
    line_description?: string;
    amount: number;
    post_date: string;
    cost_category_code: string;
    vendor_invoice_num?: string;
};

export type YardiJobCostMatrixRow = {
    job_id: number;
    job_code: string;
    cost_code: string;
    category_name: string;
    cost_group: string;
    original_budget: number;
    revised_budget: number;
    total_billed_this_draw: number;
};

export async function fetchJobCostMatrix(jobIds: string[]): Promise<YardiJobCostMatrixRow[]> {
    if (!jobIds.length) return [];
    const client = createYardiClient();

    const { data: rows, error } = await client
        .from('jobcost_master_matrix')
        .select('job_id, job_code, cost_code, category_name, cost_group, original_budget, revised_budget, total_billed_this_draw')
        .in('job_id', jobIds);

    if (error) {
        console.error('Failed to fetch Job Cost Matrix from Yardi:', error);
        throw new Error('Failed to fetch job cost matrix data');
    }

    const safeRows = (rows || []).map(r => ({
        ...r,
        original_budget: Number(r.original_budget || 0),
        revised_budget: Number(r.revised_budget || 0),
        total_billed_this_draw: Number(r.total_billed_this_draw || 0),
    }));

    return safeRows as YardiJobCostMatrixRow[];
}

export async function fetchPursuitJobCosts(jobIds: string[]): Promise<YardiJobCostTransaction[]> {
    if (!jobIds.length) return [];
    const client = createYardiClient();

    // Fetch the jobs array separately to map codes
    const { data: jobMapData } = await client
        .from('jobs')
        .select('job_id, job_code')
        .in('job_id', jobIds);
        
    const jobCodeMap = (jobMapData || []).reduce((acc, j) => {
        acc[String(j.job_id)] = j.job_code;
        return acc;
    }, {} as Record<string, string>);

    const { data: rows, error } = await client
        .from('jobcost_transactions')
        .select('*')
        .in('job_id', jobIds)
        .order('post_date', { ascending: false });

    if (error) {
        console.error('Failed to fetch Job Costs from Yardi:', error);
        throw new Error(`Failed to fetch job cost data: ${error.message || JSON.stringify(error)}`);
    }

    const safeRows = (rows || []).map(r => ({
        ...r,
        amount: Number(r.amount || 0),
        job_code: jobCodeMap[String(r.job_id)] || String(r.job_id)
    }));

    return safeRows as YardiJobCostTransaction[];
}

export async function fetchJobsForProperty(propertyCode: string): Promise<string[]> {
    const client = createYardiClient();
    
    // First find the internal property_id
    const { data: propData, error: propError } = await client
        .from('properties')
        .select('property_id')
        .eq('property_code', propertyCode)
        .single();
        
    if (propError || !propData) {
        console.error('Failed to find property_id for code:', propertyCode, propError);
        return [];
    }

    // Then find all jobs for that property_id
    const { data: jobsData, error: jobsError } = await client
        .from('jobs')
        .select('job_id')
        .eq('property_id', propData.property_id);
        
    if (jobsError) {
        console.error('Failed to fetch jobs for property:', propData.property_id, jobsError);
        return [];
    }

    return (jobsData || []).map(j => String(j.job_id));
}

export type YardiPropertyOption = {
    property_code: string;
    property_name: string;
};

export async function fetchYardiProperties(search?: string): Promise<YardiPropertyOption[]> {
    const client = createYardiClient();
    
    let query = client.from('properties').select('property_code, property_name').order('property_code', { ascending: true }).limit(50);
    
    if (search) {
        query = query.or(`property_code.ilike.%${search}%,property_name.ilike.%${search}%`);
    } else {
        // Only show properties starting with 11 if no search
        query = query.like('property_code', '11%');
    }

    const { data, error } = await query;

    if (error) {
        console.error('Failed to fetch Yardi properties:', error);
        return [];
    }

    return data as YardiPropertyOption[];
}

export type YardiJobOption = {
    job_id: string;
    job_code: string;
    job_description: string;
};

export async function fetchYardiJobs(search?: string): Promise<YardiJobOption[]> {
    const client = createYardiClient();
    
    let query = client.from('jobs').select('job_id, job_code, job_description').order('job_code', { ascending: true }).limit(50);
    
    if (search) {
        query = query.or(`job_code.ilike.%${search}%,job_description.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Failed to fetch Yardi jobs:', error);
        return [];
    }

    return data as YardiJobOption[];
}
