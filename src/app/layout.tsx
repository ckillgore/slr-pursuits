import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Providers } from '@/components/Providers';
import { Analytics } from '@vercel/analytics/next';
import { createClient } from '@/lib/supabase/server';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'SLR Pursuits | Feasibility Analysis',
  description: 'Multifamily development feasibility analysis platform — Streetlight Residential',
};

/**
 * Inline script that runs before React hydration to apply the
 * persisted theme from the cookie. This prevents FOUT (flash of
 * un-themed content) without using `cookies()` which would make
 * every route dynamic and break client-side navigation.
 *
 * suppressHydrationWarning on <html> silences the attribute
 * mismatch warning since the server always renders without
 * data-theme but the script may set it before hydration.
 */
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|;)\\s*slr-theme=([^;]*)/);if(m&&m[1]==='dark'){document.documentElement.setAttribute('data-theme','dark')}}catch(e){}})()`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  let profile = null;
  if (user) {
      const { data } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();
      if (data) profile = data;
  }

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] antialiased">
        <Providers initialUser={user} initialProfile={profile}>
            {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
