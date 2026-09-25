# Input
Text and numeric fields, unit-aware, with inline validation; the same control serves calculators, pediatric dosing, verification and admin filters.

**Anatomy** label (`label` style, above), well (40px desktop / 48px mobile, `surface`, `border-strong`), optional leading icon, trailing unit slot (`ink-muted`, never separated from the number), helper line (`caption`) that turns into the error or warning message with an icon. Numbers use `numeric` style with tabular figures and `inputmode="decimal"`; the locale decimal separator is accepted and normalized.

**States** focus-within (`focus` border + 2px ring), error (2px `critical` border + message; result blocked), warning (`warning` helper only; computation continues), success (2px `success` border; used sparingly, e.g. recognized credential format), disabled (`opacity-disabled`). **Segmented** (`dt-seg`) replaces radio groups for 2–4 exclusive options such as sex or unit; pressed state is `surface` on `surface-sunken`.

**Consumer provides** label, value, unit, range (min/max/step for validation message), `error`/`warning` text, `disabled`. Do: state the expected range in the error. Don't: red text without an icon; placeholder as the only label.
