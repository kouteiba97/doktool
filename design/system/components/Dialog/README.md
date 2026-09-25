# Dialog (confirmation · destructive · reason)
Blocking decisions only: confirming a destructive or irreversible action, or capturing the reason an admin action requires. Everything else is inline, a drawer or a sheet.

## Anatomy
`scrim` backdrop · 480px panel (`surface`, `radius-lg`, `shadow-md`) · header with a 36px severity disc (icon in the semantic colour on its soft tint) and a `heading` title phrased as the question · body (14/21, `ink-secondary`) stating the consequence in one or two sentences · footer on `surface-raised`: Cancel (secondary) then the action (danger-solid for irreversible deletes, danger outline for rejections, primary for non-destructive confirmations), inline-end aligned.

## Variants
`confirm` (primary) · `destructive` (alertdialog, danger-solid, title names the object) · `reason` (required reason picker + message, used for every admin decision that affects a user, money or clinical content) · `typed` (type the object name to confirm; only for deleting a clinical content item or a partnership).

## Sizes
480px; reason variant 560px.

## States
open · submitting (action button shows spinner, all inputs disabled) · error (inline critical Alert above the footer; dialog stays open) · success (closes, toast confirms).

## Interaction
Opens with focus on the least destructive control (Cancel) for destructive dialogs, on the first field for reason dialogs. `Esc` and scrim click cancel unless the dialog is submitting. `Enter` submits only from the last field.

## Accessibility
`role=dialog` or `alertdialog`, `aria-labelledby` the title, `aria-describedby` the body; focus trapped; background `inert`; focus returns to the trigger on close.

## Responsive
Mobile: same content as a bottom sheet with the actions stacked full-width (action on top, Cancel below). Desktop: centred, max 480px (reason dialogs 560px).


## Tokens
`surface`, `surface-raised`, `scrim`, `critical`, `critical-soft`, `warning`, `warning-soft`, `info`, `info-soft`, `shadow-md`, `radius-lg`, `size-dialog`, `z-overlay`.

## Consumer provides
`title`, `body`, `severity`, `confirmLabel`, `onConfirm`, `reasonOptions?`, `requireMessage?`, `typedConfirmation?`.

## Do not
Stack dialogs. Use "OK"/"Oui" as the action label (name the action: "Supprimer"). Put a dialog on first load of a page (use an inline Alert). Use a dialog for success messages.
