import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from '@/i18n/messages';
import { Providers } from './providers';
import './globals.css';

/** Browser tab title and icon; search engines are told not to index the console. */
export const metadata: Metadata = {
  title: 'DokTool Console',
  robots: { index: false, follow: false },
  icons: { icon: '/favicon.svg' },
};

/** The HTML page around everything, in the language remembered in a cookie. */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored) ? stored : DEFAULT_LOCALE;
  return (
    <html lang={locale}>
      <body className="min-h-screen bg-bg font-sans text-ink">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
