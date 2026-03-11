"use client";

import { JobCostNav } from "./job-cost-nav";
import { JobCostSelector } from "./job-cost-selector";
import useSWR from "swr"; // Or pass data in? ideally we just need job count/names if we want that in header
// For now, let's keep it simple. The header in page.tsx showed "Tracking X jobs".
// To share that, we need the job data or pass it in. 
// Ideally the header fetches its own basic info or accepts props.
// Let's accept props for now, or fetch if not provided.
// Actually, for PSTR and Draw History, we might not have the full summary data.
// Let's just make the Header generic for now: "Job Cost Analysis" + Selector + Nav.
// If we want the specific "Tracking X jobs" subtitle, we can pass it as children or a prop.

export function JobCostHeader({ children }: { children?: React.ReactNode }) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Job Cost Analysis</h1>
                    {children}
                </div>
                <JobCostSelector />
            </div>
            <JobCostNav />
        </div>
    );
}
