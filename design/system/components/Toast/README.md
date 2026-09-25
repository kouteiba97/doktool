# Toast
Confirms something the user just did. Never a clinical warning and never the only notice of a failure that needs a decision.

## Anatomy
`navy` capsule, `on-navy` 13 px text, leading icon, one optional inline action. Error variant on `critical-soft`.

## Variants
success · undo · copied (states what was copied) · error (persists until dismissed or retried).

## Sizes
—

## States
—

## Interaction
Bottom-centre above the bottom nav (mobile) or bottom inline-end (Admin Web); 4 s (6 s with action); one at a time.

## Accessibility
Status live region; error uses alert; no auto-dismiss while focused.

## Platforms (v2.2)
Flutter SnackBar-style widget with these tokens; Admin Web React toast.

## Tokens
`navy`, `on-navy`, `critical`, `critical-soft`, `shadow-md`, `radius-md`, `z-toast`.

## Consumer provides
`message`, `icon?`, `action?`, `variant`.

## Don't
Queue toasts; use a toast for validation or locked content.
