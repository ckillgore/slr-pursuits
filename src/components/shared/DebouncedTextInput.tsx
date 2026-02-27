'use client';

import { useState, useEffect, useRef, InputHTMLAttributes } from 'react';

/**
 * Text input that holds local state and only fires onCommit on blur or Enter.
 * Prevents mutation-per-keystroke jumpiness when wired to Supabase/TanStack Query.
 *
 * See lessons.md: "Controlled input jumpiness"
 */
export function DebouncedTextInput({
    value,
    onCommit,
    ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'onKeyDown' | 'type'> & {
    value: string;
    onCommit: (v: string) => void;
}) {
    const [local, setLocal] = useState(value);
    const editingRef = useRef(false);

    useEffect(() => {
        if (!editingRef.current) setLocal(value);
    }, [value]);

    const commit = () => {
        editingRef.current = false;
        if (local !== value) onCommit(local);
    };

    return (
        <input
            type="text"
            value={local}
            onFocus={() => { editingRef.current = true; }}
            onChange={(e) => { editingRef.current = true; setLocal(e.target.value); }}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
            {...rest}
        />
    );
}
