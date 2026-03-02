import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Providers } from '@/components/Providers';
import { Analytics } from '@vercel/analytics/next';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'SLR Pursuits | Feasibility Analysis',
  description: 'Multifamily development feasibility analysis platform — Streetlight Residential',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-[#FAFBFC] text-[#1A1F2B] antialiased">
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
