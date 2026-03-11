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

    const summaryMap = new Map<string, YardiPursuitCostSummary>();
    const seenAccounts = new Set<string>();

    for (const row of (rows || [])) {
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

        const accountKey = `${row.property_code}-${row.account_code}`;
        const summary = summaryMap.get(row.property_code)!;
        
        if (row.synced_at && summary.synced_at) {
            const rowDate = new Date(row.synced_at);
            const sumDate = new Date(summary.synced_at);
            if (!isNaN(rowDate.getTime()) && !isNaN(sumDate.getTime()) && rowDate > sumDate) {
                summary.synced_at = row.synced_at;
            }
        }

        if (seenAccounts.has(accountKey)) continue;
        seenAccounts.add(accountKey);

        const amount = Number(row.actual_beginning_balance || 0) + Number(row.actual_period_amount || 0);

        if (row.account_code === '11720000') summary.earnest_money += amount;
        if (row.account_code === '11410000') summary.wip += amount;
        if (row.account_code === '11415000') summary.wip_contra += amount;
        
        summary.net_cost = summary.earnest_money + summary.wip + summary.wip_contra;
    }

    return Array.from(summaryMap.values());
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

    const summaryMap = new Map<string, YardiPursuitCostSummary>();
    const seenAccounts = new Set<string>();

    for (const row of (rows || [])) {
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

        const accountKey = `${row.property_code}-${row.account_code}`;
        const summary = summaryMap.get(row.property_code)!;
        
        if (row.synced_at && summary.synced_at) {
            const rowDate = new Date(row.synced_at);
            const sumDate = new Date(summary.synced_at);
            if (!isNaN(rowDate.getTime()) && !isNaN(sumDate.getTime()) && rowDate > sumDate) {
                summary.synced_at = row.synced_at;
            }
        } else if (row.synced_at && !summary.synced_at) {
            summary.synced_at = row.synced_at;
        }

        if (seenAccounts.has(accountKey)) continue;
        seenAccounts.add(accountKey);

        const amount = Number(row.actual_beginning_balance || 0) + Number(row.actual_period_amount || 0);

        if (row.account_code === '11720000') summary.earnest_money += amount;
        if (row.account_code === '11410000') summary.wip += amount;
        if (row.account_code === '11415000') summary.wip_contra += amount;
        
        summary.net_cost = summary.earnest_money + summary.wip + summary.wip_contra;
    }

    return Array.from(summaryMap.values());
}

export type YardiJobCostTransaction = {
    id: number;
    job_id: string;
    description: string;
    amount: number;
    transaction_date: string;
    category_id: string;
    vendor_name?: string;
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

    return rows as YardiJobCostMatrixRow[];
}

export async function fetchPursuitJobCosts(jobIds: string[]): Promise<YardiJobCostTransaction[]> {
    if (!jobIds.length) return [];
    const client = createYardiClient();

    const { data: rows, error } = await client
        .from('jobcost_transactions')
        .select('*')
        .in('job_id', jobIds)
        .order('transaction_date', { ascending: false });

    if (error) {
        console.error('Failed to fetch Job Costs from Yardi:', error);
        throw new Error('Failed to fetch job cost data');
    }

    return rows as YardiJobCostTransaction[];
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
