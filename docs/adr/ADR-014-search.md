# ADR-014 · Search index and calculator purpose (Phase 10)

**Status:** Accepted · 26 September 2026
**Context:** design system section 12, audit §4, Locks L32, L38, L42

## Decisions

1. **One endpoint, computed on request.** `GET /v1/search?q=&type=` accepts user and demo tokens. The candidates are the viewer's lists: enabled reference models of both types and published calculators, each carrying the server's access decision. They are scored in memory.
   - V1 content is a few hundred items, so no search engine or extra index table is needed.
   - A later version can move scoring to PostgreSQL full text without changing the contract.

2. **Ranking** (`search/ranking.ts`, unit-tested), from highest score to lowest:
   - exact title;
   - title prefix;
   - exact synonym;
   - every query word is the start of a title word;
   - every query word appears in the title;
   - partial synonym;
   - fuzzy (Damerau-Levenshtein: 0 typos up to 2 letters, 1 up to 5, 2 above);
   - calculator purpose.

   Text is compared without case, accents, apostrophes or hyphens, in both languages whatever the interface language.

   A query naming a category (« certificat », « ordonnance », « calculateur »…) puts that group first. Those words are left out of matching.

   Nothing is boosted by commerce. Personal boosts (favorites, recents) wait for the activity module.

3. **Grouped results:** best group first, 3 rows per group with the group total (« Voir les n résultats »). A `type` filter returns up to 50 rows of that type. When nothing matches, up to three close titles are suggested.

4. **Locked items stay in place** with their lock reason (Lock L38). Search never hides content the viewer cannot open.

5. **Privacy:** the query text is never stored, logged or audited (Lock L42). The rate limit (120 per minute per user or demo session) stores only a hashed subject.

6. **Synonyms** are stored in `search_synonyms`, owned by the `search` module. They are replaced as a whole list per model or calculator (at most 30 terms of up to 80 characters), with a reason and an audit entry.
   - Model synonyms need `library.read` to read and `library.write` to change.
   - Calculator synonyms need `calculators.read` to read and `calculators.draft` to change.
   - Each API instance caches synonyms for 60 seconds.

7. **Calculator purpose:** `purposeFr` and `purposeEn` (optional, 160 characters at most) hold the one-line description shown under a calculator's name in lists and search. They are metadata, not part of the versioned definition, and never contain a formula.
