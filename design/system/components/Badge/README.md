# Badge · Chip
Status badges and filter chips. Every badge carries an icon or a word; colour reinforces.

## Anatomy
22 px badge, 14 px icon, `label` text; chips are togglable filters (pressed = `brand-soft`).

## Variants
`neutral` · `brand` (plan) · `teal` (verified, active, student access) · `success` (transaction) · `warning` (fixable step) · `critical` (definitive rejection only) · `info` (pending, grace, freshness). Subscription states never use `critical` or `warning` (Lock L39).

## Sizes
—

## States
—

## Interaction
—

## Accessibility
Text is always present; icons decorative.

## Platforms (v2.2)
Flutter and Admin Web, same variants.

## Tokens
soft/strong colour pairs, `radius-sm`.

## Consumer provides
`text`, `variant`, `icon?`.

## Don't
Colour-only dots for meaning; red for subscriptions or locked items; the sponsored variant in V1.
