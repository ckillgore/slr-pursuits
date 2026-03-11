'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Search, Check } from 'lucide-react';
import { fetchYardiProperties, fetchYardiJobs, type YardiPropertyOption, type YardiJobOption } from '@/app/actions/accounting';

interface SharedSelectProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export function YardiPropertySelect({ value, onChange, placeholder = "Search properties...", className = "" }: SharedSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [options, setOptions] = useState<YardiPropertyOption[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedName, setSelectedName] = useState<string>('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Initial load
    useEffect(() => {
        const loadInitial = async () => {
            setIsLoading(true);
            try {
                const results = await fetchYardiProperties('');
                setOptions(results);
                if (value) {
                    const found = results.find(r => r.property_code === value);
                    if (found) setSelectedName(`${found.property_code} - ${found.property_name}`);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        loadInitial();
    }, []);

    // Handle Search Debounce
    useEffect(() => {
        if (!isOpen) return;
        const timer = setTimeout(async () => {
            setIsLoading(true);
            try {
                const results = await fetchYardiProperties(searchTerm);
                setOptions(results);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchTerm, isOpen]);

    // Handle outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={wrapperRef} className={`relative ${className}`}>
            <div 
                className="w-full px-3 py-2 flex items-center justify-between rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus-within:border-[var(--accent)] cursor-text transition-colors"
                onClick={() => { setIsOpen(true); }}
            >
                <div className="flex items-center gap-2 w-full overflow-hidden">
                    <Search className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                    <input 
                        type="text"
                        className="w-full bg-transparent outline-none text-[var(--text-primary)] placeholder-[var(--text-faint)]"
                        placeholder={selectedName || placeholder}
                        value={isOpen ? searchTerm : (value ? selectedName || value : '')}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setIsOpen(true);
                        }}
                        onFocus={() => setIsOpen(true)}
                    />
                </div>
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg shadow-lg max-h-60 overflow-y-auto custom-scrollbar animate-fade-in">
                    {isLoading && <div className="p-3 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-[var(--text-muted)]" /></div>}
                    {!isLoading && options.length === 0 && <div className="p-3 text-sm text-[var(--text-muted)] text-center">No properties found.</div>}
                    {!isLoading && options.map((opt) => (
                        <div 
                            key={opt.property_code}
                            className={`px-3 py-2 cursor-pointer text-sm flex items-center justify-between hover:bg-[var(--bg-card)] transition-colors ${value === opt.property_code ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}
                            onClick={() => {
                                onChange(opt.property_code);
                                setSelectedName(`${opt.property_code} - ${opt.property_name}`);
                                setIsOpen(false);
                                setSearchTerm('');
                            }}
                        >
                            <div className="flex flex-col">
                                <span className="font-mono text-xs font-semibold">{opt.property_code}</span>
                                <span className="text-xs text-[var(--text-secondary)] truncate">{opt.property_name}</span>
                            </div>
                            {value === opt.property_code && <Check className="w-4 h-4" />}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function YardiJobSelect({ value, onChange, placeholder = "Search jobs...", className = "" }: SharedSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [options, setOptions] = useState<YardiJobOption[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedName, setSelectedName] = useState<string>('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Initial load
    useEffect(() => {
        const loadInitial = async () => {
            setIsLoading(true);
            try {
                const results = await fetchYardiJobs('');
                setOptions(results);
                if (value) {
                    const found = results.find(r => r.job_id.toString() === value.toString());
                    if (found) setSelectedName(`${found.job_code} - ${found.job_description}`);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        loadInitial();
    }, []); // purposely ignoring value to prevent refetch loops

    // Handle Search Debounce
    useEffect(() => {
        if (!isOpen) return;
        const timer = setTimeout(async () => {
            setIsLoading(true);
            try {
                const results = await fetchYardiJobs(searchTerm);
                setOptions(results);
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchTerm, isOpen]);

    // Handle outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={wrapperRef} className={`relative ${className}`}>
            <div 
                className="w-full px-3 py-2 flex items-center justify-between rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm focus-within:border-[var(--accent)] cursor-text transition-colors"
                onClick={() => { setIsOpen(true); }}
            >
                <div className="flex items-center gap-2 w-full overflow-hidden">
                    <Search className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
                    <input 
                        type="text"
                        className="w-full bg-transparent outline-none text-[var(--text-primary)] placeholder-[var(--text-faint)]"
                        placeholder={selectedName || placeholder}
                        value={isOpen ? searchTerm : (value ? selectedName || value : '')}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setIsOpen(true);
                        }}
                        onFocus={() => setIsOpen(true)}
                    />
                </div>
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg shadow-lg max-h-60 overflow-y-auto custom-scrollbar animate-fade-in">
                    {isLoading && <div className="p-3 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-[var(--text-muted)]" /></div>}
                    {!isLoading && options.length === 0 && <div className="p-3 text-sm text-[var(--text-muted)] text-center">No jobs found.</div>}
                    {!isLoading && options.map((opt) => (
                        <div 
                            key={opt.job_id}
                            className={`px-3 py-2 cursor-pointer text-sm flex items-center justify-between hover:bg-[var(--bg-card)] transition-colors ${value === opt.job_id.toString() ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}
                            onClick={() => {
                                onChange(opt.job_id.toString());
                                setSelectedName(`${opt.job_code} - ${opt.job_description}`);
                                setIsOpen(false);
                                setSearchTerm('');
                            }}
                        >
                            <div className="flex flex-col">
                                <span className="font-mono text-xs font-semibold">{opt.job_code}</span>
                                <span className="text-xs text-[var(--text-secondary)] truncate">{opt.job_description}</span>
                            </div>
                            {value === opt.job_id.toString() && <Check className="w-4 h-4" />}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
