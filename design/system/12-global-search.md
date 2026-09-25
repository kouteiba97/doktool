# 12 · Global search — specification (V1)

Search is the front door (signature S1). It is a platform capability with its own index, ranking, languages and offline behaviour — not a page.

**V1 scope (v2.1, confirmed v2.2):** search lives in the mobile app only. the index covers exactly what V1 has — Reference Documents (Ordonnances, Certificates) and Calculators. It never returns a Drug Database, pediatric-rule, pregnancy/lactation, prescription-template or sponsored-content result, because none of those exist as content in V1. The index keeps a `type` facet (`ORDONNANCE` · `CERTIFICATE` · `CALCULATOR`, with room for a future `DRUG` value) so a later version can add a new result type without a search redesign — see `25-future-roadmap.md`.

## Entry points

| Surface | Entry | Behaviour |
|---|---|---|
| Mobile | Centre tab (raised disc), Home glass field | Full-screen overlay, keyboard up, focus in field, < 100 ms to interactive (overlay pre-mounted) |
| Contextual (mobile) | Library search fields (Ordonnances · Certificats · Calculateurs) | Same engine, scoped to one type |
| Admin Web | Console bar search | Separate admin search (users, transactions, reference models, calculators by name or ID) — not the user index |

The v2.1 web command palette and `/search` results page are Future Web reference (section 25).

## What is indexed — V1

| Entity | Fields matched | Result row shows |
|---|---|---|
| Reference Document (Ordonnance) | titleFr, titleEn, admin synonyms — matched in either language regardless of the UI language, accent-insensitive, typo tolerant | Title (UI language, falling back to French) · type · lock + reason when locked · "Voir le modèle" / "View model" |
| Reference Document (Certificate) | same fields as above | same |
| Calculator | Name (FR/EN), purpose, synonyms ("DFG", "clairance", "GFR") | Name · one-line purpose · lock + reason when locked |

Own documents, sponsored content, and any drug/indication/prescription-template entity from the pre-V1 draft are **not indexed** in this version — see "What moved to Future Roadmap" below.

## Language model

- **Bilingual (French and English)**, per the platform-wide decision (`19-language-formats.md`). Queries are case- and accent-insensitive ("paracetamol" = "paracétamol"), apostrophes and hyphens normalised, common abbreviations expanded in both languages. A query matches a Reference Document's name/description in either language, independent of which one the doctor is currently viewing the UI in.
- A synonym table per entity (maintained by the Super Admin) covers lay terms and frequent misspellings, in French and English.

## Matching and ranking

1. **Exact** name match, then **prefix**, then **synonym**, then **fuzzy** (Damerau-Levenshtein ≤ 1 for length ≤ 5, ≤ 2 above; phonetic key for both languages).
2. **Intent boosts**: a query naming a category (e.g. "arrêt de travail" / "sick leave" → Certificates) promotes that group to first position.
3. **Personal boosts** (small, never above exact matches): favourites, recents, the user's specialty.
4. **Never boosted by commerce** — V1 has no sponsored content to boost or exclude, but the rule stays written into the ranking contract for when partnerships return (lock L12, `25-future-roadmap.md`).
5. Group order follows the best match score of each group; each group shows 3 rows + "Voir les n résultats" / "See N results".

## Interaction

- Suggestions after 1 character (local index), grouped results after 2 characters (server, cached; local when offline).
- Highlight: matched substring in `brand` weight 600 (no fill colour).
- Mobile: tap = primary (open); long-press or `⋯` = actions sheet (Voir le modèle / View model · ★). Swipe down closes. Chips filter by type (Ordonnances · Certificats · Calculateurs) in place.
- Recent searches: last 10 shown, synced to the user's own activity history, removable individually and all at once; never sent to analytics as text.

## Row actions (search → act)

| Row type | Primary | Actions |
|---|---|---|
| Ordonnance reference model | Voir le modèle / View model | ★ |
| Certificate reference model | Voir le modèle / View model | ★ |
| Calculator | Ouvrir / Open | ★ |

## States

| State | Behaviour |
|---|---|
| Empty query | Recent searches · browse chips (Ordonnances · Certificats · Calculateurs) · role/specialty suggestions (3) |
| Typing | Suggestions; skeleton rows only after 200 ms |
| Results | Grouped |
| Partial | Server slow > 1.5 s: local results shown with caption "Résultats locaux — recherche complète en cours" / "Local results — full search in progress" |
| No results, confident correction | Auto-correct: "Résultats pour **certificat de grossesse**" + "Rechercher plutôt « certificat grossesse »" |
| No results | Did-you-mean (≤ 3), browse chips, "Signaler un contenu manquant" / "Report missing content" (opens a 2-field form routed to the Super Admin) |
| Ambiguous | Disambiguation list by category (ScreenSearchStates) |
| Offline | Local index over downloaded packs; cache chip on rows; "Non disponible hors ligne" / "Not available offline" group for server-only content |
| Locked | Results visible for every access context (Demo, Student, unpaid); locked rows show a lock and the reason word; tapping opens the locked sheet (section 27). Never hidden from search |
| Error | Local results + neutral line "Recherche complète indisponible" / "Full search unavailable" + retry |

## Performance contract

Suggestions ≤ 50 ms (local), grouped results ≤ 150 ms p95 (server, cached), overlay open ≤ 100 ms, no spinner ever. The local index is built on the device from the offline manifest (section 18) and covers downloaded items; the Demo uses the server index only.

## Analytics

Events `SEARCH_PERFORMED`, `REFERENCE_SEARCHED`, `REFERENCE_OPENED` (result count, groups, zero-result flag, entity id when opened) — **never the query text** (Lock L42). The user's own search history (Profile › Activité) is stored for the user only and never exposed to admins (section 16).

## What moved to Future Roadmap

Drug (DCI, brand, class, ATC), Algerian product, indication/diagnosis, clinical concept, pediatric rule, pregnancy/lactation profile, prescription template, own documents, and the separate sponsored-content result block are all removed from the V1 index along with the modules they came from (`25-future-roadmap.md`). The `type` facet and the ranking/firewall rules above are written so re-adding a `DRUG` (or `DOCUMENT`, `SPONSORED`) result type later does not require redesigning search — only adding the entity, its fields and its row template.
