# DatePicker
Date and date-range entry for certificates (sick-leave start/end, fitness validity), birth dates (pediatric age), and admin periods. Typing is always allowed; the calendar is an aid.

## Anatomy
Input with calendar icon (typed `JJ/MM/AAAA`) · popover calendar (288px): month header with prev/next, weekday row (week starts Monday, as shown; user setting can change it to Saturday), day grid (34px cells), today outlined, selected filled `brand`, range filled `brand-soft` · optional quick chips (+3 j, +7 j, +15 j, +1 mois) · derived-value helper ("7 jours calendaires, reprise le …").

## Variants
`single` · `range` · `birthdate` (year/month jump first, age computed and shown) · `period` (admin: presets Aujourd'hui, 7 j, 30 j, 3 mois, 12 mois + custom).

## Sizes
Input 40/48px; day cell 34px (44px on touch).

## States
empty · typing · valid (derived helper in `success`) · invalid (non-existent date, out of range: `critical` message) · disabled days (e.g. end before start) · disabled.

## Interaction
Arrow keys move by day, `PageUp/PageDown` by month, `Home/End` week bounds, `Enter` selects, `Esc` closes. Typing auto-inserts separators; paste is parsed.

## Accessibility
The input is the source of truth and always labelled. Grid uses `role=grid`; each day has a full accessible name ("lundi 22 septembre 2026"). Selected and today are conveyed in text, not colour only.

## Responsive
Mobile: typed input with numeric keypad; the calendar opens in a bottom sheet. Desktop: popover.


## Tokens
`brand`, `on-brand`, `brand-soft`, `brand-strong`, `border-strong`, `surface`, `shadow-md`, `radius-sm`, `radius-md`.

## Consumer provides
`value` (ISO), `onChange`, `mode`, `min?`, `max?`, `presets?`, `locale`.

## Do not
Force the calendar for birth dates. Show dates as ambiguous numerics in exports (documents print the month in words: "22 septembre 2026").
