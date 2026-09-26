'use client';

import { useQuery } from '@tanstack/react-query';
import { api, call, type Schemas } from '@/api/client';

export type AdminMe = Schemas['AdminMeDto'];
export type Grant = AdminMe['grants'][number];

/** Name of the httpOnly admin session cookie set by the API (ADR-009). */
export const SESSION_COOKIE = '__Host-doktool_admin';

export const meQueryKey = ['admin', 'me'] as const;

export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: () => call(api.GET('/admin/v1/me')),
    staleTime: 60_000,
  });
}

/** Effective grants of the signed-in admin; the navigation and every action read them. */
export function useGrants(): { has: (...grants: Grant[]) => boolean; me: AdminMe | undefined } {
  const me = useMe().data;
  return {
    me,
    has: (...grants) => me !== undefined && grants.every((grant) => me.grants.includes(grant)),
  };
}

/** A `next` target is only ever a console page of this origin (no open redirect). */
export function safeNext(value: string | null): string {
  return value && /^\/admin(\/|$|\?)/.test(value) && !value.startsWith('/admin/v1')
    ? value
    : '/admin';
}
