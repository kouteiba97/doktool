# DocumentPreview
The paper-accurate render of a prescription, certificate or report. What you see is exactly what prints and exports.

## Anatomy
`dt-paper` (white `surface` in both themes — paper is always light) at true aspect ratio (A5 148×210, A4 210×297, ticket 80 mm) · practice header from the Practice profile (name, specialty, order number, address, phone; stamp/signature images when set) · date line in words · patient line (optional fields, blank rule when empty) · numbered medication lines in CAPITALS for the drug name, posology in words · notes · footer with "Généré avec DokTool" and data version · signature area.

## Variants
`prescription` · `certificate` · `report` · `watermarked` (students: "USAGE PÉDAGOGIQUE"; pending professionals: "APERÇU — NON VALIDE").

## Sizes
A5 and A4 at true ratio; min preview width 320px.

## States
loading (skeleton lines) · rendered · re-rendering (keeps the last render, 120ms fade) · overflow (second page indicator "1/2") · error (render failed: keep editor, show retry).

## Interaction
Updates live from the editor (debounced 150ms). Pinch-zoom on mobile; 100% with page navigation on desktop. Format switch A5/A4 re-flows.

## Accessibility
The preview is `aria-hidden`; the editor is the accessible source. Exported PDFs are tagged (headings, lists, language per block).

## Responsive
Mobile: its own screen reached by "Aperçu"; desktop/tablet landscape: live pane beside the editor.


## Tokens
`paper`, `paper-ink`, `paper-rule`, `border`, `shadow-sm`, `radius-sm`. Paper tokens are identical in both themes: paper never takes dark-theme colours.

## Consumer provides
`template`, `values`, `practice`, `format`, `watermark?`, `languages`.

## Do not
Render the paper in dark mode. Put colour on the paper (other than the practice stamp image). Abbreviate posology on the paper ("1cp x3/j" becomes words).
