# Medicalcul: update-chain investigation and extraction report

Date: 23 October 2026. Every statement below is backed by an artefact whose checksum is recorded in `source.json` and `sources.md`. Anything not verified is marked as such.

## 1. Result in one paragraph

The Android app gets its calculators from a **single versioned zip archive** named in a small descriptor file (`_update.cvf`) that it reads from five hard-coded mirrors. I retrieved that exact archive: data version `2026093014`, byte-identical on two mirrors. It holds 400 HTML pages, and each calculator's logic is inline JavaScript (`f_Calculer()`). A deterministic translator, which executes nothing, turned **147 of them exactly into DokTool calculator definitions**. All 147 pass DokTool's own validator and are importable as **drafts**. 155 more have logic but use constructs the DokTool engine can't represent exactly. 98 compute nothing (reference tables). No calculator is clinically reviewed, and permission to reuse the content has not been obtained.

## 2. Update chain (verified from the APK)

Static decompilation of `medicalcul.apk` (version from `medicalcul.free.fr`, sha256 `838eb94e…`) with jadx 1.5.6. The APK was never installed or run.

| Step | Evidence (decompiled code) | Finding |
|---|---|---|
| Mirror list | `defpackage/qd.java`, `String[] b` | `http://medicalcul.free.fr/`, `https://medicalcul.pages-perso.free.fr/`, `https://medicalcul.mgdsoft.fr/`, `http://imhotepix.net/medicalcul/`, `http://imhotepix.net:81/mirrors/medicalcul/` |
| Update discovery | `MainActivity.t(rq)` | Tries each mirror in order: `GET <mirror>_update.cvf`. Accepts it only if it starts with `#medicalcul#v3#`. |
| Descriptor format | same method, `split("[\r\n]+")` | line 2 = data version (long), line 3 = archive file name, line 4 = start page |
| Decision | `c1.run()` case 5 | Downloads only when the descriptor version is greater than the stored `LastRetrieveNumber` |
| Download and install | `rq.g(url, tmp, root)` | `GET <mirror><archive>`. The whole `files/medicalculroot/` folder is deleted, the zip is extracted (with a zip-slip guard), and the start page is renamed to `index.html` |
| Integrity | `rq.g` | **No checksum and no signature**: only the version number and the `#medicalcul#v3#` header |
| Scheduling | `DataUpdateWorker` (WorkManager) | Periodic background check, by default only on Wi-Fi, with a manual option in the settings |
| Use offline | `MainActivity` | A WebView serves `files/medicalculroot/` through `https://appassets.androidplatform.net/localfiles/`. Pages call `MSSAndroidFunction.storeHistory(...)` (a JS bridge for history only) |
| Packaged data | `unzip -l` of the APK | **No calculator page ships in the APK**: everything comes from the archive |

Current descriptor (identical on `free.fr`, `mgdsoft.fr`, `imhotepix.net` and `imhotepix.net:81`):

```
#medicalcul#v3#
2026093014
medicalcul.zip
index_android.html
```

- **Archive:** `medicalcul.zip`, 9,390,345 bytes, sha256 `2909f20a…`, identical from `medicalcul.free.fr` and `medicalcul.mgdsoft.fr`.
- **Unverified:** `pages-perso.free.fr` didn't answer for the descriptor, and `imhotepix.net/medicalcul/medicalcul.zip` didn't serve the archive. The `:81` mirror's archive was not tried.

## 3. What the archive contains

- **Contents:** 532 files: 405 HTML, 1 shared script `_scripts.js`, 1 stylesheet, 1 font, and images.
- **Calculator pages:** 400 pages outside the indexes and start pages (`index*.html`, `_index*.html`). 385 are listed in the app's alphabetical index; the 15 unlisted pages include the version history, the privacy page and some versioned TNM/psychiatry forms (see `coverage.csv`, column `indexed`).
- **Format:** per page, an HTML form for the inputs (radio groups with point values, checkboxes, number fields, lists) and the result fields, plus inline JavaScript `f_Calculer()` for the logic, an interpretation paragraph and references. 30 specialties; 880 bibliographic references in total, with 5 pages that have none.
- **The website is the same data:** the pages on the public sites are the same content (compared after normalising line endings for `abcd2.html`, `_scripts.js` and `_indexalpha.html`). The app archive is used as the authoritative source because it is versioned.

## 4. Classification of the 400 pages

| Classification | Pages | Meaning |
|---|---:|---|
| `STRUCTURED_CALCULATION_DEFINITION` | **147** | Logic translated exactly into a DokTool definition that passes `checkDefinition`. Importable as a draft. |
| `FORMULA_TEXT_AVAILABLE` | **155** | `f_Calculer` exists (executable JS) but uses a construct without an exact engine equivalent. Not imported. The reason is in `coverage.csv`. |
| `METADATA_ONLY` | **98** | No computation: 95 reference tables or classifications whose `f_Calculer` writes no result, plus 3 pages without `f_Calculer` (`conversions`, `androidhistory`, `privacy_medicalcul`). |
| `UNRESOLVED` | 0 | Every page could be read. |

- **The 147:** 118 use only choices and checkboxes (scores), 29 include number fields, and 26 come with interpretation bands.
- **Main reasons a page stays out (first blocking construct):**
  - `Math.round` (25): it rounds halves up, while the engine rounds them away from zero;
  - arrays (24);
  - several numeric results on one page (18): the engine has one result per calculator;
  - early `return` (validation, 11);
  - loops other than a simple counter (9);
  - `Math.floor` (8);
  - a result that is text on one branch and a number on another (11);
  - formulas over 2,000 nodes, not reviewable (8);
  - and 30 single cases (dates, `switch`, DOM display changes…).
- **Why "exact" holds:** the translator accepts only constructs whose meaning is identical in the engine. Examples: `x * 1`, `+ - * /`, `Math.sqrt/log/log10/exp/pow/min/max`, `if/else` and conditional expressions, counted loops, radio and checkbox points (as `_scripts.js` defines them), and bands only where the bounds convert exactly (integer results, or `from ≤ v < to`). Anything else stops the translation.
- **One deliberate difference:** Medicalcul computes with an empty field as 0, while DokTool shows no result until the field is filled. That is stricter, and it doesn't change any result that has all inputs.

## 5. What a draft still needs (review notes in each entry)

None of these values is in the source, so the translator does not invent them:

- **Primary source** (`CalculatorSource`): the page's citations are kept in `catalogue.json` but aren't structured enough to fill authors, year and formula location reliably.
- **Test cases:** none are invented. The reviewer writes them, and publication requires them.
- **Limitations:** a `[À COMPLÉTER]` placeholder.
- **English texts:** copied from French.
- **Band severity:** set to `info` everywhere.
- **Number fields:** the unit is taken from the page (or `1` when none); there are no ranges and display decimals are 2.
- **Labels:** 3 inputs have no label on the page.

## 6. Readiness and permission

| | Status |
|---|---|
| Technical | `SOURCE_DISCOVERED` → `UPDATE_RESOURCE_IDENTIFIED` → `DATA_RETRIEVED` → `DATA_PARSED` (400) → `DATA_NORMALIZED` (147) → `DEPENDENCIES_IDENTIFIED` → `INTEGRATION_FEASIBILITY_ASSESSED` |
| Reuse permission | **`NOT_CONFIRMED`**. No licence is published; © Micromega Software System; contact philippe.mignard@free.fr |
| Clinical | `CLINICAL_REVIEW_REQUIRED` for every calculator. Presence in Medicalcul is not a review. |

## 7. Recommended next step

1. Ask Dr Mignard for written permission to reuse the calculation formats; the copyright position is in `integration.md`.
2. In Admin Web, start with the most-used imported drafts: add the primary source (from the citations in `catalogue.json`), write the limitations and the English texts, and add test cases. A **different** admin then reviews and publishes them.
3. The 155 `FORMULA_TEXT_AVAILABLE` calculators need either an engine extension (one result per calculator is the main limit) or an author writing the definition by hand from the primary source.
