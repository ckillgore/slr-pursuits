'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { OnePagerEditor } from '@/components/one-pager/OnePagerEditor';
import { usePursuit, useOnePager } from '@/hooks/useSupabaseQueries';
import { ChevronLeft, Loader2 } from 'lucide-react';

export default function OnePagerPage() {
    const params = useParams();
    const pursuitId = params.id as string;
    const onePagerId = params.onePagerId as string;

    const { data: pursuit, isLoading: loadingPursuit } = usePursuit(pursuitId);
    const { data: onePager, isLoading: loadingOnePager } = useOnePager(onePagerId);

    if (loadingPursuit || loadingOnePager) {
        return (
            <AppShell>
                <div className="flex justify-center py-24">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
                </div>
            </AppShell>
        );
    }

    if (!pursuit || !onePager) {
        return (
            <AppShell>
                <div className="max-w-4xl mx-auto px-6 py-16 text-center">
                    <h2 className="text-xl text-slate-300">One-Pager not found</h2>
                    <Link href="/" className="text-blue-400 text-sm mt-2 inline-block">
                        Back to Dashboard
                    </Link>
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell>
            <OnePagerEditor pursuit={pursuit} onePager={onePager} />
        </AppShell>
    );
}
