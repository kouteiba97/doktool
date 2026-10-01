import {
  ArrowLeftRight,
  BadgeCheck,
  BookOpen,
  Calculator,
  ChartColumn,
  CreditCard,
  KeyRound,
  LayoutDashboard,
  Landmark,
  type LucideIcon,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react';
import type { MessageKey } from '@/i18n/messages';
import type { Grant } from '@/session/session';

export interface NavItem {
  href: string;
  label: MessageKey;
  icon: LucideIcon;
  /** Shown when the admin holds this grant (a missing grant hides the item, section 02); null for every admin. */
  grant: Grant | null;
}

export interface NavGroup {
  label: MessageKey | null;
  items: NavItem[];
}

/** Admin navigation (design system section 02). */
export const NAVIGATION: NavGroup[] = [
  {
    label: null,
    items: [
      { href: '/admin/overview', label: 'admin.nav.overview', icon: LayoutDashboard, grant: null },
    ],
  },
  {
    label: 'admin.nav.operations',
    items: [
      { href: '/admin/users', label: 'admin.nav.users', icon: Users, grant: 'users.read' },
      {
        href: '/admin/verification',
        label: 'admin.nav.verification',
        icon: BadgeCheck,
        grant: 'verification.queue.read',
      },
    ],
  },
  {
    label: 'admin.nav.library',
    items: [
      {
        href: '/admin/library/ordonnances',
        label: 'admin.nav.referenceLibrary',
        icon: BookOpen,
        grant: 'library.read',
      },
      {
        href: '/admin/calculators',
        label: 'admin.nav.calculators',
        icon: Calculator,
        grant: 'calculators.read',
      },
    ],
  },
  {
    label: 'admin.nav.business',
    items: [
      {
        href: '/admin/subscriptions',
        label: 'admin.nav.subscriptions',
        icon: CreditCard,
        grant: 'subscriptions.read',
      },
      {
        href: '/admin/transactions',
        label: 'admin.nav.transactions',
        icon: ArrowLeftRight,
        grant: 'transactions.read',
      },
      { href: '/admin/finance', label: 'admin.nav.finance', icon: Landmark, grant: 'finance.read' },
    ],
  },
  {
    label: 'admin.nav.intelligence',
    items: [
      {
        href: '/admin/analytics',
        label: 'admin.nav.analytics',
        icon: ChartColumn,
        grant: 'analytics.read',
      },
    ],
  },
  {
    label: 'admin.nav.system',
    items: [
      { href: '/admin/audit', label: 'admin.nav.audit', icon: ScrollText, grant: 'audit.read' },
      {
        href: '/admin/permissions',
        label: 'admin.nav.permissions',
        icon: KeyRound,
        grant: 'system.roles.write',
      },
      {
        href: '/admin/settings',
        label: 'admin.nav.settings',
        icon: Settings,
        grant: 'system.settings.write',
      },
    ],
  },
];

/** Groups and items the admin may see. */
export function visibleNavigation(grants: readonly Grant[]): NavGroup[] {
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.grant === null || grants.includes(item.grant)),
  })).filter((group) => group.items.length > 0);
}

/** The first section an admin can open (landing page of `/admin`). */
export function homeFor(grants: readonly Grant[]): string | null {
  return visibleNavigation(grants)[0]?.items[0]?.href ?? null;
}

/** `/admin/library/certificates` belongs to the library item, `/admin/calculators/x` to calculators. */
export function isActive(item: NavItem, pathname: string): boolean {
  const base = item.href.startsWith('/admin/library/') ? '/admin/library' : item.href;
  return pathname === base || pathname.startsWith(`${base}/`);
}
