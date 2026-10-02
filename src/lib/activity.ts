import { createClient } from '@/lib/supabase/client';

/** A row of `activity_log` — written by database triggers, see the activity_log migration */
export interface ActivityEntry {
    id: number;
    actor_id: string;
    action: 'created' | 'updated' | 'deleted';
    entity_type: string;
    entity_id: string | null;
    entity_label: string | null;
    pursuit_id: string | null;
    fields: string[];
    change_count: number;
    created_at: string;
    last_at: string;
}

export type ActivityCategory = 'pursuits' | 'comps' | 'settings';

interface EntityInfo {
    label: string;
    category: ActivityCategory;
    /** Admin page for settings entries */
    adminHref?: string;
}

const ENTITIES: Record<string, EntityInfo> = {
    pursuit: { label: 'pursuit', category: 'pursuits' },
    one_pager: { label: 'one-pager', category: 'pursuits' },
    predev_budget: { label: 'pre-dev budget', category: 'pursuits' },
    key_date: { label: 'key date', category: 'pursuits' },
    task: { label: 'task', category: 'pursuits' },
    land_comp: { label: 'land comp', category: 'comps' },
    sale_comp: { label: 'sale comp', category: 'comps' },
    stage: { label: 'stage', category: 'settings', adminHref: '/admin/stages' },
    product_type: { label: 'product type', category: 'settings', adminHref: '/admin/product-types' },
    key_date_type: { label: 'key date type', category: 'settings', adminHref: '/admin/key-date-types' },
    template: { label: 'one-pager template', category: 'settings', adminHref: '/admin/templates' },
    tax_rate: { label: 'tax rate', category: 'settings', adminHref: '/admin/tax-rates' },
    checklist_template: { label: 'checklist template', category: 'settings', adminHref: '/admin/checklist-templates' },
    budget_default: { label: 'budget default', category: 'settings', adminHref: '/admin/budget-defaults' },
};

export const ACTIVITY_CATEGORIES: { value: ActivityCategory; label: string }[] = [
    { value: 'pursuits', label: 'Pursuits' },
    { value: 'comps', label: 'Comps' },
    { value: 'settings', label: 'Settings' },
];

export function entityTypesFor(category: ActivityCategory): string[] {
    return Object.entries(ENTITIES).filter(([, e]) => e.category === category).map(([k]) => k);
}

export function entityInfo(type: string): EntityInfo {
    return ENTITIES[type] ?? { label: type.replace(/_/g, ' '), category: 'settings' };
}

/** Plain-English names for the columns and parts the triggers record */
const FIELD_LABELS: Record<string, string> = {
    stage_id: 'stage',
    exec_summary: 'executive summary',
    arch_notes: 'architecture notes',
    executive_memo: 'investment memo',
    primary_one_pager_id: 'primary one-pager',
    is_archived: 'archived',
    parcel_data: 'parcel data',
    parcel_data_updated_at: 'parcel data',
    parcel_assemblage: 'assemblage',
    drive_time_data: 'drive-time analysis',
    income_heatmap_data: 'income heatmap',
    demographics: 'demographics',
    demographics_updated_at: 'demographics',
    site_area_sf: 'site area',
    latitude: 'location',
    longitude: 'location',
    unit_mix: 'unit mix',
    other_income: 'other income',
    soft_costs: 'soft costs',
    unit_premiums: 'unit premiums',
    saved_version: 'saved version',
    rent_comps: 'rent comps',
    land_comps: 'land comps',
    sale_comps: 'sale comps',
    funding_partners: 'funding partners',
    line_items: 'line items',
    assigned_to: 'assignee',
    assigned_external_party_id: 'assignee',
    due_date: 'due date',
    date_value: 'date',
    completed_at: 'completion',
    completed_by: 'completion',
    is_verified: 'verified',
    tax_rate: 'rate',
    calc_yoc: 'yield',
    sub_types: 'sub-types',
};

/** Fields that say nothing on their own (computed or bookkeeping) */
const QUIET_FIELDS = new Set(['short_id', 'calc_total_budget', 'calc_noi', 'calc_total_cost', 'total_units', 'calc_yoc', 'completed_by', 'parcel_data_updated_at', 'demographics_updated_at']);

export function fieldLabel(field: string): string {
    return FIELD_LABELS[field] ?? field.replace(/^default_/, '').replace(/^calc_/, '').replace(/_id$/, '').replace(/_/g, ' ');
}

/** Distinct, readable names of what changed (most entries list a handful) */
export function changedParts(entry: ActivityEntry): string[] {
    const shown = entry.fields.filter((f) => !QUIET_FIELDS.has(f));
    return [...new Set((shown.length ? shown : entry.fields).map(fieldLabel))];
}

/** "Created one-pager", "Updated pursuit", "Moved to a new stage" … */
export function describe(entry: ActivityEntry): { verb: string; noun: string } {
    const noun = entityInfo(entry.entity_type).label;
    if (entry.action === 'created') return { verb: 'Created', noun };
    if (entry.action === 'deleted') return { verb: 'Deleted', noun };
    if (entry.entity_type === 'pursuit' && entry.fields.length === 1 && entry.fields[0] === 'stage_id') return { verb: 'Changed the stage of', noun };
    if (entry.entity_type === 'one_pager' && entry.fields.length === 1 && entry.fields[0] === 'saved_version') return { verb: 'Saved a version of', noun };
    return { verb: 'Updated', noun };
}

/** Where to see the thing an entry is about (nothing for deleted records) */
export function entryHref(entry: ActivityEntry): string | null {
    if (entry.action === 'deleted') return entityInfo(entry.entity_type).adminHref ?? null;
    const id = entry.entity_id;
    switch (entry.entity_type) {
        case 'pursuit': return id ? `/pursuits/${id}` : null;
        case 'one_pager': return id && entry.pursuit_id ? `/pursuits/${entry.pursuit_id}/one-pagers/${id}` : null;
        case 'predev_budget': return entry.pursuit_id ? `/pursuits/${entry.pursuit_id}?tab=predev` : null;
        case 'key_date': return entry.pursuit_id ? `/pursuits/${entry.pursuit_id}?tab=keydates` : null;
        case 'task': return entry.pursuit_id ? `/pursuits/${entry.pursuit_id}?tab=checklist` : null;
        case 'land_comp': return id ? `/comps/${id}` : null;
        case 'sale_comp': return id ? `/comps/sales/${id}` : null;
        default: return entityInfo(entry.entity_type).adminHref ?? null;
    }
}

export interface ActivityFilters {
    actorId?: string | null;
    category?: ActivityCategory | null;
    pursuitId?: string | null;
    /** ISO timestamp — entries active since */
    since?: string | null;
}

export const ACTIVITY_PAGE_SIZE = 50;

/** One page of the log, newest first; `before` is the last_at of the previous page's last row */
export async function fetchActivity(filters: ActivityFilters, before?: string | null): Promise<ActivityEntry[]> {
    const supabase = createClient();
    let q = supabase
        .from('activity_log')
        .select('*')
        .order('last_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(ACTIVITY_PAGE_SIZE);
    if (filters.actorId) q = q.eq('actor_id', filters.actorId);
    if (filters.category) q = q.in('entity_type', entityTypesFor(filters.category));
    if (filters.pursuitId) q = q.eq('pursuit_id', filters.pursuitId);
    if (filters.since) q = q.gte('last_at', filters.since);
    if (before) q = q.lt('last_at', before);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as ActivityEntry[];
}

/** Pursuit names for entries whose pursuit isn't the entry itself */
export async function fetchPursuitNames(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const supabase = createClient();
    const { data } = await supabase.from('pursuits').select('id, name').in('id', ids);
    return new Map((data ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));
}

export function relativeTime(iso: string, now = Date.now()): string {
    const s = Math.round((now - Date.parse(iso)) / 1000);
    if (s < 60) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d > 300 ? 'numeric' : undefined });
}
