import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next.js middleware for Supabase Auth.
 * - Refreshes the auth session on every request
 * - Redirects unauthenticated users to /login
 * - Prevents logged-in users from accessing /login
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
                    cookiesToSet.forEach(({ name, value, options }) =>
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

    // IMPORTANT: Do NOT run any logic between createServerClient and
    // supabase.auth.getUser(). A simple mistake could make it very hard to debug.

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;

    // Public routes: login page, auth callback, reset password, static assets
    const isPublicRoute =
        pathname === '/login' ||
        pathname.startsWith('/auth/') ||
        pathname.startsWith('/_next/') ||
        pathname.startsWith('/api/') ||
        pathname === '/favicon.ico';

    if (!user && !isPublicRoute) {
        // Redirect unauthenticated users to login
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
