'use server';

import { createYardiClient } from '@/lib/supabase/yardi-client';
import { createClient } from '@/lib/supabase/server';

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

    // Fetch the jobs array separately to map codes and ensure robustness
    const { data: jobMapData } = await client
        .from('jobs')
        .select('job_id, job_code')
        .in('job_id', jobIds);
        
    const jobCodes = (jobMapData || []).map(j => j.job_code).filter(Boolean);
    const queryIds = Array.from(new Set([...jobIds, ...jobCodes]));

    const { data: rows, error } = await client
        .from('jobcost_master_matrix')
        .select('job_id, job_code, cost_code, category_name, cost_group, original_budget, revised_budget, total_billed_this_draw')
        .in('job_id', queryIds);

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

    const jobCodes = Object.values(jobCodeMap).filter(Boolean);
    const queryIds = Array.from(new Set([...jobIds, ...jobCodes]));

    const { data: rows, error } = await client
        .from('jobcost_transactions')
        .select('*')
        .in('job_id', queryIds)
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

// ============================================================
// Monthly Job Cost Aggregates (for Pre-Dev Budget integration)
// ============================================================

export type YardiMonthlyCostAggregate = {
    cost_group: string;          // 2-digit prefix: "50", "60", etc.
    category_code: string;       // full code: "50-00100"
    category_name: string;       // resolved name from mapping
    month: string;               // "YYYY-MM"
    total_amount: number;
};

/**
 * Aggregates job cost transactions by cost group (2-digit prefix) and month.
 * Used by PredevBudgetTab to auto-populate actuals from Yardi.
 * 
 * Groups at the 2-digit level (e.g., "50" = Land Acquisition) because
 * budget line items map to cost GROUPS, not individual cost categories.
 */
export async function fetchMonthlyJobCostAggregates(
    jobIds: string[]
): Promise<YardiMonthlyCostAggregate[]> {
    if (!jobIds.length) return [];
    const client = createYardiClient();

    // Fetch all transactions for these jobs
    const { data: txRows, error: txError } = await client
        .from('jobcost_transactions')
        .select('cost_category_code, post_date, amount')
        .in('job_id', jobIds);

    if (txError) {
        console.error('Failed to fetch job cost transactions for aggregation:', txError);
        throw new Error('Failed to fetch job cost data for budget integration');
    }

    // Fetch category mappings for name resolution
    const { data: mappings } = await client
        .from('jobcost_category_mapping')
        .select('category_code, category_name, cost_group');

    const mappingLookup = new Map<string, { name: string; group: string }>();
    for (const m of (mappings || [])) {
        mappingLookup.set(m.category_code, { name: m.category_name, group: m.cost_group });
    }

    // Aggregate by cost_group (2-digit prefix) + month
    const aggregateMap = new Map<string, YardiMonthlyCostAggregate>();

    for (const tx of (txRows || [])) {
        if (!tx.post_date || !tx.cost_category_code) continue;

        const amount = Number(tx.amount || 0);
        if (amount === 0) continue;

        // Raw code from Yardi might be missing the hyphen (e.g., '6200400' instead of '62-00400')
        // Standardize to XX-XXXXX format so it matches our mapping table
        let code = tx.cost_category_code.trim();
        if (code.length === 7 && !code.includes('-')) {
            code = `${code.substring(0, 2)}-${code.substring(2)}`;
        }

        // Extract 2-digit prefix as the cost group
        const costGroup = code.substring(0, 2);
        const month = tx.post_date.substring(0, 7); // "YYYY-MM"

        // Also track at the detail level for drill-down
        const detailKey = `${code}|${month}`;
        const groupKey = `${costGroup}|${month}`;

        // Group-level aggregation
        if (!aggregateMap.has(groupKey)) {
            const mapping = mappingLookup.get(costGroup);
            aggregateMap.set(groupKey, {
                cost_group: costGroup,
                category_code: costGroup,
                category_name: mapping?.name || `Group ${costGroup}`,
                month,
                total_amount: 0,
            });
        }
        aggregateMap.get(groupKey)!.total_amount += amount;

        // Detail-level aggregation (for drill-down)
        if (!aggregateMap.has(detailKey)) {
            const mapping = mappingLookup.get(code);
            aggregateMap.set(detailKey, {
                cost_group: costGroup,
                category_code: code,
                category_name: mapping?.name || code,
                month,
                total_amount: 0,
            });
        }
        aggregateMap.get(detailKey)!.total_amount += amount;
    }

    return Array.from(aggregateMap.values());
}

/**
 * Enterprise-level fetch: Retrieves all property mappings from the core database,
 * cross-references them against Yardi jobs, and pulls all cost aggregates for the 
 * entire portfolio in a single optimized pass.
 */
export async function fetchAllPortfolioJobCostAggregates(): Promise<Record<string, YardiMonthlyCostAggregate[]>> {
    // 1. Fetch all accounting entities from SLR Supabase
    const slrClient = await createClient();
    const { data: accEntities } = await slrClient
        .from('pursuit_accounting_entities')
        .select('pursuit_id, property_code');
    
    if (!accEntities?.length) return {};

    const pursuitPropertyMapping: Record<string, string[]> = {};
    for (const e of accEntities) {
        if (!pursuitPropertyMapping[e.pursuit_id]) pursuitPropertyMapping[e.pursuit_id] = [];
        if (e.property_code) pursuitPropertyMapping[e.pursuit_id].push(e.property_code);
    }

    // Flatten requested target codes
    const allTargetCodes = new Set<string>();
    for (const codes of Object.values(pursuitPropertyMapping)) {
        for (const code of codes) allTargetCodes.add(code);
    }
    const uniqueCodes = Array.from(allTargetCodes);
    if (!uniqueCodes.length) return {};

    // 2. Query Yardi Supabase for Properties matching those codes to get internal property_ids
    const client = createYardiClient();
    const { data: propRows } = await client
        .from('properties')
        .select('property_id, property_code')
        .in('property_code', uniqueCodes);

    const propIdToCode = new Map<string, string>();
    const uniquePropIds = new Set<string>();
    for (const pr of (propRows || [])) {
        propIdToCode.set(String(pr.property_id), pr.property_code);
        uniquePropIds.add(String(pr.property_id));
    }

    if (uniquePropIds.size === 0) return {};

    // 3. Query Jobs for those property_ids
    const { data: jobRows } = await client
        .from('jobs')
        .select('job_id, job_code, property_id')
        .in('property_id', Array.from(uniquePropIds));

    const propertyToJobs = new Map<string, string[]>();
    for (const jr of (jobRows || [])) {
        const code = propIdToCode.get(String(jr.property_id));
        if (code) {
            if (!propertyToJobs.has(code)) propertyToJobs.set(code, []);
            propertyToJobs.get(code)!.push(String(jr.job_id));
            if (jr.job_code) propertyToJobs.get(code)!.push(jr.job_code);
        }
    }

    // 4. Map Job IDs back to Pursuit IDs
    const pursuitToJobs = new Map<string, string[]>();
    const allJobIds = new Set<string>();
    for (const [pursuitId, codes] of Object.entries(pursuitPropertyMapping)) {
        const jobsForPursuit: string[] = [];
        for (const code of codes) {
            const jobs = propertyToJobs.get(code) || [];
            jobsForPursuit.push(...jobs);
            for (const j of jobs) allJobIds.add(j);
        }
        pursuitToJobs.set(pursuitId, jobsForPursuit);
    }

    if (!allJobIds.size) return {};

    // 4. Fetch all transactions for those combined job IDs
    const { data: txRows } = await client
        .from('jobcost_transactions')
        .select('job_id, cost_category_code, post_date, amount')
        .in('job_id', Array.from(allJobIds));

    // 5. Fetch code mappings
    const { data: mappings } = await client
        .from('jobcost_category_mapping')
        .select('category_code, category_name, cost_group');
    const mappingLookup = new Map<string, { name: string; group: string }>();
    for (const m of (mappings || [])) {
        mappingLookup.set(m.category_code, { name: m.category_name, group: m.cost_group });
    }

    // 6. Distribute transactions to pursuit maps
    const result: Record<string, YardiMonthlyCostAggregate[]> = {};
    for (const [pursuitId, jobs] of pursuitToJobs.entries()) {
        const pursuitTx = (txRows || []).filter(tx => jobs.includes(String(tx.job_id)));
        const aggregateMap = new Map<string, YardiMonthlyCostAggregate>();

        for (const tx of pursuitTx) {
            if (!tx.post_date || !tx.cost_category_code) continue;

            const amount = Number(tx.amount || 0);
            if (amount === 0) continue;

            let code = tx.cost_category_code.trim();
            if (code.length === 7 && !code.includes('-')) {
                code = `${code.substring(0, 2)}-${code.substring(2)}`;
            }

            const costGroup = code.substring(0, 2);
            const month = tx.post_date.substring(0, 7);
            const detailKey = `${code}|${month}`;
            if (!aggregateMap.has(detailKey)) {
                const mapping = mappingLookup.get(code); // Might be undefined for detail codes missing from mapping table
                aggregateMap.set(detailKey, {
                    cost_group: costGroup,
                    category_code: code,
                    category_name: mapping?.name || code,
                    month,
                    total_amount: 0,
                });
            }
            aggregateMap.get(detailKey)!.total_amount += amount;
        }
        result[pursuitId] = Array.from(aggregateMap.values());
    }

    return result;
}

// ============================================================
// Category Mapping Management (Admin)
// ============================================================

export type CategoryMappingEntry = {
    category_code: string;
    category_name: string;
    cost_group: string;
    is_group_header: boolean;
};

export async function fetchCategoryMappings(): Promise<CategoryMappingEntry[]> {
    const client = createYardiClient();

    const { data, error } = await client
        .from('jobcost_category_mapping')
        .select('category_code, category_name, cost_group, is_group_header')
        .order('category_code');

    if (error) {
        console.error('Failed to fetch category mappings:', error);
        throw new Error('Failed to fetch cost code mappings');
    }

    return (data || []) as CategoryMappingEntry[];
}

export async function updateCategoryMapping(
    categoryCode: string,
    updates: { category_name?: string; cost_group?: string }
): Promise<void> {
    const client = createYardiClient();

    const { error } = await client
        .from('jobcost_category_mapping')
        .update(updates)
        .eq('category_code', categoryCode);

    if (error) {
        console.error('Failed to update category mapping:', error);
        throw new Error('Failed to update cost code mapping');
    }
}
