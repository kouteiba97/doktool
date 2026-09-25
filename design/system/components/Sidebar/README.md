# Admin sidebar
Admin Web navigation, grouped by operation and rendered from the viewer's grants (section 02, 03). The physician sidebar and tablet rail of v2.1 are Future Web references, not V1.

## Anatomy
212 px, 13 px labels, 16 px icons, `caption` group headers (OPÉRATIONS · BIBLIOTHÈQUE · BUSINESS · INTELLIGENCE · SYSTÈME), count badges for queues, current item as a `brand-soft` pill.

## Variants
`super-admin` · `scoped` (only granted items).

## Sizes
—

## States
default · hover · current · focus · with count. Never disabled: a missing grant hides the item.

## Interaction
`⌘1…9` jump to items; current follows nested routes.

## Accessibility
Navigation landmark; current item marked; counts read as words.

## Platforms (v2.2)
Admin Web only (Next.js, ≥ 1024 px).

## Tokens
`surface`, `border`, `brand-soft`, `brand-strong`, `ink-secondary`, `size-sidebar`.

## Consumer provides
`items` with required grants, `current`, `grants`.

## Don't
Show items the admin has no grant for; drug, template, partnership or refund items (not V1).
