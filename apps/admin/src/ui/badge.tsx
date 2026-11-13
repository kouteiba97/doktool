import type { ReactNode } from 'react';

/** Colours a badge can take. */
export type BadgeTone =
  'neutral' | 'brand' | 'teal' | 'success' | 'warning' | 'critical' | 'info' | 'outline';

/** Status and age cells: always a word (and icon), never colour alone. */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`dt-badge ${tone}`}>{children}</span>;
}
