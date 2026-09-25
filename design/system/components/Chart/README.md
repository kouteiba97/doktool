# Chart
Bars and lines only, drawn from the `viz` series and the chart tokens. Every chart answers one question in its title, names its unit, and states what the data is not.

## Anatomy
Title (`heading` 14px, phrased as the measure) · legend at inline-end of the title row · plot (gridlines `chart-grid`, axis text `chart-axis` 10px, no axis lines except the baseline) · caption with unit, scope and the product-activity disclaimer where relevant · optional last-value label.

## Variants
`stacked-bar` (revenue by source over time) · `bar` (comparison) · `line` (trend) with dashed `viz-4` previous period · `horizontal-bar` (distribution/ranking, value at inline-end) · `ledger-strip` (see MetricTile).

## Sizes
Plot height 150–240px; minimum bar width 12px.

## States
loading (skeleton plot, fixed height) · empty (EmptyState inside the frame) · partial (hatched last bucket labeled "période en cours") · error (inline Alert + retry) · drill-hover (tooltip with exact value, bucket and share).

## Interaction
Hover/focus a mark shows the exact value; click drills (source → period → transactions). Keyboard: marks are focusable in reading order; `Enter` drills.

## Accessibility
`role=img` with a sentence `aria-label` summarising the chart; a visually hidden data table follows every chart; colour is never the only encoding (legend labels + order + tooltip).

## Responsive
Mobile admin is not supported; on tablet charts stack full-width. Physician app has no charts.


## Tokens
`brand`, `teal`, `viz-3`, `viz-4`, `viz-5`, `chart-grid`, `chart-axis`, `surface`, `border`.

## Consumer provides
`series[{id, label, values}]`, `x`, `unit`, `title`, `caption`, `onDrill?`, `previous?`.

## Do not
Pies, donuts, gauges, 3D, dual axes, gradients, decorative sparklines, semantic colours for non-semantic series, "prescriptions" or "ventes" in the title of an activity metric.
