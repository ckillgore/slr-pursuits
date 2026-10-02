import {
    LayoutDashboard, Users, Activity, GitBranch, CalendarDays, ListChecks, Building, FileSpreadsheet,
    Landmark, Wallet, Calculator, MapPinned, type LucideIcon,
} from 'lucide-react';

export interface AdminSection {
    href: string;
    label: string;
    icon: LucideIcon;
    /** One line for the Overview directory */
    description: string;
}

export interface AdminGroup {
    label: string | null;
    sections: AdminSection[];
}

/** Every admin page, grouped the way the work is organized. The sidebar and Overview both read this. */
export const ADMIN_GROUPS: AdminGroup[] = [
    {
        label: null,
        sections: [
            { href: '/admin', label: 'Overview', icon: LayoutDashboard, description: 'Team activity, usage and settings at a glance' },
        ],
    },
    {
        label: 'Team',
        sections: [
            { href: '/admin/users', label: 'Users', icon: Users, description: 'Invite people, set roles, see who is active' },
            { href: '/admin/activity', label: 'Activity', icon: Activity, description: 'Who changed what, across pursuits and settings' },
        ],
    },
    {
        label: 'Pipeline',
        sections: [
            { href: '/admin/stages', label: 'Stages', icon: GitBranch, description: 'Pursuit stages, their order and forecast rules' },
            { href: '/admin/key-date-types', label: 'Key Date Types', icon: CalendarDays, description: 'Contract and milestone date types' },
            { href: '/admin/checklist-templates', label: 'Checklists', icon: ListChecks, description: 'Due diligence checklist templates' },
        ],
    },
    {
        label: 'Underwriting',
        sections: [
            { href: '/admin/product-types', label: 'Product Types', icon: Building, description: 'Product types, sub-types and density ranges' },
            { href: '/admin/templates', label: 'One-Pager Templates', icon: FileSpreadsheet, description: 'Default assumptions for new one-pagers' },
            { href: '/admin/tax-rates', label: 'Tax Rates', icon: Landmark, description: 'Property tax rates by jurisdiction' },
            { href: '/admin/budget-defaults', label: 'Budget Defaults', icon: Calculator, description: 'Pre-development budget and schedule defaults' },
        ],
    },
    {
        label: 'Accounting & Data',
        sections: [
            { href: '/admin/accounting', label: 'Yardi Mapping', icon: Wallet, description: 'Link pursuits to Yardi properties and jobs' },
            { href: '/admin/parcel-data', label: 'Parcel Data', icon: MapPinned, description: 'Regrid usage and bulk parcel refresh' },
        ],
    },
];

export const ADMIN_SECTIONS = ADMIN_GROUPS.flatMap((g) => g.sections);

/** The section a path belongs to (longest matching href) */
export function sectionForPath(pathname: string): AdminSection | undefined {
    return ADMIN_SECTIONS
        .filter((s) => pathname === s.href || (s.href !== '/admin' && pathname.startsWith(`${s.href}/`)))
        .sort((a, b) => b.href.length - a.href.length)[0];
}
