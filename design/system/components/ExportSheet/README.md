# ExportSheet

> **Future roadmap — not V1.** Belongs to a deferred module (Drug Database, document generation, or partnerships). Not built, routed, searchable or shown as "coming soon" in V1 (Locks L31, L32). See section 25.
The single exit for every document: PDF, Print, Copy text, Image, Share. The same component in a bottom sheet (mobile) or a modal (desktop).

## Anatomy
Five equal option tiles (`dt-export`, icon + label, pressed = `brand-soft`) · format segmented (A5/A4/ticket) · options (keep in Mes documents with patient name — off by default) · one primary action whose label names the chosen output.

## Variants
`prescription` · `certificate` · `report` · `restricted` (tiles disabled with a lock and the reason: pending verification, expired subscription, student).

## Sizes
Tiles 64px tall; primary 48px.

## States
choosing · generating (file row with progress; sheet stays open) · success (toast with "Ouvrir"; sheet closes) · copied (toast with character count) · failed (critical Alert with cause and alternative) · offline (PDF/Print/Copy/Image work locally; Share-by-link queues with a badge on the document).

## Interaction
Last choice is remembered per document type. `⌘E` opens it on desktop; `⌘P` prints directly; `⌘⇧C` copies text. Copy produces plain text in the posology-in-words format.

## Accessibility
Tiles are toggle buttons in a `radiogroup`; the primary label updates (`aria-live=polite`). Progress and results are announced.

## Responsive
Mobile: bottom sheet (glass strong). Desktop: 520px modal; also a split-button in the editor header (primary = last used output).


## Tokens
`glass`, `blur-strong`, `surface`, `border`, `brand-soft`, `brand-strong`, `critical`, `surface-sunken`, `radius-md`, `radius-xl`.

## Consumer provides
`documentId`, `formats`, `defaultOutput`, `restrictions?`, `onExport(output, options)`.

## Do not
Export silently (always confirm with a toast). Store patient names unless the user opts in. Hide unavailable outputs (disable with reason).
