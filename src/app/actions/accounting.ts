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
        .select('property_code, property_name, account_code, account_name, actual_period_amount, actual_beginning_balance, synced_at')
        .in('account_code', ['11720000', '11410000', '11415000'])
        .in('property_code', propertyCodes);

    if (error) {
        console.error('Failed to fetch GL Totals from Yardi:', error);
        throw new Error('Failed to fetch accounting data');
    }

    // Aggregate by property
    const summaryMap = new Map<string, YardiPursuitCostSummary>();

    for (const row of (rows || [])) {
        if (!summaryMap.has(row.property_code)) {
            summaryMap.set(row.property_code, {
                property_code: row.property_code,
                property_name: row.property_name,
                earnest_money: 0,
                wip: 0,
                wip_contra: 0,
                net_cost: 0,
                synced_at: row.synced_at
            });
        }

        const summary = summaryMap.get(row.property_code)!;
        // The total balance is usually Beginning Balance + Period Amount for the latest period
        // Depending on how period totals works, we might just sum all actual_period_amount if it's month-over-month.
        // Assuming GL Period Totals is cumulative or we just need to sum them if we don't have a specific month filter.
        // For now, let's sum: This needs to be refined based on exact Yardi period semantics. Let's assume actual_period_amount is the net change, and we sum it across all periods, or there's only one row per account if it's a current snapshot.
        // Since we aren't filtering by date, let's sum everything (actual_period_amount)
        const amount = Number(row.actual_period_amount || 0);

        if (row.account_code === '11720000') summary.earnest_money += amount;
        if (row.account_code === '11410000') summary.wip += amount;
        if (row.account_code === '11415000') summary.wip_contra += amount;
        
        summary.net_cost = summary.earnest_money + summary.wip + summary.wip_contra;

        // Take earliest sync date just to be pessimistic, or latest to be optimistic
        if (new Date(row.synced_at) > new Date(summary.synced_at)) {
            summary.synced_at = row.synced_at;
        }
    }

    return Array.from(summaryMap.values());
}

export async function fetchAllPursuitGLTotals(): Promise<YardiPursuitCostSummary[]> {
    const client = createYardiClient();

    const { data: rows, error } = await client
        .from('gl_period_totals')
        .select('property_code, property_name, account_code, account_name, actual_period_amount, actual_beginning_balance, synced_at')
        .in('account_code', ['11720000', '11410000', '11415000'])
        .like('property_code', '1%'); // pursuits start with 1

    if (error) {
        console.error('Failed to fetch Global GL Totals from Yardi:', error);
        throw new Error('Failed to fetch global accounting data');
    }

    const summaryMap = new Map<string, YardiPursuitCostSummary>();

    for (const row of (rows || [])) {
        if (!summaryMap.has(row.property_code)) {
            summaryMap.set(row.property_code, {
                property_code: row.property_code,
                property_name: row.property_name,
                earnest_money: 0,
                wip: 0,
                wip_contra: 0,
                net_cost: 0,
                synced_at: row.synced_at
            });
        }

        const summary = summaryMap.get(row.property_code)!;
        const amount = Number(row.actual_period_amount || 0);

        if (row.account_code === '11720000') summary.earnest_money += amount;
        if (row.account_code === '11410000') summary.wip += amount;
        if (row.account_code === '11415000') summary.wip_contra += amount;
        
        summary.net_cost = summary.earnest_money + summary.wip + summary.wip_contra;

        if (row.synced_at && summary.synced_at) {
            const rowDate = new Date(row.synced_at);
            const sumDate = new Date(summary.synced_at);
            if (!isNaN(rowDate.getTime()) && !isNaN(sumDate.getTime()) && rowDate > sumDate) {
                summary.synced_at = row.synced_at;
            }
        } else if (row.synced_at && !summary.synced_at) {
            summary.synced_at = row.synced_at;
        }
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
        // Only show properties starting with 1 if no search
        query = query.like('property_code', '1%');
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
    job_desc: string;
};

export async function fetchYardiJobs(search?: string): Promise<YardiJobOption[]> {
    const client = createYardiClient();
    
    let query = client.from('jobs').select('job_id, job_desc').order('job_id', { ascending: true }).limit(50);
    
    if (search) {
        query = query.or(`job_id.ilike.%${search}%,job_desc.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Failed to fetch Yardi jobs:', error);
        return [];
    }

    return data as YardiJobOption[];
}
