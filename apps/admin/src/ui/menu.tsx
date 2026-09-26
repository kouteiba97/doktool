'use client';

import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import { Ellipsis } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './button';

export interface MenuAction {
  label: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}

/** The `•••` overflow menu of a drawer or a row. Hidden actions (missing grant) are not listed. */
export function OverflowMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const visible = actions.filter((action) => !action.hidden);
  if (visible.length === 0) return null;
  return (
    <RadixMenu.Root>
      <RadixMenu.Trigger asChild>
        <Button variant="secondary" icon aria-label={label}>
          <Ellipsis size={16} aria-hidden />
        </Button>
      </RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content className="dt-menu" align="end" sideOffset={4}>
          {visible.map((action, index) => (
            <RadixMenu.Item
              key={index}
              className={`it${action.danger ? ' danger' : ''}`}
              disabled={action.disabled}
              onSelect={action.onSelect}
            >
              {action.label}
            </RadixMenu.Item>
          ))}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}
