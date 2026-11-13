# ADR-025 · Grossesse · Allaitement: spreadsheet import and server-side search

**Status:** Accepted · 24 October 2026
**Context:** The doctor keeps pregnancy and lactation information in Excel sheets: one row per drug and period, with a status word (« valide », « non valide »…), an alternative drug and a hyperlink to the source. Typing every profile by hand in Admin Web is too slow. In the app, the doctor wants to reach a drug's answer for a given period in a few taps. ADR-019's rules still apply: no safe/unsafe verdict, author ≠ reviewer, and published versions are immutable.

## Decision

1. **The import feeds the existing model.** It does not create a second drug table. Rows become `Substance` records and versions of `SubstanceProfileVersion`, plus `ClinicalSource` entries (one source can serve many periods and drugs, as before). The workbook is not kept. The batch keeps:
   - the file's sha256;
   - its headers;
   - every row's original cells, the admin's corrections, the last check and the records produced.

   These are kept in `pregnancy_import_batches` and `pregnancy_import_rows`, which can't be deleted, and are frozen once the batch is committed or discarded. A database trigger enforces both.
2. **An import only ever writes drafts.** Committing creates new substances and, per substance, either a new draft from the published version or an update of the importer's own open draft. A version in review, or another author's draft, blocks the row. Publication then follows ADR-019 and ADR-024 unchanged: a different admin with `pregnancy.review` approves. Bulk submit and bulk approve check each version on its own.
3. **Nothing is guessed:**
   - **Status words:** each one is mapped to a conduct by the admin at each import (Contre-indiqué / Éviter / Prise ponctuelle / no badge). There is no built-in default, and the word is kept beside the conduct (`reportedStatus`).
   - **Periods:** only explicit ones are read. T1, T2, T3, péri-partum, « toute la grossesse » (= the four) and allaitement are accepted. Anything else, such as « < 24 SA » or « post-partum », is an error.
   - **Drug names:** they match a library substance only by exact name or synonym (accent- and case-folded). Two matches make the row an error; similar names never match.
   - **Alternatives:** a name that matches nothing stays as text (`unresolvedAlternatives`), and review is refused until a person links it to a substance or removes it.
   - **Evidence level:** an import leaves it empty (`evidence.level = null`, allowed only in drafts) and review requires one.
   - **Conflicts:** when the library already says something different for that period, the row needs an explicit choice (update or keep).
4. **Sources and alternatives per period.** A row supports one period, so each period (and the lactation block) gains `sourceIds` (a subset of the version's sources) and `alternatives`. The pregnancy block's own alternatives still apply to every period.
5. **The file is untrusted:**
   - only `.xlsx` up to 5 MB and 5,000 rows, upload limited to 30 per admin per hour;
   - the zip signature is checked, and only the needed parts are inflated, with byte counting (20 MB per part, 60 MB total);
   - formulas are never evaluated (their stored value is read and flagged), and macros and other parts are ignored;
   - URLs must be http(s) without credentials and are **never fetched**;
   - all cells are plain text everywhere.

   Cell values come from `read-excel-file`. Hyperlink targets and formula markers come from the sheet XML through `fflate`.
6. **Safe commit.** The commit locks the batch row and runs in a single transaction: all or nothing. The admin sends the revision they reviewed, and a stale one is refused. A second commit (double click, retry) returns the stored result. Rows are rechecked against the library inside the transaction. A refused commit stores the new issues so the admin sees why.
7. **Search moves to the server.** `GET /v1/pregnancy/substances/search?q=&limit=&offset=`:
   - every word must appear in the substance's `search_text` (names and synonyms, accent- and case-folded, written by the API; a trigram GIN index serves partial words);
   - names starting with the first word come first, then A–Z;
   - pages are bounded (50 at most);
   - each result carries a per-period summary (conduct and evidence level), and only when the viewer may open the profile.

   The app debounces typing (300 ms) and no longer downloads the whole list. Without a connection it searches only the profiles kept offline and says so. Archived or superseded content never appears: search reads only published versions of enabled substances, and the client keeps no search cache across queries.

## Consequences

- Migration `20261024090000_pregnancy_import`:
  - new tables and guard triggers;
  - the `substances.search_text` column and its backfill;
  - the `pg_trgm` extension. The database must allow `CREATE EXTENSION pg_trgm`, which managed PostgreSQL usually does.
- New dependencies in `apps/api`: `read-excel-file` (9.3.12) and `fflate` (0.8.3, already used by it).
- Admin Web gains:
  - « Importer un fichier » with history;
  - a preview with column and status mapping, filters, row edits, exclusions and conflict choices;
  - library filters (search, state, archived, period + conduct);
  - bulk submit and bulk approve.
- The app gains period chips and a conduct badge on each result, a home search field « Médicament : grossesse · allaitement », and per-period sources and alternatives on the profile.
- **Global search (`/v1/search`).** It still ranks every published substance in the API, because it is typo-tolerant (design system section 12): an indexed pre-filter would drop typo matches. On 5,000 substances it measured p50 225 ms, and 2.4 s with 20 concurrent requests. Three changes with identical results brought it down:
  - only names, synonyms and access are loaded, not profile content;
  - the edit distance uses three rolling rows instead of a fresh matrix, proved identical to the original on 20,000 random pairs (`search-ranking.spec.ts`);
  - normalised text is memoised (bounded).

  It now measures p50 67 ms, and 456 ms with 20 concurrent requests. Ranking itself is 4–10 ms; the rest is loading and access decisions. Caching the candidate list would go further, but it could briefly show an archived drug, so it is left out until volumes call for it.
- Measured on 5,000 published substances (local PostgreSQL 18, Apple silicon):
  - search p50 4.2 ms and p95 12.2 ms per request, 20 concurrent p95 13.5 ms, about 5.8 KB per page;
  - importing 5,000 rows: upload and check 2.9 s, each recheck 0.8–0.9 s, commit 2.6 s, a repeated commit 4 ms.
