'use client';

import * as RadixTabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';

export const Tabs = RadixTabs.Root;
export const TabPanel = RadixTabs.Content;

export function TabList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <RadixTabs.List className="dt-tabs" aria-label={label}>
      {children}
    </RadixTabs.List>
  );
}

export function Tab({
  value,
  children,
  disabled,
}: {
  value: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <RadixTabs.Trigger value={value} disabled={disabled}>
      {children}
    </RadixTabs.Trigger>
  );
}
