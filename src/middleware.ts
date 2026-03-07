import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware that refreshes the Supabase auth token on every request.
 * This ensures that server-side rendering always has a valid session,
 * and that the refreshed token cookies are shared across all tabs.
 *
 * Critical for multi-tab: when one tab refreshes the token, the new
 * cookies propagate to ALL tabs via the shared cookie jar. Without this,
 * tabs doing server-side navigation could get stale/expired sessions.
 */
export async function middleware(request: NextRequest) {
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
                    // Write cookies to both the request (for downstream server code)
                    // and the response (for the browser)
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // IMPORTANT: Do NOT use getSession() here — it reads from cookies without
    // verifying the JWT. getUser() calls the Supabase Auth server, which will
    // also trigger a token refresh if the access token is expired.
    await supabase.auth.getUser();

    return supabaseResponse;
}

export const config = {
    matcher: [
        // Match all routes EXCEPT static assets, images, favicons, and API routes.
        // This ensures auth is refreshed on page navigations without interfering
        // with API calls or static file serving.
        '/((?!_next/static|_next/image|favicon.ico|images/|api/).*)',
    ],
};
