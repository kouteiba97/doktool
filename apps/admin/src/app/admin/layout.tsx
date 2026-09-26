import type { ReactNode } from 'react';
import { ConsoleShell } from '@/shell/console-shell';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
