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
}: InlineInputProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const previousValue = useRef(value);

    useEffect(() => {
        previousValue.current = value;
    }, [value]);

    const startEditing = useCallback(() => {
        if (disabled) return;
        setIsEditing(true);
        // Show raw number for editing
        let rawValue = value;
        if (format === 'percent' && percentAsDecimal) {
            rawValue = value * 100;
        }
        setEditValue(rawValue.toString());
        requestAnimationFrame(() => {
            inputRef.current?.select();
        });
    }, [value, format, percentAsDecimal, disabled]);

    const commitValue = useCallback(() => {
        setIsEditing(false);
        let parsed = parseFloat(editValue);
        if (isNaN(parsed)) {
            return; // revert to previous value
        }

        if (format === 'percent' && percentAsDecimal) {
            parsed = parsed / 100;
        }

        if (min !== undefined) parsed = Math.max(min, parsed);
        if (max !== undefined) parsed = Math.min(max, parsed);

        if (parsed !== previousValue.current) {
            onChange(parsed);
        }
    }, [editValue, format, percentAsDecimal, min, max, onChange]);

    const cancelEdit = useCallback(() => {
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
                    'w-full px-1.5 py-0.5 rounded bg-[#EBF1FF] border border-[#2563EB] text-[#1A1F2B] text-xs tabular-nums focus:outline-none',
                    align === 'right' ? 'text-right' : 'text-left',
                    className
                )}
                autoFocus
            />
        );
    }

    const displayText = formatDisplay(value, format, decimals, percentAsDecimal);

    return (
        <button
            onClick={startEditing}
            disabled={disabled}
            className={cn(
                'w-full px-1.5 py-0.5 rounded text-[#1A1F2B] tabular-nums text-xs transition-colors',
                editAllMode
                    ? 'border border-dashed border-[#93B4F5] bg-[#F8FAFF] hover:border-[#2563EB] hover:bg-[#EBF1FF]'
                    : 'border border-transparent hover:border-[#E2E5EA] hover:bg-[#FAFBFC]',
                align === 'right' ? 'text-right' : 'text-left',
                !disabled && 'cursor-pointer',
                disabled && 'cursor-default opacity-60',
                className
            )}
        >
            {prefix}
            {displayText}
            {suffix}
        </button>
    );
}
