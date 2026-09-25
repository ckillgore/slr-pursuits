'use server';

import { createYardiClient } from '@/lib/supabase/yardi-client';
import { createClient } from '@/lib/supabase/server';

// ------------------------------------------------------------
// Auth / input guards
// Server actions are publicly reachable POST endpoints, so every
// exported action must verify the caller and validate its inputs.
// ------------------------------------------------------------

/**
 * PostgREST caps un-ranged selects at db-max-rows (1000 by default) without
 * erroring, so an unpaged transaction pull silently understates actuals for
 * any pursuit — or the whole portfolio — past that count. `build` must return
 * a fresh query each call with a deterministic order (unique tie-breaker).
 */
const PAGE_SIZE = 1000;
async function fetchAllRows<T>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    build: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }> }
): Promise<{ data: T[]; error: unknown }> {
    const all: T[] = [];
    for (;;) {
        const from = all.length;
        const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
        if (error) return { data: all, error };
        if (!data?.length) break;
        all.push(...data);
    }
    return { data: all, error: null };
}

async function requireUser() {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        throw new Error('Unauthorized');
    }
    return { supabase, user };
}

async function requireAdminUser() {
    const { supabase, user } = await requireUser();
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();
    if (profile?.role !== 'owner' && profile?.role !== 'admin') {
        throw new Error('Forbidden');
    }
    return { supabase, user };
}

const MAX_IDS = 500;

/** Coerce an untrusted value into a bounded list of non-empty strings. */
function toStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
        .map(v => String(v).trim())
        .filter(v => v.length > 0 && v.length <= 64)
        .slice(0, MAX_IDS);
}

/**
 * Strip characters that have meaning inside a PostgREST `.or()` filter
 * string (commas, parens, quotes, backslashes) and LIKE wildcards, so user
 * search text can't inject extra filter clauses.
 */
function sanitizeSearch(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.replace(/[,()"'\\%*:]/g, ' ').trim().slice(0, 100);
}

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
    await requireUser();
    propertyCodes = toStringList(propertyCodes);
    if (!propertyCodes.length) return [];
    const client = createYardiClient();

    const { data: rows, error } = await fetchAllRows(() => client
        .from('gl_period_totals')
        .select('property_code, property_name, account_code, actual_period_amount, actual_beginning_balance, synced_at, financial_period')
        .in('property_code', propertyCodes)
        .in('account_code', ['11720000', '11410000', '11415000'])
        .order('financial_period', { ascending: false })
        .order('id'));

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
    await requireUser();
    if (typeof propertyCode !== 'string') return [];
    if (!propertyCode) return [];
    const client = createYardiClient();

    // Fetch all accounts for this property
    const { data: rows, error } = await fetchAllRows(() => client
        .from('gl_period_totals')
        .select('account_code, account_name, actual_period_amount, actual_beginning_balance, financial_period')
        .eq('property_code', propertyCode)
        .order('financial_period', { ascending: false })
        .order('id'));

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
    await requireUser();
    const client = createYardiClient();

    const { data: rows, error } = await fetchAllRows(() => client
        .from('gl_period_totals')
        .select('property_code, property_name, account_code, account_name, actual_period_amount, actual_beginning_balance, synced_at, financial_period')
        .in('account_code', ['11720000', '11410000', '11415000'])
        .like('property_code', '11%') // pursuits start with 11
        .order('financial_period', { ascending: false })
        .order('id'));

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
    await requireUser();
    jobIds = toStringList(jobIds);
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
    await requireUser();
    jobIds = toStringList(jobIds);
    if (!jobIds.length) return [];
    const client = createYardiClient();

    // jobcost_transactions.job_id holds the numeric jobs.job_id (verified
    // against the live data: no rows carry a job_code), so query by id only.
    // The job codes are only needed for display, so fetch them in parallel.
    const [{ data: jobMapData }, { data: rows, error }] = await Promise.all([
        client
            .from('jobs')
            .select('job_id, job_code')
            .in('job_id', jobIds),
        fetchAllRows(() => client
            .from('jobcost_transactions')
            .select('*')
            .in('job_id', jobIds)
            .order('post_date', { ascending: false })
            .order('id')),
    ]);

    const jobCodeMap = (jobMapData || []).reduce((acc, j) => {
        acc[String(j.job_id)] = j.job_code;
        return acc;
    }, {} as Record<string, string>);

    if (error) {
        console.error('Failed to fetch Job Costs from Yardi:', error);
        throw new Error('Failed to fetch job cost data');
    }

    const safeRows = (rows || []).map(r => ({
        ...r,
        amount: Number(r.amount || 0),
        job_code: jobCodeMap[String(r.job_id)] || String(r.job_id)
    }));

    return safeRows as YardiJobCostTransaction[];
}

export async function fetchJobsForProperty(propertyCode: string): Promise<string[]> {
    await requireUser();
    if (typeof propertyCode !== 'string' || !propertyCode) return [];
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
    await requireUser();
    search = sanitizeSearch(search);
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
    await requireUser();
    search = sanitizeSearch(search);
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
    await requireUser();
    jobIds = toStringList(jobIds);
    if (!jobIds.length) return [];
    const client = createYardiClient();

    // Fetch all transactions for these jobs, plus category mappings, in parallel
    const [{ data: txRows, error: txError }, { data: mappings }] = await Promise.all([
        fetchAllRows(() => client
            .from('jobcost_transactions')
            .select('cost_category_code, post_date, amount')
            .in('job_id', jobIds)
            .order('id')),
        fetchAllRows(() => client
            .from('jobcost_category_mapping')
            .select('category_code, category_name, cost_group')
            .order('category_code')),
    ]);

    if (txError) {
        console.error('Failed to fetch job cost transactions for aggregation:', txError);
        throw new Error('Failed to fetch job cost data for budget integration');
    }

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

        // A bare 2-char code is its own group: detailKey === groupKey, so
        // aggregating again would add the amount to the same entry twice.
        if (detailKey === groupKey) continue;

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

/** Split a long `.in()` list so the PostgREST request URL stays bounded. */
function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}
const IN_CHUNK = 200;

/**
 * Enterprise-level fetch: Retrieves all property mappings from the core database,
 * cross-references them against Yardi jobs, and pulls all cost aggregates for the
 * entire portfolio in a single optimized pass.
 *
 * Attribution rule (same as the per-pursuit Costs tab): an accounting entity
 * with a pinned `job_id` contributes only that job; an entity without one
 * contributes every job on its `property_code`. A pursuit gets the union of
 * its entities' jobs, and each transaction is counted at most once per pursuit.
 * Everything is keyed by String(job_id): jobcost_transactions.job_id holds the
 * numeric jobs.job_id (no rows carry a job_code).
 */
export async function fetchAllPortfolioJobCostAggregates(): Promise<Record<string, YardiMonthlyCostAggregate[]>> {
    // 1. Fetch all accounting entities from SLR Supabase
    const { supabase: slrClient } = await requireUser();
    const { data: accEntities, error: entErr } = await slrClient
        .from('pursuit_accounting_entities')
        .select('pursuit_id, property_code, job_id');

    if (entErr) {
        console.error('Failed to fetch pursuit accounting entities:', entErr);
        throw new Error('Failed to fetch accounting mappings');
    }
    if (!accEntities?.length) return {};

    // Only entities without a pinned job need their property's job list.
    const propertyWideCodes = new Set<string>();
    for (const e of accEntities) {
        if (e.job_id == null && e.property_code) propertyWideCodes.add(e.property_code);
    }

    const client = createYardiClient();

    // 2. Resolve jobs for property-wide entities: property_code → property_id → jobs
    const jobsByPropertyCode = new Map<string, string[]>();
    if (propertyWideCodes.size) {
        const { data: propRows, error: propErr } = await client
            .from('properties')
            .select('property_id, property_code')
            .in('property_code', [...propertyWideCodes]);
        if (propErr) {
            console.error('Failed to fetch Yardi properties for portfolio:', propErr);
            throw new Error('Failed to fetch job cost data');
        }
        const propIdToCode = new Map<string, string>();
        for (const pr of propRows || []) propIdToCode.set(String(pr.property_id), pr.property_code);

        if (propIdToCode.size) {
            const { data: jobRows, error: jobErr } = await client
                .from('jobs')
                .select('job_id, property_id')
                .in('property_id', [...propIdToCode.keys()]);
            if (jobErr) {
                console.error('Failed to fetch Yardi jobs for properties:', jobErr);
                throw new Error('Failed to fetch job cost data');
            }
            for (const jr of jobRows || []) {
                const code = propIdToCode.get(String(jr.property_id));
                if (!code) continue;
                const list = jobsByPropertyCode.get(code) ?? [];
                list.push(String(jr.job_id));
                jobsByPropertyCode.set(code, list);
            }
        }
    }

    // 3. job id → pursuits that own it (a Set, so a job reached through two
    //    entities of the same pursuit is still counted once)
    const jobToPursuits = new Map<string, Set<string>>();
    const result: Record<string, YardiMonthlyCostAggregate[]> = {};
    const assign = (jobId: string, pursuitId: string) => {
        let set = jobToPursuits.get(jobId);
        if (!set) jobToPursuits.set(jobId, (set = new Set()));
        set.add(pursuitId);
    };
    for (const e of accEntities) {
        result[e.pursuit_id] ??= [];
        if (e.job_id != null) assign(String(e.job_id), e.pursuit_id);
        else for (const jobId of jobsByPropertyCode.get(e.property_code) ?? []) assign(jobId, e.pursuit_id);
    }
    if (!jobToPursuits.size) return result;

    // 4. Fetch transactions (chunked by job id) and code mappings in parallel
    const [txChunks, { data: mappings }] = await Promise.all([
        Promise.all(chunk([...jobToPursuits.keys()], IN_CHUNK).map((ids) => fetchAllRows(() => client
            .from('jobcost_transactions')
            .select('job_id, cost_category_code, post_date, amount')
            .in('job_id', ids)
            .order('id')))),
        fetchAllRows(() => client
            .from('jobcost_category_mapping')
            .select('category_code, category_name, cost_group')
            .order('category_code')),
    ]);
    const txErr = txChunks.find((c) => c.error)?.error;
    if (txErr) {
        console.error('Failed to fetch portfolio job cost transactions:', txErr);
        throw new Error('Failed to fetch job cost data');
    }

    const mappingLookup = new Map<string, { name: string; group: string }>();
    for (const m of (mappings || [])) {
        mappingLookup.set(m.category_code, { name: m.category_name, group: m.cost_group });
    }

    // 5. Distribute each transaction to its pursuits via the job → pursuits
    //    map: O(transactions) instead of O(pursuits × transactions). Chunks
    //    partition the job ids, so no transaction appears in two chunks.
    const aggregateMaps = new Map<string, Map<string, YardiMonthlyCostAggregate>>();
    for (const { data: txRows } of txChunks) {
        for (const tx of txRows) {
            if (!tx.post_date || !tx.cost_category_code) continue;

            const amount = Number(tx.amount || 0);
            if (amount === 0) continue;

            const pursuitIds = jobToPursuits.get(String(tx.job_id));
            if (!pursuitIds) continue;

            let code = tx.cost_category_code.trim();
            if (code.length === 7 && !code.includes('-')) {
                code = `${code.substring(0, 2)}-${code.substring(2)}`;
            }
            const costGroup = code.substring(0, 2);
            const month = tx.post_date.substring(0, 7);
            const detailKey = `${code}|${month}`;

            for (const pursuitId of pursuitIds) {
                let aggregateMap = aggregateMaps.get(pursuitId);
                if (!aggregateMap) aggregateMaps.set(pursuitId, (aggregateMap = new Map()));
                let agg = aggregateMap.get(detailKey);
                if (!agg) {
                    const mapping = mappingLookup.get(code); // Might be undefined for detail codes missing from mapping table
                    agg = {
                        cost_group: costGroup,
                        category_code: code,
                        category_name: mapping?.name || code,
                        month,
                        total_amount: 0,
                    };
                    aggregateMap.set(detailKey, agg);
                }
                agg.total_amount += amount;
            }
        }
    }

    for (const [pursuitId, aggregateMap] of aggregateMaps) {
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
    await requireUser();
    const client = createYardiClient();

    const { data, error } = await fetchAllRows(() => client
        .from('jobcost_category_mapping')
        .select('category_code, category_name, cost_group, is_group_header')
        .order('category_code'));

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
    await requireAdminUser();

    if (typeof categoryCode !== 'string' || !categoryCode) {
        throw new Error('categoryCode is required');
    }

    // Whitelist updatable columns — `updates` comes straight from the caller.
    const safeUpdates: { category_name?: string; cost_group?: string } = {};
    if (typeof updates?.category_name === 'string') safeUpdates.category_name = updates.category_name;
    if (typeof updates?.cost_group === 'string') safeUpdates.cost_group = updates.cost_group;
    if (Object.keys(safeUpdates).length === 0) return;

    const client = createYardiClient();

    const { error } = await client
        .from('jobcost_category_mapping')
        .update(safeUpdates)
        .eq('category_code', categoryCode);

    if (error) {
        console.error('Failed to update category mapping:', error);
        throw new Error('Failed to update cost code mapping');
    }
}
