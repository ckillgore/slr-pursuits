import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Validate a post-login `next` redirect target. Only same-site absolute paths
 * are allowed: it must start with '/', and not '//' or '/\' (which browsers
 * treat as protocol-relative, i.e. an open redirect to another host).
 * Control characters are rejected too: the URL parser strips tab/newline, so
 * '/\t/evil.com' would otherwise become '//evil.com'.
 * Returns `fallback` for anything else.
 */
export function safeNextPath(raw: string | null | undefined, fallback = '/'): string {
    if (!raw) return fallback;
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
    return raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : fallback;
}
