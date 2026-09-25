'use client';

import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

/**
 * Native color picker that commits once the user settles on a color.
 * React's onChange for <input type="color"> fires continuously while dragging
 * in the picker, which used to issue a database write per mouse move.
 */
export function ColorInput({
    value,
    onCommit,
    delayMs = 400,
    ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'type'> & {
    value: string;
    onCommit: (color: string) => void;
    delayMs?: number;
}) {
    const [local, setLocal] = useState(value);
    // Follow external changes (our own commit landing, or another user's edit)
    const [prevValue, setPrevValue] = useState(value);
    if (value !== prevValue) {
        setPrevValue(value);
        setLocal(value);
    }
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingRef = useRef<string | null>(null);
    const onCommitRef = useRef(onCommit);
    useEffect(() => { onCommitRef.current = onCommit; });

    const flush = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        const next = pendingRef.current;
        pendingRef.current = null;
        if (next !== null && next.toLowerCase() !== value.toLowerCase()) onCommitRef.current(next);
    };

    // Commit anything still pending on unmount
    const flushRef = useRef(flush);
    useEffect(() => { flushRef.current = flush; });
    useEffect(() => () => flushRef.current(), []);

    return (
        <input
            type="color"
            value={local}
            onChange={(e) => {
                const next = e.target.value;
                setLocal(next);
                pendingRef.current = next;
                if (timerRef.current) clearTimeout(timerRef.current);
                timerRef.current = setTimeout(flush, delayMs);
            }}
            onBlur={flush}
            {...rest}
        />
    );
}
