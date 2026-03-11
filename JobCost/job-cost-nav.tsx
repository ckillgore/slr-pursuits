"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useParams } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
    { name: "Summary", href: "" }, // Root path
    { name: "PSTR", href: "/pstr" },
    { name: "Draw History", href: "/draw-history" },
];

export function JobCostNav() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const params = useParams();
    const propertyId = params.property_id as string;

    const combinedIds = searchParams.get("combined_ids");
    const queryString = combinedIds ? `?combined_ids=${combinedIds}` : "";

    const baseUrl = `/dashboard/${propertyId}/job-cost`;

    return (
        <div className="border-b border-slate-200">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                {tabs.map((tab) => {
                    const href = `${baseUrl}${tab.href}${queryString}`;

                    // Logic for active state
                    // If tab.href is empty (Summary), match exact base url
                    // Else match startsWith
                    const isActive = tab.href === ""
                        ? pathname === baseUrl
                        : pathname.startsWith(`${baseUrl}${tab.href}`);

                    return (
                        <Link
                            key={tab.name}
                            href={href}
                            className={cn(
                                "whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm",
                                isActive
                                    ? "border-slate-900 text-slate-900"
                                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                            )}
                            aria-current={isActive ? "page" : undefined}
                        >
                            {tab.name}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
