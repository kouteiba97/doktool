# 28 · Calculator safety architecture and formula governance — V1

**v2.2 (25 September 2026).** Clinical calculators are an active V1 module and a clinical-safety surface. Every formula has a real, traceable medical source; nothing is invented, undocumented, AI-generated or silently altered. Source: *DokTool V1 — Architecture Audit* §9. Locks L23, L41.

## Pipeline

```
Calculator (stable id, slug)
  └── CalculatorVersion  (immutable once published)
        ├── definition
        │     ├── inputs[]            CalculatorInput + CalculatorValidationRule[]
        │     ├── formula             CalculatorFormula (declarative AST — no code, no eval)
        │     ├── interpretation[]    bands on the result
        │     └── limitations         FR/EN text
        ├── sources[]                 CalculatorSource (≥ 1 PRIMARY)
        ├── testCases[]               CalculatorTestCase (worked examples from the source + edge cases)
        └── review                    authoredBy ≠ reviewedBy, reviewedAt, testRun
                     │
     DRAFT ──► IN_REVIEW ──► PUBLISHED ──► RETIRED
                     publish requires: primary source · all test cases pass on the backend engine ·
                     reviewer ≠ author · review note · definition checksum recorded
```

## Definition types

| Type | Fields |
|---|---|
| **CalculatorInput** | key, labelKey (i18n), kind `NUMBER · CHOICE · BOOLEAN · INTEGER`, quantity (e.g. `BODY_WEIGHT`, `SERUM_CREATININE`, `AGE_YEARS`), canonicalUnit, allowedUnits[], defaultUnitByLocale?, required, decimals, choices[] (CHOICE: value, labelKey, points?) |
| **CalculatorValidationRule** | `hardRange` (physiologically impossible → **invalid**, blocks), `validatedRange` (the population the formula was validated on → outside = **not computed**, reason shown), `plausibleRange?` (inside validated range but unusual → neutral "Check the value" note, does not block), cross-field rules (e.g. `age ≥ 18` for an adult-only formula) |
| **CalculatorFormula** | JSON AST over a closed operator set: `+ − × ÷`, `pow`, `sqrt`, `ln`, `log10`, `exp`, `min`, `max`, `round(n)`, `if(cond, a, b)`, `piecewise`, `sum(points)`, comparisons; references only declared input keys in their **canonical units**. No string evaluation, no custom code per calculator. |
| **Interpretation** | ordered bands `{from, to, severity: info · caution · warning · critical, labelKey}` — rendered as icon + word (Lock L5) |
| **CalculationResult** | value, unit, band, versionId, definitionSha256, computedAt, engine `server · device` — never persisted server-side with inputs |

## Units

Unit conversion lives in one **unit registry** keyed by quantity (e.g. `SERUM_CREATININE: µmol/L ↔ mg/dL, factor 88.42`), each factor itself carrying a `CalculatorSource` of role `UNIT_CONVERSION`. Inputs are converted to canonical units before evaluation; the conversion is displayed, never silent. Changing the unit of a field that already holds a value converts it and shows an inline "Converted: 70 kg = 154.3 lb" note for 4 seconds; the unit is always printed next to the number in the field, the result and the copied text.

## Engine

A deterministic evaluator (pure function: definition + canonical inputs → result | invalid | outOfValidatedRange) implemented twice: **TypeScript** in the backend (authoritative; used for publication tests, admin preview and online evaluation `POST /v1/calculators/{id}/versions/{v}/evaluate`) and **Dart** in the mobile app (offline and instant results). Both are run in CI against every published version's test cases plus a shared vector suite (`packages/calculator-vectors`). The mobile app additionally runs a version's test cases once when it installs that version into the offline store and refuses to use a version that fails (falls back to online evaluation and reports the failure). Floating-point: IEEE-754 double in both engines; rounding happens only at the formula's declared `round` nodes and at display, with the declared decimals.

## Mobile calculator UX (safety requirements)

Numeric fields use the numeric keypad (`TextInputType.numberWithOptions(decimal: true)`) and accept both `,` and `.` as decimal separator, normalising to the active locale for display. Every numeric field is `[ value ] [ unit ▾ ]` with the unit selector inside the field; single-unit quantities show the unit as a fixed suffix. Finite choices use segmented controls when there are at most 4 options and each fits on one line at the person's text size; otherwise (long answers, or more than 4) a list of full-width rows showing the whole answer, one tap to choose (ADR-026); booleans use a two-option segmented control, never a checkbox. Required fields are marked with the word "required" in the label line, optional fields with "optional" — not an asterisk alone. Validation runs on field commit (keyboard "next"/"done", focus change, or 400 ms after typing stops) — never on every keystroke, so a half-typed "7" on the way to "70" never produces a result. The result area reads "Complete 2 required fields" until every required input is valid; then the result appears in the sticky glass result bar and the full result block (value in `result` style + unit, interpretation band, formula in mono with the inputs substituted, source citation with version and date, limitations). Outside the validated range the result area shows "Calculation not available — {input} outside the range this formula was validated for ({range from the source})" and no number (the range always comes from the calculator's source, never from this document). The copied text always includes value, unit, calculator name and version.

## Admin governance (Admin Web · ScreenCalculatorAdmin)

The admin sees, for every version: the definition rendered readably (inputs, units, ranges, formula, bands, limitations), its sources with edition and formula location, the test cases with expected vs engine output and the last run, author, reviewer, dates and checksum — enough to answer *where did this formula come from, which version of the source, when and by whom was it reviewed, and which tests passed*. Publishing is blocked unless there is a primary source, every test passes on the backend engine, and the reviewer is not the author. Published versions are immutable; changes are new versions; retiring a version replaces it on devices at the next sync.

## What users see (mobile)

Result block → formula with values substituted (mono) → **Source**: citation (authors, title, year), edition/version, "Revu par Dr … le …", calculator version chip (`v3`) → **Limitations** (collapsed). The source sheet (ScreenCalculatorStates) lists all sources and the validated ranges. Copying a result always includes value, unit, calculator name and version.
