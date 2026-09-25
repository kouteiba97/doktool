# RestrictedViewer
How identity documents are shown to reviewers: only inside this viewer, only with the explicit grant, watermarked with the viewer's name and time, and logged.

## Anatomy
Locked state (`dt-restricted`): lock icon, what is restricted, the missing grant in `mono`, one action to request temporary access, the audit sentence. Viewer (`dt-viewer`): dark `navy` stage, diagonal watermark grid (name · date · time), document, expiry badge, no download/print controls.

## Variants
`locked` · `requested` (pending approval) · `open` (timed) · `expired` · `revoked`.

## Sizes
Stage min 240px tall.

## States
All above; plus `loading` (skeleton stage) and `error` (document unavailable — deleted after retention).

## Interaction
Opening writes an audit entry (actor, case, document, duration). Right-click, drag, print shortcut and copy are disabled; screenshots are discouraged by the watermark, not prevented.

## Accessibility
The stage has a text alternative: document type, side, upload date. The watermark is `aria-hidden`.

## Responsive
Desktop only.


## Tokens
`navy`, `on-navy`, `on-navy-subtle`, `border-strong`, `surface-sunken`, `warning`, `warning-soft`.

## Consumer provides
`caseId`, `documentId`, `grant`, `expiresAt`, `viewer{name}`.

## Do not
Render identity documents anywhere else (drawer thumbnails, emails, exports). Allow download for any role but Super Admin with a reason.
