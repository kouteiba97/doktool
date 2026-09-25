# ADR-003 · Declarative calculator definitions, dual deterministic engine

**Status:** Accepted · 25 September 2026
**Context:** audit §9, design system section 28, Design Lock L41

## Decision

- A calculator is data, not code: a `CalculatorVersion.definition` holds typed inputs, units (via a sourced unit registry), hard / validated / plausible ranges, a formula AST over a closed operator set, interpretation bands and limitations.
- A version needs ≥ 1 `PRIMARY` source, passing test cases on the backend engine, and a reviewer different from its author before it can be `PUBLISHED`. Published versions are immutable; a change is a new version.
- Two engines evaluate the same definitions: **TypeScript** in `apps/api` (authoritative) and **Dart** in `apps/mobile` (offline). They share data (`packages/calculator-vectors`), never code. CI fails if either disagrees with a vector; the app self-tests a version before using it offline.
- No result is ever shown while an input is invalid or outside the validated range.
- **No formula is ever generated or altered by AI, and none is invented.** Formulas are transcribed from the cited source by a human author and checked by a human reviewer.

## Consequences

- Author ≠ reviewer is enforced by the API and by a database `CHECK` constraint. See ADR-006 (Q4) for who holds each role.
