'use client';

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

type FormatType = 'currency' | 'percent' | 'number' | 'integer';

interface InlineInputProps {
    value: number;
    onChange: (value: number) => void;
    format?: FormatType;
    decimals?: number;
    className?: string;
    prefix?: string;
    suffix?: string;
    min?: number;
    max?: number;
    step?: number;
    /** For percent format: if true, store as decimal (0.07) but display as 7.00% */
    percentAsDecimal?: boolean;
    disabled?: boolean;
    align?: 'left' | 'right';
    /** When true, show a visible border to highlight editable fields */
    editAllMode?: boolean;
    /**
     * Text shown instead of a zero/empty value while not editing (e.g. "—" for
     * "not entered yet"). Off by default, since 0 is a real value for most inputs.
     */
    zeroAs?: string;
}

function formatDisplay(value: number, format: FormatType, decimals: number, percentAsDecimal: boolean): string {
    switch (format) {
        case 'currency':
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
            }).format(value);
        case 'percent':
            const displayValue = percentAsDecimal ? value * 100 : value;
            return `${displayValue.toFixed(decimals)}%`;
        case 'integer':
            return new Intl.NumberFormat('en-US', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
            }).format(value);
        case 'number':
        default:
            return new Intl.NumberFormat('en-US', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
            }).format(value);
    }
}

export function InlineInput({
    value,
    onChange,
    format = 'number',
    decimals = 2,
    className,
    prefix,
    suffix,
    min,
    max,
    step,
    percentAsDecimal = true,
    disabled = false,
    align = 'right',
    editAllMode = false,
    zeroAs,
}: InlineInputProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const previousValue = useRef(value);

    useEffect(() => {
        previousValue.current = value;
    }, [value]);

    // Guards against committing twice (e.g. Tab → keydown commit + blur commit)
    const editingRef = useRef(false);

    const startEditing = useCallback(() => {
        if (disabled) return;
        editingRef.current = true;
        setIsEditing(true);
        // Show raw number for editing (DB values can be null)
        let rawValue = Number(value ?? 0);
        if (format === 'percent' && percentAsDecimal) {
            rawValue = rawValue * 100;
        }
        // Trim float noise (0.07 * 100 = 7.000000000000001)
        setEditValue(Number.isFinite(rawValue) ? String(parseFloat(rawValue.toPrecision(12))) : '');
        requestAnimationFrame(() => {
            inputRef.current?.select();
        });
    }, [value, format, percentAsDecimal, disabled]);

    const commitValue = useCallback(() => {
        if (!editingRef.current) return;
        editingRef.current = false;
        setIsEditing(false);
        let parsed = parseFloat(editValue);
        if (!Number.isFinite(parsed)) {
            return; // revert to previous value
        }

        if (format === 'percent' && percentAsDecimal) {
            parsed = parseFloat((parsed / 100).toPrecision(12));
        }

        if (min !== undefined) parsed = Math.max(min, parsed);
        if (max !== undefined) parsed = Math.min(max, parsed);

        if (parsed !== previousValue.current) {
            previousValue.current = parsed;
            onChange(parsed);
        }
    }, [editValue, format, percentAsDecimal, min, max, onChange]);

    const cancelEdit = useCallback(() => {
        editingRef.current = false;
        setIsEditing(false);
    }, []);

    const handleKeyDown = useCallback(
        (e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commitValue();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            } else if (e.key === 'Tab') {
                commitValue();
            }
        },
        [commitValue, cancelEdit]
    );

    if (isEditing) {
        return (
            <input
                ref={inputRef}
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitValue}
                onKeyDown={handleKeyDown}
                step={step}
                className={cn(
                    'w-full px-1.5 py-0.5 rounded bg-[var(--accent-subtle)] border border-[var(--accent)] text-[var(--text-primary)] text-xs tabular-nums focus:outline-none',
                    align === 'right' ? 'text-right' : 'text-left',
                    className
                )}
                autoFocus
            />
        );
    }

    const numericValue = Number(value ?? 0);
    const showZeroAs = zeroAs !== undefined && (!Number.isFinite(numericValue) || numericValue === 0);
    const displayText = showZeroAs ? zeroAs : formatDisplay(numericValue, format, decimals, percentAsDecimal);

    return (
        <button
            onClick={startEditing}
            disabled={disabled}
            className={cn(
                'w-full px-1.5 py-0.5 rounded text-[var(--text-primary)] tabular-nums text-xs transition-colors',
                editAllMode
                    ? 'border border-dashed border-[var(--accent)]/50 bg-[var(--bg-primary)] hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)]'
                    : 'border border-transparent hover:border-[var(--border)] hover:bg-[var(--bg-primary)]',
                align === 'right' ? 'text-right' : 'text-left',
                !disabled && 'cursor-pointer',
                disabled && 'cursor-default opacity-60',
                className
            )}
        >
            {!showZeroAs && prefix}
            {displayText}
            {!showZeroAs && suffix}
        </button>
    );
}
