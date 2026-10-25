'use client';

import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, CircleAlert, Languages, LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { api, call } from '@/api/client';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { useMe } from '@/session/session';
import { useErrorText } from '@/ui/errors';
import { EmptyState, Skeleton } from '@/ui/feedback';
import { isActive, visibleNavigation } from './nav';

/** Label of each environment shown in the top bar. */
const ENVIRONMENTS: Record<string, MessageKey> = {
  production: 'admin.shell.envProduction',
  staging: 'admin.shell.envStaging',
  development: 'admin.shell.envDevelopment',
};

/** Environment label of the console bar, set at build time (NEXT_PUBLIC_DOKTOOL_ENVIRONMENT). */
const environment = ENVIRONMENTS[process.env.NEXT_PUBLIC_DOKTOOL_ENVIRONMENT ?? 'development'];

/**
 * The console frame: top bar (environment, language, account menu) and the navigation the admin's
 * grants allow.
 */
export function ConsoleShell({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const errorText = useErrorText();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const me = useMe();

  // « Se déconnecter »: ends the session on the server, forgets every cached answer and reloads the
  // sign-in page.
  const signOut = async () => {
    try {
      await call(api.POST('/admin/v1/auth/sign-out'));
    } finally {
      queryClient.clear();
      // A full page load drops every cached query (case details, names) of the ended session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/sign-in');
    }
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="dt-consolebar">
        <span className="inline-flex items-center gap-2 font-semibold">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
          <img src="/logo-console.svg" alt="DokTool" className="h-6 w-auto" />
          <span className="opacity-70">{t('admin.shell.console')}</span>
        </span>
        {environment ? <span className="env">{t(environment)}</span> : null}
        <div className="ms-auto flex items-center gap-2">
          {/* Language button: switches the console between French and English. */}
          <button
            type="button"
            onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
            aria-label={t('admin.shell.switchLanguage')}
          >
            <Languages size={16} aria-hidden />
            {locale === 'fr' ? 'EN' : 'FR'}
          </button>
          {me.data ? (
            <RadixMenu.Root>
              <RadixMenu.Trigger asChild>
                <button type="button">
                  {me.data.fullName}
                  <ChevronDown size={14} aria-hidden />
                </button>
              </RadixMenu.Trigger>
              <RadixMenu.Portal>
                <RadixMenu.Content className="dt-menu" align="end" sideOffset={6}>
                  <div className="px-3 py-2">
                    <div className="font-semibold">{me.data.fullName}</div>
                    <div className="dt-cap">{me.data.email}</div>
                  </div>
                  <div className="sep" />
                  <RadixMenu.Item className="it" onSelect={() => void signOut()}>
                    <LogOut size={16} aria-hidden />
                    {t('admin.shell.signOut')}
                  </RadixMenu.Item>
                </RadixMenu.Content>
              </RadixMenu.Portal>
            </RadixMenu.Root>
          ) : null}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="dt-sidebar" aria-label={t('admin.shell.navigation')}>
          {me.data
            ? visibleNavigation(me.data.grants).map((group) => (
                <div key={group.label ?? 'home'} className="flex flex-col gap-px">
                  {group.label ? <div className="grp">{t(group.label)}</div> : null}
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive(item, pathname) ? 'page' : undefined}
                    >
                      <item.icon aria-hidden />
                      {t(item.label)}
                    </Link>
                  ))}
                </div>
              ))
            : null}
        </nav>
        <main className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          {me.isPending ? (
            <Skeleton lines={6} />
          ) : me.isError ? (
            <EmptyState icon={CircleAlert} error title={t('admin.errors.loadFailed')}>
              {errorText(me.error)}
            </EmptyState>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
