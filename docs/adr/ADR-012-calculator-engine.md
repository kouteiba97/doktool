# ADR-012 · Calculator engine and governance (Phase 7)

**Status:** Accepted · 25 September 2026
**Context:** ADR-003, audit §9, design system section 28, Lock L41

## Decisions

1. **No clinical number lives in code.** The engine knows operators, not medicine. Every formula, range, band, unit and conversion factor is part of a version's `definition`. An admin enters it from the cited source; a reviewer who is not the author checks it; it is immutable once published.
   - **Deviation from the audit:** the audit describes one global unit registry. Here each version declares the conversions it uses: factor to its canonical unit, plus where the factor comes from in the source. A version with any conversion cannot be published without a `UNIT_CONVERSION` source. The effect is the same traceability, and no factor is ever authored by engineering.

2. **Labels are inline FR/EN text** (`{ fr, en }`), not catalogue keys. Calculators are content created at runtime, and the compiled app catalogue cannot contain them.

3. **Definition format (schema version 1)**, validated with Zod and then checked statically before a draft is saved:
   - **inputs:** `NUMBER`, `INTEGER`, `CHOICE`, `BOOLEAN`. Numbers have a canonical unit and their allowed units. Ranges are given in canonical units: `hardRange` makes the input invalid, `validatedRange` means "not computed", `plausibleRange` adds a note.
   - **crossFieldRules:** boolean expressions that must hold; when one fails the outcome is `INVALID` or `OUT_OF_VALIDATED_RANGE`.
   - **formula:** a JSON AST over a closed operator set:
     - arithmetic: `num`, `input`, `add sub mul div pow sqrt ln log10 exp min max sum round`;
     - control: `if`, `piecewise`;
     - comparisons and logic: `lt le gt ge eq ne and or not`;
     - input helpers: `present`, `points`, `bool`, `str`.
   - **result** (unit, display decimals), **interpretation** bands, **limitations**.

   The static checks cover:
   - input references resolve;
   - operand types are consistent;
   - choice literals exist;
   - `points` is used only on scored choices;
   - range nesting (plausible ⊆ validated ⊆ hard);
   - band order;
   - AST size limits.

4. **Engine contract:** a pure function `evaluate(definition, inputs) → RESULT | INVALID | OUT_OF_VALIDATED_RANGE`.
   - Order of evaluation: presence and type → unit conversion (reported, never silent) → hard range → cross-field rules → validated range → plausibility notes → formula.
   - Numbers are IEEE-754 doubles. Rounding happens only at `round` nodes; display decimals are returned, not applied.
   - A non-finite result is `INVALID` (`NON_FINITE_RESULT`).
   - The engine version is recorded on every published version (`ts-1.0.0`).

5. **Shared vectors:** `packages/calculator-vectors` holds definitions and expected outcomes that exercise every operator and every safety outcome. They use abstract, non-clinical formulas on purpose. The TS engine runs them in CI now; the Dart engine will run the same files in Phase 12.

6. **Governance (Admin Web, `/admin/v1/calculators`):**
   - Workflow: draft → edit the definition, sources and test cases (only while DRAFT; enforced by the database) → run tests → submit → review → publish or return → retire.
   - **Publish** re-runs every test on the backend engine and requires: a PRIMARY source; at least one test case; all tests passing; a UNIT_CONVERSION source whenever the definition converts units; a review note.
   - **Reviewer rule:** the reviewer may not be the author, nor any admin who changed the draft (checked against the audit log).
   - Publishing a new version retires the previous one. Retiring the current version makes the calculator unavailable until another version is published.
   - Every action is audited. Decisions (return, publish, retire, metadata changes) require a reason.

7. **Users:**
   - `GET /v1/calculators` and `GET /v1/calculators/{slug}` return the published version, with the full definition, sources and review only when the item is AVAILABLE for the viewer.
   - `POST /v1/calculators/{slug}/versions/{n}/evaluate` runs the authoritative engine. Inputs are never stored or logged.
   - The offline manifest carries each openable calculator's published definition, checksum and test cases, so the device can self-test before using a version.
