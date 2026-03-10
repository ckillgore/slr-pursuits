import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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
    // supabase.auth.getUser(). A simple mistake could make it very hard to debug.

    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;

    // Public routes that don't require authentication
    const isPublicRoute =
        pathname === '/login' ||
        pathname.startsWith('/auth/') ||
        pathname.startsWith('/_next/') ||
        pathname.startsWith('/api/') ||
        pathname.startsWith('/portal/') ||
        pathname === '/favicon.ico';

    // If getUser() failed due to a network/timeout error (not an auth error),
    // don't redirect — let the request through so the page can show a recovery
    // UI rather than bouncing the user to /login in a loop.
    const hasAuthCookies = request.cookies.getAll().some(
        (c) => c.name.startsWith('sb-') && c.name.includes('auth-token')
    );

    if (!user && !isPublicRoute) {
        // If the user has auth cookies but getUser() failed, this is likely a
        // transient error (network blip, Supabase outage). Let the request
        // through — the client-side AuthProvider will handle recovery.
        if (error && hasAuthCookies) {
            console.warn('[Proxy] getUser failed but auth cookies exist — allowing through:', error.message);
            return supabaseResponse;
        }

        // No user and no cookies — genuinely unauthenticated
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
    }

    if (user && pathname === '/login') {
        // Redirect logged-in users away from login
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
    }

    return supabaseResponse;
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
