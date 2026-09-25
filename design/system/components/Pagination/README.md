# Pagination
Page through long admin tables (transactions, users, audit). Physician lists use incremental loading instead.

## Anatomy
Range summary ("1–50 sur 1 284") · rows-per-page select (25/50/100) · prev/next icon buttons · page list with current page on `brand-soft` and ellipsis.

## Variants
`numbered` (admin tables) · `load-more` (mobile and physician lists).

## Sizes
32px controls.

## States
first page (prev disabled) · middle · last page (next disabled) · loading (table rows skeleton, controls disabled) · empty (hidden).

## Interaction
Changing page keeps filters, sort and selection count; selection across pages is explicit ("Sélectionner les 1 284").

## Accessibility
`nav aria-label="Pagination"`; current page `aria-current=page`; prev/next have labels.

## Responsive
Below 1024px only load-more is used.


## Tokens
`brand-soft`, `brand-strong`, `ink-secondary`, `radius-sm`.

## Consumer provides
`page`, `pageSize`, `total`, `onChange`.

## Do not
Use infinite scroll on audit logs or financial ledgers (users need stable positions to reconcile).
