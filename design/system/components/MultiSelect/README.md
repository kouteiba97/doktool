# MultiSelect
Token input and checklist for choosing several values — used in Admin Web filters (specialties, account types, wilayas).

## Anatomy
Tokens inside the field with a remove button each; typeahead listbox with matched prefix in bold; checklist variant with counts.

## Variants
`tokens` · `checklist`.

## Sizes
—

## States
default · focus · with tokens · max reached · empty results.

## Interaction
Backspace removes the last token; Enter adds the active option.

## Accessibility
Combobox / listbox semantics; tokens announce "retirer".

## Platforms (v2.2)
Admin Web only (mobile uses picker sheets).

## Tokens
`surface`, `border-strong`, `focus`, `brand-soft`, `radius-md`.

## Consumer provides
`options`, `value[]`, `max?`, `onChange`.

## Don't
Free-text tokens where a controlled list exists.
