# Medicalcul: integration into DokTool

## Principle

Medicalcul supplies **calculation formats as data**: questions, point values, formulas, thresholds and citations. DokTool keeps its own engine, data model, admin workflow and design.

- **No second engine:** Medicalcul's JavaScript never runs in DokTool, whether in the app, the API or Admin Web.
- **Nothing written by AI:** every formula comes from a deterministic, tested translator. If a construct can't be translated exactly, the calculator is left out.
- **Drafts only:** every imported calculator lands as a draft. A reviewer who is not the author checks it, completes it and publishes it (ADR-006 D1, ADR-024).

## Where each piece fits (existing architecture, unchanged)

| Concern | Existing DokTool piece | What the import uses |
|---|---|---|
| Definition format | `apps/api/src/modules/calculators/engine/definition.ts` (schema v1) | The translator outputs exactly this, checked with `checkDefinition` |
| Storage | `calculators`, `calculator_versions` (Prisma) | Created through `CalculatorsAdminService.createCalculator` and `createVersion`, which audit every action |
| Admin management | Admin Web › Calculateurs (edit, sources, tests, preview, review, publish, retire) | Everything after the import happens here, by hand |
| Mobile UI | Existing catalogue, search and calculator screens; offline Dart engine | Published calculators appear there; no new screen |
| Access | `accessTier = STUDENT` (every V1 calculator, ADR-006 Q2) | Set on import, and can be changed by a publisher |

## Reuse status of each resource

| Resource | Count | Status |
|---|---:|---|
| `STRUCTURED_CALCULATION_DEFINITION` | 147 | **Converted through a deterministic adapter.** Importable as drafts; still need a primary source, test cases, limitations, EN texts and band severities before publication |
| `FORMULA_TEXT_AVAILABLE` | 155 | **Usable only as reference.** The logic needs a construct the engine lacks (several results, `Math.round`, arrays, dates, validation `return`s…): author them by hand from the primary literature, or extend the engine first |
| `METADATA_ONLY` | 98 | **Reference content, nothing to execute** (classification tables). Could become reference documents later |
| All | 400 | The Product Owner states that the publisher's permission was obtained (12 November 2026); keep the written agreement with the release records |

**Copyright position.** A medical score itself (its items, points and thresholds, as published in the literature) is a method, not a protected work. Medicalcul's pages, wording, selection and code are its author's work. DokTool keeps the data and the citations, never Medicalcul's prose or code. Even so, it should not ship content taken from Medicalcul without the author's written agreement. That question is for a lawyer, not for this report.

## Commands

```bash
# 1. Rebuild the catalogue from the unzipped archive (see sources.md)
npm run medicalcul:extract -w @doktool/api -- --raw ~/Library/Caches/doktool/medicalcul/raw-2026093014

# 2. Check that the committed catalogue matches the archive (byte-identical rerun)
npm run medicalcul:extract -w @doktool/api -- --raw ~/Library/Caches/doktool/medicalcul/raw-2026093014 --check

# 3. Import as drafts (author must hold calculators.draft); --dry-run lists, --only limits
npm run medicalcul:import -w @doktool/api -- --author editor@example.dz --dry-run
npm run medicalcul:import -w @doktool/api -- --author editor@example.dz --only abcd2,apgar
```

The import skips slugs that already exist, so running it again adds only new calculators.

```bash
# 4. Compare every importable calculator with Medicalcul's own page script (no database)
npm run medicalcul:verify -w @doktool/api -- --raw ~/Library/Caches/doktool/medicalcul/raw-2026093014

# 5. Publish the imported drafts (ADR-028): author and reviewer are two different admins
npm run medicalcul:publish -w @doktool/api -- --raw ~/Library/Caches/doktool/medicalcul/raw-2026093014 \
  --author editor@example.dz --reviewer reviewer@example.dz --dry-run
```

Publication was decided on 12 November 2026 (ADR-028), with the author's agreement as stated by the Product Owner. The script completes each untouched draft mechanically, writes its test cases from the values Medicalcul's page computes, and leaves as a draft any calculator whose DokTool result differs.

The extractor tests are in `apps/api/test/unit/medicalcul-extract.spec.ts` and use synthetic pages. Setting `MEDICALCUL_RAW=<raw dir>` also checks ABCD² on the real archive.

## Engine extensions that would cover more calculators (not done here)

| Extension | Calculators it would unlock (first blocking construct only) |
|---|---|
| Several results per calculator | 18 |
| `floor`, or rounding that matches `Math.round` | 33 |
| Constant tables (arrays indexed by a choice) | 24 |
| Validation rules for early `return`s, mapped to cross-field rules | 11 |

These numbers count only the first blocker. A calculator can have several, so each extension would unlock fewer than its count. Each extension is an engine change on both engines (TypeScript and Dart, kept in step by `packages/calculator-vectors`) and needs its own ADR.
