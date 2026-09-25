# CalculatorResult
The result side of every calculator (section 28): the value is the largest element on screen, followed by formula with values, source, review and limitations.

## Anatomy
`dt-result` on `teal-soft` (label with calculator name and version; value in `result` style, tabular, unit as suffix; live region), optional InterpretationBand badge when the source defines bands (icon + word + range), then Formule (mono, values substituted) · Source · Revue · Limites. Actions: Copier (value, unit, name, version) · Favori · Réinitialiser.

## Variants
`result` · `pending` (missing required inputs) · `unavailable` (outside the validated range — reason, no number) · `offline` (version chip "hors ligne").

## Sizes
—

## States
computing (never a spinner; the previous result is cleared) · shown · pending · unavailable.

## Interaction
Evaluated on field commit, never per keystroke. Mobile: sticky glass result bar with value + Copier; full block below the inputs.

## Accessibility
Result announced once per change with its unit; the unavailable reason is read in full.

## Platforms (v2.2)
Flutter (mobile, Dart engine) and Admin Web preview (backend engine) render the same contract.

## Tokens
`teal-soft`, `teal-strong`, `ink`, `surface-sunken`, `mono`, `result`.

## Consumer provides
`{value, unit, band?, formulaWithValues, source{citation, edition}, review{by, at, testsPassed}, limitations, version, engine}`.

## Don't
Show a number outside the validated range; show a stale result while inputs change; hide the source.
