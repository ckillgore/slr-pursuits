import { NextResponse } from 'next/server';

/**
 * Helpers for API routes that call external services (HelloData, Regrid,
 * Census, Mapbox, HUD, Gemini, Anthropic).
 */

/** Default timeout for a single upstream HTTP call. */
export const UPSTREAM_TIMEOUT_MS = 15_000;

/** True for AbortSignal.timeout() / aborted fetches and SDK timeout errors. */
export function isTimeoutError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    return (
        err.name === 'TimeoutError' ||
        err.name === 'AbortError' ||
        err.name === 'APIConnectionTimeoutError' ||
        /timed? ?out/i.test(err.message)
    );
}

/**
 * Small bounded in-memory TTL cache for repeat upstream lookups. It lives per
 * serverless instance, so it's a best-effort saving, not a source of truth.
 * `getOrLoad` also de-duplicates concurrent loads of the same key; a failed
 * load is not cached.
 */
export function createTtlCache<T>(ttlMs: number, maxEntries = 200) {
    const store = new Map<string, { value: T; expires: number }>();
    const inflight = new Map<string, Promise<T>>();

    function get(key: string): T | undefined {
        const hit = store.get(key);
        if (!hit) return undefined;
        if (hit.expires <= Date.now()) {
            store.delete(key);
            return undefined;
        }
        return hit.value;
    }

    function set(key: string, value: T) {
        if (store.has(key)) store.delete(key);
        else if (store.size >= maxEntries) {
            // Maps iterate in insertion order, so the first key is the oldest.
            const oldest = store.keys().next().value;
            if (oldest !== undefined) store.delete(oldest);
        }
        store.set(key, { value, expires: Date.now() + ttlMs });
    }

    async function getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
        const cached = get(key);
        if (cached !== undefined) return cached;
        const pending = inflight.get(key);
        if (pending) return pending;
        const promise = load()
            .then((value) => {
                set(key, value);
                return value;
            })
            .finally(() => inflight.delete(key));
        inflight.set(key, promise);
        return promise;
    }

    return { get, set, getOrLoad, delete: (key: string) => store.delete(key) };
}

/**
 * Run `fn` over `items` with at most `limit` calls in flight, preserving
 * result order. Pass `shouldContinue` to stop scheduling new work (e.g. when a
 * serverless time budget is nearly spent); unscheduled items resolve to
 * `undefined`.
 */
export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
    shouldContinue: () => boolean = () => true,
): Promise<(R | undefined)[]> {
    const results: (R | undefined)[] = new Array(items.length).fill(undefined);
    let next = 0;
    async function worker() {
        while (next < items.length && shouldContinue()) {
            const i = next++;
            results[i] = await fn(items[i], i);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

/**
 * Map an unexpected error from an upstream call to a clean JSON response.
 * Logs the full error server-side but never forwards the raw upstream body
 * or message to the client.
 */
export function upstreamErrorResponse(err: unknown, label: string, fallbackMessage: string) {
    console.error(`[${label}] Error:`, err);
    if (isTimeoutError(err)) {
        return NextResponse.json({ error: `${fallbackMessage}: the upstream service timed out` }, { status: 504 });
    }
    return NextResponse.json({ error: fallbackMessage }, { status: 502 });
}
