import type { UnitType } from '@/types';

// Standard names so payroll and unit mix can be compared across one-pagers.
// The same rules back the one-time cleanup migration (20261001000003).

export const STANDARD_PAYROLL_ROLES = [
    'Manager',
    'Assistant Manager',
    'Leasing',
    'Lead Maintenance',
    'Assistant Maintenance',
    'Porter',
    'Housekeeper',
    'Concierge',
    'Valet',
] as const;

const ASST = '(asst|assistant|assitant)';
const MAINT = 'maint(enance|enace)?';
const MANAGER = '(manager|manger|mgr)';

const ROLE_RULES: [RegExp, string][] = [
    [new RegExp(`^(${ASST} ?${MAINT}|amaint)$`), 'Assistant Maintenance'],
    [new RegExp(`^(lead ?${MAINT}|lmaint|${MAINT}( tech(nician)?| ${MANAGER})?|main tech)$`), 'Lead Maintenance'],
    [new RegExp(`^${ASST} (property )?${MANAGER}$`), 'Assistant Manager'],
    [new RegExp(`^(property |community )?${MANAGER}$`), 'Manager'],
    [/^leasing( agent| position| consultant)?s?( \d+)?$/, 'Leasing'],
    [/^porters?$/, 'Porter'],
    [/^house ?keep(er|ing)s?$/, 'Housekeeper'],
    [/^conc(ie|ei)rge$/, 'Concierge'],
    [/^val(et|ey)$/, 'Valet'],
];

/**
 * The standard role for a typed name ("Asst. Maint" → "Assistant Maintenance"),
 * or the name as typed (whitespace tidied) when it isn't a recognized variant.
 * Abbreviations that could mean two roles ("AM") and combined roles
 * ("Asst Mgr / Leasing") are left alone.
 */
export function normalizePayrollRole(name: string): string {
    const raw = name.trim().replace(/\s+/g, ' ');
    if (/[/+&]/.test(raw)) return raw;
    const key = raw.toLowerCase().replace(/\./g, '').trim();
    return ROLE_RULES.find(([re]) => re.test(key))?.[1] ?? raw;
}

/** Bedroom type implied by a unit mix label ("2 BR", "One Bedroom", "PH"), or null when unclear. */
export function inferUnitType(label: string): UnitType | null {
    const n = label.trim().toLowerCase();
    if (!n) return null;
    if (/\b(studio|efficiency|micro)\b/.test(n) || /^s\d?\b/.test(n)) return 'studio';
    if (/\b(ph|penthouse)\b/.test(n)) return 'penthouse';
    if (/\b(th|townhomes?|townhouses?)\b/.test(n)) return 'townhome';
    if (/\b(1|one) ?(br|bd|bed|bedroom)s?\b/.test(n)) return 'one_bed';
    if (/\b(2|two) ?(br|bd|bed|bedroom)s?\b/.test(n)) return 'two_bed';
    if (/\b(3|three|4|four) ?(br|bd|bed|bedroom)s?\b/.test(n)) return 'three_bed';
    return null;
}
