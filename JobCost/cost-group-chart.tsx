'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface CostGroupChartProps {
    summary: Array<{
        Cost_Group: string;
        Total_Budget: number;
        Total_Spent: number;
        Remaining: number;
        Pct_Complete: number;
    }>;
}

const COST_GROUP_COLORS: Record<string, { bg: string; bar: string }> = {
    'Hard Costs': { bg: 'bg-blue-100', bar: 'bg-blue-500' },
    'Soft Costs': { bg: 'bg-purple-100', bar: 'bg-purple-500' },
    'Land Costs': { bg: 'bg-amber-100', bar: 'bg-amber-500' }, // Updated to match API
};

export function CostGroupChart({ summary }: CostGroupChartProps) {
    const formatCurrency = (value: number) => {
        if (Math.abs(value) >= 1_000_000) {
            return `$${(value / 1_000_000).toFixed(1)}M`;
        }
        if (Math.abs(value) >= 1_000) {
            return `$${(value / 1_000).toFixed(0)}K`;
        }
        return `$${value.toLocaleString()}`;
    };

    const maxBudget = Math.max(...summary.map(s => s.Total_Budget), 1);

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-medium">Cost Group Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {summary.map((group) => {
                        const colors = COST_GROUP_COLORS[group.Cost_Group] || { bg: 'bg-slate-100', bar: 'bg-slate-500' };
                        const barWidth = (group.Total_Budget / maxBudget) * 100;
                        const spentWidth = group.Total_Budget > 0
                            ? (group.Total_Spent / group.Total_Budget) * 100
                            : 0;

                        return (
                            <div key={group.Cost_Group} className="space-y-2">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="font-medium text-slate-700">{group.Cost_Group}</span>
                                    <div className="text-right">
                                        <span className="text-slate-900 font-medium">{formatCurrency(group.Total_Spent)}</span>
                                        <span className="text-slate-400 mx-1">/</span>
                                        <span className="text-slate-500">{formatCurrency(group.Total_Budget)}</span>
                                    </div>
                                </div>

                                {/* Budget bar (outer) */}
                                <div
                                    className={cn("h-3 rounded-full", colors.bg)}
                                    style={{ width: `${barWidth}%` }}
                                >
                                    {/* Spent bar (inner) */}
                                    <div
                                        className={cn(
                                            "h-full rounded-full transition-all",
                                            spentWidth > 100 ? "bg-red-500" : colors.bar
                                        )}
                                        style={{ width: `${Math.min(spentWidth, 100)}%` }}
                                    />
                                </div>

                                <div className="flex justify-between text-xs text-slate-500">
                                    <span>{group.Pct_Complete.toFixed(1)}% complete</span>
                                    <span className={cn(
                                        group.Remaining < 0 ? "text-red-600 font-medium" : ""
                                    )}>
                                        {group.Remaining >= 0 ? 'Remaining: ' : 'Over by: '}
                                        {formatCurrency(Math.abs(group.Remaining))}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
