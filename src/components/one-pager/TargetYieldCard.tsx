'use client';

import { useMemo, useState } from 'react';
import { InlineInput } from './InlineInput';
import { CollapsibleSection } from './CollapsibleSection';
import { usePursuitRentComps } from '@/hooks/useHellodataQueries';
import { solveForTargetYoc } from '@/lib/calculations/solve';
import { getAverageEffectivePsf } from '@/lib/calculations/hellodataCalculations';
import { formatCurrency, formatPercent } from '@/lib/constants';
import type { OnePager, UnitMixRow, PayrollRow, SoftCostDetailRow, UnitPremium, HellodataUnit, PursuitRentComp } from '@/types';

const DEFAULT_TARGET_YOC = 0.065;

interface TargetYieldCardProps {
    pursuitId: string;
    onePager: OnePager;
    unitMix: UnitMixRow[];
    payroll: PayrollRow[];
    softCostDetails: SoftCostDetailRow[];
    unitPremiums: UnitPremium[];
    currentYoc: number;
}

function signedPct(v: number): string {
    return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
}

/**
 * Solve-for: the rent, land price and hard cost that reach a target yield,
 * plus how the one-pager's rent compares with the pursuit's rent comps.
 * Collapsed by default; comps load only once it's opened.
 */
export function TargetYieldCard({ pursuitId, onePager, unitMix, payroll, softCostDetails, unitPremiums, currentYoc }: TargetYieldCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [targetYoc, setTargetYoc] = useState(DEFAULT_TARGET_YOC);

    const solved = useMemo(
        () => (expanded ? solveForTargetYoc(onePager, unitMix, payroll, softCostDetails, targetYoc, unitPremiums) : null),
        [expanded, onePager, unitMix, payroll, softCostDetails, targetYoc, unitPremiums],
    );

    const { data: rentComps = [], isLoading: loadingComps } = usePursuitRentComps(pursuitId, { enabled: expanded });
    const comps = useMemo(() => {
        const primary = rentComps.filter((rc: PursuitRentComp) => rc.property && (rc.comp_type || 'primary') === 'primary');
        const units = primary.flatMap((rc) => (rc.property?.units ?? []) as HellodataUnit[]);
        return { count: primary.length, psf: getAverageEffectivePsf(units) };
    }, [rentComps]);

    const rentPsf = solved?.currentRentPsf ?? 0;

    return (
        <CollapsibleSection
            title="Target Yield & Rent Check"
            summary={expanded ? `Solving for ${formatPercent(targetYoc)} yield on cost` : 'Solve for rent, land and hard cost'}
            expanded={expanded}
            onToggle={() => setExpanded(!expanded)}
        >
            {solved && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="card">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <h4 className="op-card-title">To reach</h4>
                            <div className="flex items-center gap-2">
                                <InlineInput value={targetYoc} onChange={setTargetYoc} format="percent" decimals={2} className="w-20 font-semibold" />
                                <span className="text-op text-[var(--text-muted)] whitespace-nowrap">yield on cost (now {formatPercent(currentYoc)})</span>
                            </div>
                        </div>
                        <p className="op-hint mb-3">Each answer changes one input and holds the rest, including property tax moving with land and hard cost.</p>
                        <div className="op-scroll">
                        <table className="data-table">
                            <thead><tr><th>Change only</th><th className="text-right">Needed</th><th className="text-right">Now</th><th className="text-right">Change</th></tr></thead>
                            <tbody>
                                <tr>
                                    <td className="text-[var(--text-secondary)]">Avg rent $/SF/mo</td>
                                    <td className="text-right tabular-nums font-semibold">{solved.requiredRentPsf !== null ? formatCurrency(solved.requiredRentPsf, 2) : '—'}</td>
                                    <td className="text-right tabular-nums text-[var(--text-muted)]">{rentPsf > 0 ? formatCurrency(rentPsf, 2) : '—'}</td>
                                    <td className="text-right tabular-nums text-[var(--text-muted)]">{solved.requiredRentPsf !== null && rentPsf > 0 ? signedPct(solved.requiredRentPsf / rentPsf - 1) : '—'}</td>
                                </tr>
                                <tr>
                                    <td className="text-[var(--text-secondary)]">Max land price</td>
                                    <td className="text-right tabular-nums font-semibold">{solved.maxLandCost !== null ? formatCurrency(solved.maxLandCost) : 'Not reachable even at $0'}</td>
                                    <td className="text-right tabular-nums text-[var(--text-muted)]">{formatCurrency(onePager.land_cost)}</td>
                                    <td className="text-right tabular-nums text-[var(--text-muted)]">{solved.maxLandCost !== null ? formatCurrency(solved.maxLandCost - onePager.land_cost) : '—'}</td>
                                </tr>
                                <tr>
                                    <td className="text-[var(--text-secondary)]">Max hard cost $/NRSF</td>
                                    <td className="text-right tabular-nums font-semibold">{solved.maxHardCostPerNrsf !== null ? formatCurrency(solved.maxHardCostPerNrsf) : 'Not reachable even at $0'}</td>
                                    <td className="text-right tabular-nums text-[var(--text-muted)]">{formatCurrency(onePager.hard_cost_per_nrsf)}</td>
                                    <td className="text-right tabular-nums text-[var(--text-muted)]">{solved.maxHardCostPerNrsf !== null ? formatCurrency(solved.maxHardCostPerNrsf - onePager.hard_cost_per_nrsf) : '—'}</td>
                                </tr>
                            </tbody>
                        </table>
                        </div>
                        {onePager.total_units <= 0 && <p className="text-op text-[var(--warning)] mt-2">Add a unit mix to solve.</p>}
                    </div>

                    <div className="card">
                        <h4 className="op-card-title mb-3">Rent vs. comps</h4>
                        {loadingComps ? (
                            <p className="text-op text-[var(--text-muted)]">Loading rent comps…</p>
                        ) : comps.psf === null ? (
                            <p className="text-op text-[var(--text-muted)]">No rent comps with unit pricing on this pursuit yet. Add them on the pursuit&apos;s Rent Comps tab.</p>
                        ) : (
                            <>
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <div className="text-[11px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">This one-pager</div>
                                        <div className="text-lg font-bold tabular-nums">{rentPsf > 0 ? formatCurrency(rentPsf, 2) : '—'}</div>
                                    </div>
                                    <div>
                                        <div className="text-[11px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">Comps (effective)</div>
                                        <div className="text-lg font-bold tabular-nums">{formatCurrency(comps.psf, 2)}</div>
                                    </div>
                                    <div>
                                        <div className="text-[11px] text-[var(--text-faint)] uppercase tracking-wider font-semibold">Premium</div>
                                        <div className={`text-lg font-bold tabular-nums ${rentPsf / comps.psf - 1 > 0.25 ? 'text-[var(--warning)]' : ''}`}>{rentPsf > 0 ? signedPct(rentPsf / comps.psf - 1) : '—'}</div>
                                    </div>
                                </div>
                                <p className="op-hint mt-3">
                                    Unit-weighted effective rent across {comps.count} primary comp{comps.count === 1 ? '' : 's'}. New product usually earns a premium; above 25% is highlighted so it&apos;s a deliberate call.
                                </p>
                            </>
                        )}
                    </div>
                </div>
            )}
        </CollapsibleSection>
    );
}
