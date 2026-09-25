# FileUpload
Evidence upload for verification and practice assets (stamp, signature). Designed around a phone camera, a flaky network and sensitive documents.

## Anatomy
Drop zone (`dt-drop`, dashed `border-strong`) with icon, one-line instruction, accepted types and size, and two actions: file picker and camera. File rows (`dt-file`): type icon, name (truncates middle), progress (`dt-progress`) or result line, row action (cancel, remove, replace).

## Variants
`document` (verification, PDF/JPG/PNG/HEIC, 10 MB) · `image` (stamp, signature: PNG with transparency, crop step) · `camera-first` (mobile default for identity: live frame with corner guides).

## Sizes
Drop zone min 140px tall; file row 56px.

## States
idle · drag-over (`brand-soft`) · uploading (progress + cancel) · processing ("Vérification de la lisibilité…") · success · rejected type/size (inline, before upload) · quality failure (blurry, cut, glare: `critical` with how to fix) · offline queued · server error (retry).

## Interaction
Uploads start immediately and are encrypted in transit; the user can continue the flow while they run. Quality checks run client-side first (blur, size, orientation), then server-side.

## Accessibility
Drop zone is a real button (`tabindex=0`, `Enter` opens picker). Progress uses `role=progressbar` with value text. Errors are announced (`aria-live=polite`).

## Responsive
Mobile: camera action first, full-screen capture with guides, then a review step ("Utiliser cette photo / Reprendre"). Desktop: drop zone first.


## Tokens
`border-strong`, `brand`, `brand-soft`, `teal`, `critical`, `success`, `surface`, `surface-sunken`, `radius-md`.

## Consumer provides
`accept`, `maxSize`, `capture?`, `onFiles`, `files[{name, size, status, progress?, error?}]`, `sensitive` (hides thumbnails after upload).

## Do not
Show thumbnails of identity documents after upload (show file name and date only). Block the flow while a file uploads.
