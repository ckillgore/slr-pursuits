"use client";

import * as React from "react";
import { Check, ChevronsUpDown, HardHat, Building } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

interface SearchedJob {
    Job_ID: number;
    Job_Code: string;
    Job_Name: string;
    Job_Type: string;
    Property_ID: number;
    Property_Code: string;
    Property_Name: string;
}

export function JobCostSelector() {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const router = useRouter();
    const searchParams = useSearchParams();
    const params = useParams();
    const currentPropertyId = params.property_id as string;

    const { data: jobs = [] } = useSWR<SearchedJob[]>(
        `/api/jobs${searchQuery ? `?search=${searchQuery}` : ''}`,
        fetcher,
        { keepPreviousData: true }
    );

    const combinedIdsParam = searchParams.get("combined_ids");
    const combinedIds = React.useMemo(() => {
        return combinedIdsParam ? combinedIdsParam.split(",") : [];
    }, [combinedIdsParam]);

    // Derived selected properties set including the current main property
    const allSelectedPropertyIds = React.useMemo(() => {
        const set = new Set(combinedIds);
        set.add(currentPropertyId);
        return set;
    }, [combinedIds, currentPropertyId]);

    const handleSelect = (propertyCode: string) => {
        if (propertyCode === currentPropertyId) return; // Can't toggle the main property

        const newCombinedIds = new Set(combinedIds);
        if (newCombinedIds.has(propertyCode)) {
            newCombinedIds.delete(propertyCode);
        } else {
            newCombinedIds.add(propertyCode);
        }

        const params = new URLSearchParams(searchParams.toString());
        if (newCombinedIds.size > 0) {
            params.set("combined_ids", Array.from(newCombinedIds).join(","));
        } else {
            params.delete("combined_ids");
        }
        router.push(`?${params.toString()}`);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-[300px] justify-between text-xs"
                >
                    <div className="flex items-center truncate">
                        <HardHat className="mr-2 h-4 w-4 opacity-50" />
                        {combinedIds.length > 0
                            ? `+ ${combinedIds.length} properties consolidated`
                            : "Consolidate other jobs..."}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="end">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Search Job #, Name, or Property..."
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                    />
                    <CommandList>
                        <CommandEmpty>No jobs found.</CommandEmpty>
                        <CommandGroup heading="Available Jobs">
                            {jobs.map((job) => {
                                const isSelected = allSelectedPropertyIds.has(job.Property_Code);
                                const isMain = job.Property_Code === currentPropertyId;

                                return (
                                    <CommandItem
                                        key={`${job.Job_ID}-${job.Property_Code}`}
                                        value={job.Job_Code + job.Job_Name} // Helper for filter if client side
                                        onSelect={() => handleSelect(job.Property_Code)}
                                    >
                                        <div className="flex flex-col w-full">
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium">{job.Job_Code}</span>
                                                {isSelected && (
                                                    <Check className={cn("h-4 w-4", isMain ? "text-slate-300" : "text-blue-600")} />
                                                )}
                                            </div>
                                            <span className="text-xs text-slate-600 truncate">{job.Job_Name}</span>
                                            <div className="text-[10px] text-slate-400 flex items-center mt-1">
                                                <Building className="h-3 w-3 mr-1" />
                                                <span className="truncate">{job.Property_Name}</span>
                                            </div>
                                            {job.Job_Type && (
                                                <span className="text-[10px] text-slate-400 italic">{job.Job_Type}</span>
                                            )}
                                        </div>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
