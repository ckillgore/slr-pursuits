'use client';

import { useCallback, useRef, useState, useEffect } from 'react';

/**
 * A single undoable action: tracks which entity/field was changed,
 * and stores oldValue/newValue so we can replay in either direction.
 */
export interface UndoAction {
    /** Descriptive entity type, e.g. 'onePager', 'unitMix', 'payroll' */
    entity: string;
    /** ID of the entity (one-pager ID, row ID, etc.) */
    entityId: string;
    /** The field that changed */
    field: string;
    /** Value before the change */
    oldValue: unknown;
    /** Value after the change */
    newValue: unknown;
    /** Timestamp for debugging */
    timestamp: number;
}

const MAX_STACK_DEPTH = 50;

/**
 * useUndoRedo — In-memory undo/redo for the One-Pager editor.
 *
 * Usage:
 *   const { push, undo, redo, canUndo, canRedo } = useUndoRedo(applyFn);
 *
 *   // Before mutating, push the old value:
 *   push({ entity: 'onePager', entityId: id, field: 'vacancy_rate', oldValue: 0.07, newValue: 0.05 });
 *
 *   // applyFn is called on undo/redo to actually write the value:
 *   function applyFn(action: UndoAction, direction: 'undo' | 'redo') { ... }
 */
export function useUndoRedo(
    applyFn: (action: UndoAction, direction: 'undo' | 'redo') => void
) {
    const undoStackRef = useRef<UndoAction[]>([]);
    const redoStackRef = useRef<UndoAction[]>([]);
    const [version, setVersion] = useState(0); // force re-render on stack change

    const push = useCallback((action: Omit<UndoAction, 'timestamp'>) => {
        const full: UndoAction = { ...action, timestamp: Date.now() };
        undoStackRef.current = [...undoStackRef.current.slice(-MAX_STACK_DEPTH + 1), full];
        // Any new action clears the redo stack
        redoStackRef.current = [];
        setVersion((v) => v + 1);
    }, []);

    const undo = useCallback(() => {
        const stack = undoStackRef.current;
        if (stack.length === 0) return;

        const action = stack[stack.length - 1];
        undoStackRef.current = stack.slice(0, -1);
        redoStackRef.current = [...redoStackRef.current, action];
        applyFn(action, 'undo');
        setVersion((v) => v + 1);
    }, [applyFn]);

    const redo = useCallback(() => {
        const stack = redoStackRef.current;
        if (stack.length === 0) return;

        const action = stack[stack.length - 1];
        redoStackRef.current = stack.slice(0, -1);
        undoStackRef.current = [...undoStackRef.current, action];
        applyFn(action, 'redo');
        setVersion((v) => v + 1);
    }, [applyFn]);

    const canUndo = undoStackRef.current.length > 0;
    const canRedo = redoStackRef.current.length > 0;

    // Keyboard shortcuts: Ctrl+Z (undo), Ctrl+Shift+Z (redo)
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Don't intercept when user is typing in a regular text input
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                // Allow undo/redo in inputs only with Ctrl key
                if (!e.ctrlKey && !e.metaKey) return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
                e.preventDefault();
                redo();
            }
            // Also support Ctrl+Y for redo (Windows convention)
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                redo();
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [undo, redo]);

    return { push, undo, redo, canUndo, canRedo, undoCount: undoStackRef.current.length, redoCount: redoStackRef.current.length };
}
