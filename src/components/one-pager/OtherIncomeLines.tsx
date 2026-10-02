'use client';

import { Plus, Trash2 } from 'lucide-react';
import { InlineInput } from './InlineInput';
import { DebouncedTextInput } from '@/components/shared/DebouncedTextInput';
import { useUpsertOtherIncomeRow, useDeleteOtherIncomeRow } from '@/hooks/useSupabaseQueries';
import { useMutationErrorToast } from '@/components/shared/useMutationErrorToast';
import { STANDARD_OTHER_INCOME_ITEMS, otherIncomeLineAnnual } from '@/lib/calculations/otherIncome';
import { formatCurrency } from '@/lib/constants';
import type { OtherIncomeRow } from '@/types';

interface OtherIncomeLinesProps {
    onePagerId: string;
    rows: OtherIncomeRow[];
    totalUnits: number;
    editAllMode?: boolean;
}

/** Itemized other income lines: who pays (units / spaces) × $ per month. */
export function OtherIncomeLines({ onePagerId, rows, totalUnits, editAllMode }: OtherIncomeLinesProps) {
    const upsert = useUpsertOtherIncomeRow();
    const remove = useDeleteOtherIncomeRow();
    useMutationErrorToast(upsert.error, 'Failed to save other income line');
    useMutationErrorToast(remove.error, 'Failed to delete other income line');

    const update = (row: OtherIncomeRow, field: keyof OtherIncomeRow, value: string | number) =>
        upsert.mutate({ id: row.id, one_pager_id: onePagerId, [field]: value });

    const add = () =>
        upsert.mutate({
            id: crypto.randomUUID(),
            one_pager_id: onePagerId,
            name: '',
            unit_count: totalUnits,
            amount_per_month: 0,
            sort_order: rows.length,
        });

    return (
        <div className="rounded-md bg-[var(--bg-elevated)]/50 px-2 py-1.5">
            <datalist id="other-income-items">
                {STANDARD_OTHER_INCOME_ITEMS.map((item) => <option key={item} value={item} />)}
            </datalist>
            <table className="w-full text-op">
                <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-[var(--text-faint)]">
                        <th className="text-left font-medium">Item</th>
                        <th className="text-right font-medium" title="Units, spaces or residents paying">Paying</th>
                        <th className="text-right font-medium">$/mo</th>
                        <th className="text-right font-medium">Annual</th>
                        <th />
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.id}>
                            <td className="pr-2">
                                <DebouncedTextInput value={row.name} onCommit={(v) => update(row, 'name', v.trim())} list="other-income-items" placeholder="e.g., Parking" aria-label="Other income item" className="inline-input text-op w-full min-w-[8rem]" style={{ textAlign: 'left' }} />
                            </td>
                            <td className="text-right"><InlineInput value={row.unit_count} onChange={(v) => update(row, 'unit_count', v)} format="number" decimals={0} className="w-16 ml-auto" editAllMode={editAllMode} /></td>
                            <td className="text-right"><InlineInput value={row.amount_per_month} onChange={(v) => update(row, 'amount_per_month', v)} format="currency" decimals={0} className="w-20 ml-auto" editAllMode={editAllMode} /></td>
                            <td className="text-right tabular-nums text-[var(--text-secondary)]">{formatCurrency(otherIncomeLineAnnual(row))}</td>
                            <td className="text-right w-6">
                                <button onClick={() => remove.mutate({ id: row.id, onePagerId })} aria-label={`Delete ${row.name || 'line'}`} className="text-[var(--border-strong)] hover:text-[var(--danger)] p-0.5">
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <button onClick={add} className="mt-1.5 text-[11px] font-medium text-[var(--accent)] hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add line
            </button>
        </div>
    );
}
