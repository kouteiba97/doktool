# Menu (dropdown · overflow · saved views)
A short list of actions on an object or a view. Actions only; values belong in Select.

## Anatomy
Trigger (icon button `⋯` or a labeled button with chevron) · `dt-menu` panel (`surface`, `shadow-md`, `radius-md`, 4px padding) · items (36px, icon 16px, label, optional shortcut in `mono`) · separators · optional group header · destructive items last, in `critical`, ending with "…" when they open a confirmation.

## Variants
overflow (`⋯`) · labeled dropdown · saved views (checked current view, counts) · context menu (right-click on rows, same content as `⋯`).

## Sizes
Items 36px desktop, 48px touch.

## States
closed · open · item active · item disabled (with reason) · destructive item.

## Interaction
`Enter`/`Space`/`↓` opens and focuses the first item; `↑↓` move; typing jumps by first letter; `Enter` activates; `Esc` closes and returns focus to the trigger.

## Accessibility
`aria-haspopup=menu`, `aria-expanded`; `role=menu`/`menuitem`; focus is trapped while open and returned on close.

## Responsive
Mobile: opens as a bottom sheet with 48px rows and a Cancel row. Desktop: popover aligned to the trigger's inline-end.


## Tokens
`surface`, `border`, `shadow-md`, `surface-raised`, `critical`, `ink-muted`, `radius-md`, `radius-sm`, `z-overlay`.

## Consumer provides
`items[{id, label, icon?, shortcut?, destructive?, disabled?, onSelect}]`, `trigger`.

## Do not
Put more than 8 items in a menu. Execute a destructive action directly from a menu without a Dialog.
