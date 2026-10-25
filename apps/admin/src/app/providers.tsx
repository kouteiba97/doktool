'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { ApiFailure } from '@/api/client';
import { I18nProvider } from '@/i18n/i18n-provider';
import type { Locale } from '@/i18n/messages';
import { ToastProvider } from '@/ui/toast';

/**
 * Any API call answering "session ended" reloads the sign-in page (remembering where the admin
 * was).
 */
function onSessionEnded(error: unknown) {
  if (!(error instanceof ApiFailure) || !error.sessionEnded) return;
  const { pathname, search } = window.location;
  if (pathname === '/sign-in') return;
  // A full page load drops every cached query (case details, names) of the ended session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/sign-in?next=${encodeURIComponent(pathname + search)}`);
}

/** Retries network and server errors twice, never a refusal (4xx). */
function retry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiFailure && error.status > 0 && error.status < 500) return false;
  return failureCount < 2;
}

/** Wraps every page with the language, the API cache and the toasts. */
export function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: onSessionEnded }),
        mutationCache: new MutationCache({ onError: onSessionEnded }),
        defaultOptions: { queries: { retry, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <I18nProvider initialLocale={locale}>
      <QueryClientProvider client={client}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}
