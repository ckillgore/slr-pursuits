'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ADMIN_TABS = [
    { label: 'Product Types', href: '/admin/product-types' },
    { label: 'Stages', href: '/admin/stages' },
    { label: 'Templates', href: '/admin/templates' },
    { label: 'Key Date Types', href: '/admin/key-date-types' },
    { label: 'Checklists', href: '/admin/checklist-templates' },
    { label: 'Budget Defaults', href: '/admin/budget-defaults' },
    { label: 'Accounting', href: '/admin/accounting' },
];

export function AdminNav() {
    const pathname = usePathname();

    return (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
            {ADMIN_TABS.map((tab) => {
                const isActive = pathname === tab.href;
                return (
                    <Link
                        key={tab.href}
                        href={tab.href}
                        className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                            isActive
                                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-medium'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
                        }`}
                    >
                        {tab.label}
                    </Link>
                );
            })}
        </div>
    );
}
