import { createServerClient } from '@supabase/ssr';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath } from '@/lib/utils';

/**
 * Next.js proxy for Supabase Auth.
 * - Refreshes the auth session on every request (keeps cookies in sync)
 * - Redirects unauthenticated users to /login
 * - Prevents logged-in users from accessing /login
 *
 * Critical: this is the ONLY place where server-side token refresh happens.
 * If this doesn't run or fails to write cookies back, the browser's auth
 * cookies go stale and the user "loses" their session.
 */
export async function proxy(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    // 1. Write refreshed tokens into the request so downstream
                    //    Server Components read the fresh values.
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    // 2. Re-create the response so it carries the updated request
                    //    cookies forward to Server Components.
                    supabaseResponse = NextResponse.next({ request });
                    // 3. Write refreshed tokens into the response so the browser
                    //    stores the new values (Set-Cookie headers).
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // IMPORTANT: Do NOT run any logic between createServerClient and
    // supabase.auth.getClaims(). A simple mistake could make it very hard to debug.
    //
    // getClaims() rather than getUser(): it still goes through getSession(),
    // which refreshes an expired access token and writes the new cookies via
    // setAll() above, but it verifies the JWT locally against the project's
    // (cached) JWKS instead of making a round trip to Supabase Auth on every
    // request, RSC and prefetch requests included. Projects still on a
    // symmetric (HS256) signing key fall back to getUser() automatically.
    // Trade-off: with asymmetric keys a revoked session passes this gate until
    // its access token expires. Data access is still enforced by RLS, and API
    // routes still call getUser() through requireAuth().
    let user: { id: string } | null = null;
    let error: Error | null = null;
    try {
        const { data, error: claimsError } = await supabase.auth.getClaims();
        user = data?.claims?.sub ? { id: data.claims.sub } : null;
        error = claimsError;
    } catch (e) {
        // getClaims() rethrows non-auth errors (e.g. a WebCrypto failure).
        error = e instanceof Error ? e : new Error(String(e));
    }

    const { pathname } = request.nextUrl;

    // Public routes that don't require authentication
    const isPublicRoute =
        pathname === '/login' ||
        pathname.startsWith('/auth/') ||
        pathname.startsWith('/_next/') ||
        pathname.startsWith('/api/') ||
        pathname.startsWith('/portal/') ||
        pathname === '/favicon.ico';

    // If getClaims() failed due to a network/timeout error (not an auth error),
    // don't redirect — let the request through so the page can show a recovery
    // UI rather than bouncing the user to /login in a loop.
    const hasAuthCookies = request.cookies.getAll().some(
        (c) => c.name.startsWith('sb-') && c.name.includes('auth-token')
    );

    if (!user && !isPublicRoute) {
        // If the user has auth cookies but getClaims() failed, this is likely a
        // transient error (network blip, Supabase outage). Let the request
        // through — the client-side AuthProvider will handle recovery.
        // Only for retryable (network) errors — an invalid/revoked refresh
        // token or a banned user must still be sent to /login, otherwise stale
        // cookies would bypass this check indefinitely.
        if (error && hasAuthCookies && isAuthRetryableFetchError(error)) {
            console.warn('[Proxy] getClaims failed but auth cookies exist — allowing through:', error.message);
            return supabaseResponse;
        }

        // No user and no cookies — genuinely unauthenticated. Carry the original
        // path so a deep link (e.g. a pursuit shared by email) survives sign-in.
        const url = request.nextUrl.clone();
        const target = `${pathname}${request.nextUrl.search}`;
        url.pathname = '/login';
        url.search = '';
        if (pathname !== '/') url.searchParams.set('next', target);
        return redirectWithCookies(url, supabaseResponse);
    }

    if (user && pathname === '/login') {
        // Redirect logged-in users away from login — to ?next when it's a
        // same-site path, so the login page can simply reload after sign-in.
        const url = request.nextUrl.clone();
        const next = safeNextPath(request.nextUrl.searchParams.get('next'));
        const dest = new URL(next, request.nextUrl.origin);
        url.pathname = dest.pathname;
        url.search = dest.search;
        return redirectWithCookies(url, supabaseResponse);
    }

    return supabaseResponse;
}

/**
 * A redirect that keeps any auth cookies getClaims() just refreshed. A bare
 * NextResponse.redirect() drops them, so the browser would retry with the
 * already-rotated refresh token on the next request.
 */
function redirectWithCookies(url: URL, from: NextResponse) {
    const res = NextResponse.redirect(url);
    for (const cookie of from.cookies.getAll()) res.cookies.set(cookie);
    return res;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except static files and images:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon)
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
