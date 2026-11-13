import type { ReactNode } from 'react';
import { ConsoleShell } from '@/shell/console-shell';

/** Every console page sits inside the shell (top bar and navigation). */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
