# MetricTile
Number tile of Finance and Analytics: label, tabular value, delta with icon and word.

## Anatomy
Label (`label`), value (24 px tabular, unit/currency caption), delta line. `hero` tiles carry the brand top edge.

## Variants
`default` · `hero` (totals) · `drillable` (chevron on hover).

## Sizes
—

## States
loading (skeleton) · no data · estimated (caption "estimé").

## Interaction
Clicking a drillable tile opens the filtered ledger.

## Accessibility
Value and delta read as one phrase; direction in words.

## Platforms (v2.2)
Admin Web only.

## Tokens
`surface`, `border`, `brand`, `success`, `ink-muted`, `numeric`.

## Consumer provides
`{label, value, currency?, delta?, hero?, onDrill?}`.

## Don't
Merge revenue and profit into one strip; a refunds tile (V1 has no refund stage, Lock L40); decorative sparklines.
