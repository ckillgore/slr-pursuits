import { PursuitCostsTab } from '@/components/pursuits/PursuitCostsTab';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface UnmappedPropertyCostsPageProps {
    params: {
        property_code: string;
    };
    searchParams?: {
        name?: string;
    };
}

export default async function UnmappedPropertyCostsPage({ params, searchParams }: UnmappedPropertyCostsPageProps) {
    const { property_code } = await params;
    const { name: rawName } = (await searchParams) || {};
    
    if (!property_code) {
        notFound();
    }

    const name = rawName || 'Unmapped Property';

    return (
        <div className="flex-1 flex flex-col h-full bg-[var(--bg-main)]">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-[var(--bg-primary)] border-b border-[var(--border)] px-4 sm:px-8 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link
                        href="/reports?report=accounting"
                        className="inline-flex items-center justify-center p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
                            {name}
                        </h1>
                        <p className="text-sm text-[var(--text-secondary)] mt-1">
                            Accounting Details Code: {params.property_code}
                        </p>
                    </div>
                </div>
            </div>

            <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-8">
                <PursuitCostsTab unmappedPropertyCode={property_code} unmappedName={name} />
            </main>
        </div>
    );
}
