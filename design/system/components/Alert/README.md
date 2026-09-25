# Alert · Banner
Inline validation and system banners. Critical is reserved for blocking validation and real failures — never for subscription status or locked content.

## Anatomy
Icon + title + body block (`dt-alert critical|warning|info|success|offline|neutral`). Banners are the same block at the top of content.

## Variants
`critical` (blocking validation, sync failure) · `warning` (data older than 30 days) · `info` (verification pending, grace period) · `offline` (neutral mode) · `neutral`.

## Sizes
—

## States
static · with action · dismissible (non-critical only).

## Interaction
Critical sits directly above the element it concerns and is never collapsible. Only the highest-precedence banner shows (section 22).

## Accessibility
`critical` uses the alert role / live region; others are status. Icon + word always.

## Platforms (v2.2)
Flutter: a banner widget with the same variants; Admin Web: React component. Same tokens.

## Tokens
`critical(-soft)`, `warning(-soft)`, `info(-soft)`, `surface-sunken`, `radius-md`.

## Consumer provides
`severity`, `title`, `body`, `action?`.

## Don't
Red for subscriptions or locks; more than one banner at a time; a toast for a decision.
