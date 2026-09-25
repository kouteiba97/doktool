# EmptyState · ErrorState
What a region shows when it has nothing to show, cannot load, is locked for this access context, or is not available offline. One icon, one sentence, at most one action — always a reason.

## Anatomy
24 px icon (`ink-muted`; `critical` for errors) · title · one-line explanation · one action.

## Variants
`first-use` · `no-results` · `filtered-out` · `error` · `locked` (no purchase action for students) · `offline-unavailable` · `no-longer-available`.

## Sizes
—

## States
Each variant is a state; the frame keeps the size of the content it replaces.

## Interaction
Actions are specific.

## Accessibility
Region keeps its heading; errors from a user action use the alert role.

## Platforms (v2.2)
Flutter and Admin Web, same contract.

## Tokens
`ink-muted`, `ink-secondary`, `critical`, `surface`, `border`.

## Consumer provides
`variant`, `title`, `description`, `action?`.

## Don't
Illustrations; empty states without a reason; "coming soon" for deferred modules (never shown at all).
