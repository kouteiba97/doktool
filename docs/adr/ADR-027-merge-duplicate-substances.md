# ADR-027 · Grossesse · Allaitement: merging duplicate substances

**Status:** Accepted · 25 October 2026 (Product Owner)

**Context:** Spreadsheet imports (ADR-025) and manual entry can create two substances for one drug: a spelling variant, or a name with and without its salt or brand. Archiving one hides it but loses its names for search, and breaks the favourites, history and alternatives that point to it. Clinical content is reviewed and immutable once published (ADR-019), so a merge must not move or blend it.

## Decision

1. **A merge moves names, never clinical content.** Merging duplicate B into kept substance A:
   - adds B's French name, English name and synonyms to A's synonyms (those A doesn't already carry);
   - archives B (`enabled = false`) and records `mergedIntoId`, `mergedNames`, `mergedAt` and `mergedById`;
   - keeps B's profile versions on B, as history.

   If B had a published profile, it stops being shown, and the reviewer must acknowledge that explicitly. Carrying any of its content over to A is a normal new version of A, written and reviewed as usual.
2. **Reviewers only.** It needs `pregnancy.review`, a reason, a preview showing exactly what changes, and an audit entry on both substances.
3. **Refused when:**
   - B has a draft or a version in review;
   - B is already merged, or other substances were merged into B (merges never chain);
   - A is merged or archived;
   - A would exceed 30 synonyms.

   A database check guarantees that a merged substance is archived, never merged into itself, and that all its merge fields are set together.
4. **Links keep working:**
   - opening B in the app opens A (favourites, history, shared links);
   - an alternative pointing to B shows A's name, keeps B's id (opening it redirects) and is never shown on A's own profile;
   - the app's search finds A by B's names;
   - a spreadsheet import matches B's name to A, and ignores B.
5. **Reversible.** « Annuler la fusion » removes from A exactly the names the merge added and clears B's merge fields. B stays archived: showing it again is a separate visibility decision. A merged substance can't be shown or get a new version until the merge is undone.

## Consequences

- Migration `20261025090000_pregnancy_merge`:
  - the merge columns on `substances`;
  - a check constraint;
  - a partial index on `merged_into_id`.

  The trigram index of ADR-025 is now declared in `schema.prisma`, so schema diffs no longer propose dropping it.
- **API** (`pregnancy.review`):
  - `GET /admin/v1/pregnancy/substances/:id/merge-preview?into=`;
  - `POST /admin/v1/pregnancy/substances/:id/merge`;
  - `POST /admin/v1/pregnancy/substances/:id/unmerge`.

  `AdminSubstanceDto.mergedInto` names the kept substance.
- **Admin Web:**
  - « Fusionner avec… » on the substance page (choose, preview, acknowledge, reason);
  - a « Substance fusionnée » banner with « Annuler la fusion »;
  - a « Fusionnée dans … » badge in the list.
- `test/integration/pregnancy-merge.e2e.spec.ts` covers permissions, the acknowledgement, blockers, redirects, alternatives, import matching and the undo.
