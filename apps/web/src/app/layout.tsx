import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'SEO Auditor — Professional SEO Analysis Platform',
    template: '%s | SEO Auditor',
  },
  description:
    'Comprehensive SEO audit platform with technical analysis, keyword research, competitor insights, and AI-powered recommendations.',
  keywords: ['SEO audit', 'technical SEO', 'keyword research', 'site analysis', 'SEO score'],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    title: 'SEO Auditor — Professional SEO Analysis Platform',
    description: 'Comprehensive SEO audit platform with AI-powered recommendations',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
