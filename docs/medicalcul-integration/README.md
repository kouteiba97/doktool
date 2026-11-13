# Medicalcul integration

The data and reports for turning Medicalcul's calculation formats into DokTool calculator drafts.

| File | Content |
|---|---|
| `report.md` | How the Android app updates its data (verified from the APK), what was retrieved, the classification and the next step |
| `sources.md` | Websites, APK, descriptor, archive, checksums; where the raw files live (outside git) |
| `integration.md` | How it fits DokTool, reuse status, commands, possible engine extensions |
| `source.json` | Provenance read by the extractor |
| `catalogue.json` | The normalised catalogue: 400 pages, 147 with a DokTool definition (generated) |
| `catalogue.schema.json` | JSON Schema of `catalogue.json` (generated) |
| `coverage.csv` | One row per page: fields, classification, reasons, readiness (generated) |

Generated files come from `npm run medicalcul:extract -w @doktool/api`; don't edit them by hand.

**Status:**

- Technical extraction is done for data version `2026093014`.
- Reuse permission is **not confirmed**.
- Clinical review is **required** for every calculator.
