# Skeleton · TraceLoader
The two loading treatments. Skeletons hold the layout of content that is coming; the trace marks a page-level load. No spinners in content areas (spinners live only inside buttons).

## Anatomy
Skeleton: static `skeleton` blocks shaped like the real content (row icon 32px, primary line, secondary line, heading, paragraph lines). TraceLoader: a 1px `border` line under the top bar with one ECG blip (`trace`) drawn across once.

## Variants
`row` · `paragraph` · `table` (header kept, rows skeleton) · `result` (result block with neutral fill) · `trace` (page).

## Sizes
Rows match the component they replace.

## States
hidden for the first 200 ms (fast responses never flash) · visible · replaced (content fades in over `duration-fast`).

## Interaction
No interaction; the surrounding chrome stays usable (search, navigation).

## Accessibility
Container gets `aria-busy=true`; a single `role=status` announces "Chargement…" after 1 s, not per skeleton.

## Responsive
Same shapes on every breakpoint; row heights match the real rows.


## Tokens
`skeleton`, `border`, `trace`, `radius-sm`, `duration-fast`, `ease-out`.

## Consumer provides
`variant`, `rows?`, `delay` (default 200 ms).

## Do not
Shimmer or pulse animation. Spinners in content. Skeletons for cached (offline) data — show the data with its version chip instead.
