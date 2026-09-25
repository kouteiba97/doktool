# OfflineBar · DataVersionChip
Offline is a mode, not an error (Locks L16, L44). The bar says whether content is live or cached, how old it is and what version; chips carry the same on each reference viewer and calculator.

## Anatomy
Neutral bar (`surface-sunken`, wifi-off icon, date, data version) · syncing (progress inside the bar) · outdated (`warning`, > 30 days) · failed (`critical`, cause + retry). Chips: À jour · Cache · date · Mise à jour disponible · calculator `vN · hors ligne`.

## Variants
`offline` · `syncing` · `outdated` · `failed` · chips.

## Sizes
—

## States
appears on connectivity change; replaced in place.

## Interaction
Tap opens Données et hors ligne.

## Accessibility
Status role, announced once per change.

## Platforms (v2.2)
Flutter only (Admin Web is online-only). Content rows cover V1 content only: reference PDFs, calculator versions — no drug, pediatric, pregnancy or interaction packs.

## Tokens
`surface-sunken`, `warning(-soft)`, `critical(-soft)`, `info(-soft)`, `mono`.

## Consumer provides
`state`, `dataVersion`, `syncedAt`, `progress?`, `cause?`.

## Don't
Treat offline as an error; hide the data date; show deferred-module packs.
