'use client';

import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, TrendingUp, Wallet, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JobCostSummaryCardsProps {
    totalBudget: number;
    totalSpent: number;
    totalRemaining: number;
    pctComplete: number;
}

export function JobCostSummaryCards({
    totalBudget,
    totalSpent,
    totalRemaining,
    pctComplete
}: JobCostSummaryCardsProps) {
    const formatCurrency = (value: number) => {
        if (value >= 1_000_000) {
            return `$${(value / 1_000_000).toFixed(1)}M`;
        }
        if (value >= 1_000) {
            return `$${(value / 1_000).toFixed(0)}K`;
        }
        return `$${value.toLocaleString()}`;
    };

    return (
        <div className="grid gap-4 md:grid-cols-4">
            <Card className="bg-white border-slate-200">
                <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Budget</p>
                            <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(totalBudget)}</p>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
                            <DollarSign className="h-5 w-5 text-blue-600" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-white border-slate-200">
                <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Spent</p>
                            <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(totalSpent)}</p>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center">
                            <TrendingUp className="h-5 w-5 text-emerald-600" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-white border-slate-200">
                <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Remaining</p>
                            <p className={cn(
                                "text-2xl font-bold mt-1",
                                totalRemaining >= 0 ? "text-slate-900" : "text-red-600"
                            )}>
                                {formatCurrency(Math.abs(totalRemaining))}
                                {totalRemaining < 0 && <span className="text-sm ml-1">(over)</span>}
                            </p>
                        </div>
                        <div className={cn(
                            "h-10 w-10 rounded-full flex items-center justify-center",
                            totalRemaining >= 0 ? "bg-amber-50" : "bg-red-50"
                        )}>
                            <Wallet className={cn(
                                "h-5 w-5",
                                totalRemaining >= 0 ? "text-amber-600" : "text-red-600"
                            )} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="bg-white border-slate-200">
                <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">% Complete</p>
                            <p className="text-2xl font-bold text-slate-900 mt-1">{pctComplete.toFixed(1)}%</p>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-purple-50 flex items-center justify-center">
                            <Clock className="h-5 w-5 text-purple-600" />
                        </div>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className={cn(
                                "h-full rounded-full transition-all",
                                pctComplete > 100 ? "bg-red-500" : "bg-purple-500"
                            )}
                            style={{ width: `${Math.min(pctComplete, 100)}%` }}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
