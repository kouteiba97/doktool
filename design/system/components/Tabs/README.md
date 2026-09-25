# Tabs · Segmented
In-page navigation and mode switches with one selected treatment each: tabs use a 2 px `brand` underline; segmented uses a raised pill. The section-nav trace remains in the system for long pages (Future Web).

## Anatomy
Tabs: 40 px row, `label`, optional count badge. Segmented: `surface-sunken` track, `surface` pill with `shadow-sm`, 2–4 options.

## Variants
`tabs` · `segmented` · `segmented block` (full width, mobile).

## Sizes
—

## States
default · hover · selected · focus · disabled (with reason).

## Interaction
Arrow keys move between tabs (Admin Web); segmented options are single-select; in calculators segmented controls replace free-text for finite choices.

## Accessibility
Tablist / radio-group semantics; selected state announced.

## Platforms (v2.2)
Flutter: segmented control widget; Admin Web: Radix Tabs/ToggleGroup.

## Tokens
`brand`, `surface-sunken`, `surface`, `shadow-sm`, `label`.

## Consumer provides
`items`, `value`, `onChange`.

## Don't
Filled tabs; more than 4 segmented options (use a picker sheet).
