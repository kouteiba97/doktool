# PlanCard
One offer in the plan screen — a legitimate selection card. States what is included **and what is not**, before payment (Lock L39).

## Anatomy
`dt-plan`: name, audience, price (tabular, currency, period, taxes), alternative period, included list (teal check), **Non inclus** list (muted minus — never a red cross), one action. Current offer: brand inset outline + "Votre offre".

## Variants
`student` (free tier, no subscription) · `pro` · `current`. Professional and Institutional plans are future roadmap.

## Sizes
—

## States
default · current · role-ineligible (disabled with reason) · verification required · loading price.

## Interaction
Selecting Pro opens the review & confirm step (non-refundable acknowledgement).

## Accessibility
Price read as one phrase; lists are real lists.

## Platforms (v2.2)
Flutter (mobile) — the plan screen lives in the app; Admin Web edits the catalogue (ScreenSubscriptionsAdmin). Prices illustrative.

## Tokens
`surface`, `border`, `brand`, `brand-soft`, `teal`, `ink-muted`, `radius-md`.

## Consumer provides
`plan{code, name, audience, price, currency, period, includes[], excludes[]}`, `current`, `eligible`, `onSelect`.

## Don't
Countdowns, "offre limitée", fake strike-through prices, ribbons, refund promises.
