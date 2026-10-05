# ADR-019 · Grossesse · Allaitement (Phase 19)

**Status:** Accepted · 4 October 2026
**Context:** Product Owner decision of 4 October 2026 — "the whole pregnancy" module ships, its clinical content will be supplied and corrected over time by a doctor ("a lot of updates, not final"). Design system section 25 (Appendix B: evidence treatment, evidence levels, sources registry, content lifecycle) and the components ScreenPregnancyDesktop, ScreenLactationMobile, EvidenceBlock. This reverses, for this module only, decision Q of the architecture audit and Lock L32.

## Decision

1. **Scope.** Pregnancy and lactation profiles per substance (DCI): the four periods (1er, 2e, 3e trimestre, péri-partum), lactation (conduct, relative infant dose, maternal half-life, reported effects, special populations), alternatives, sources, review. **Still deferred:** the rest of the Drug Database — posology, pediatric dosing, interactions, contraindications, Algerian products, renal/hepatic adjustment. A `Substance` is not a drug-database entry; it carries only a name, ATC code, synonyms and its profiles.

2. **Clinical safety rules kept from the design system.**
   - Conduct ("what to do": Contre-indiqué, Éviter, Prise ponctuelle — icon + word) and evidence level ("how sure": 0–4, neutral meter + word + population) are separate fields; there is **no safe/unsafe verdict** anywhere, in data or UI.
   - Level 0 is a full « Absence de données — ce n'est pas une preuve d'innocuité » block with alternatives, never an empty area.
   - Every block ends with the evidence footer: sources (title · edition/year), reviewer and review date, version, « Signaler une erreur ».
   - Conflicting sources show an info Alert naming both sources and the reviewers' synthesis.
   - A newer version in review shows « La version publiée reste la référence ».

3. **Content lifecycle** (section 25 Appendix B): `DRAFT → IN_REVIEW → PUBLISHED`, with `CHANGES_REQUESTED` back to the author; a published version is immutable and superseded by the next one, never edited or deleted. Database triggers enforce the transitions, immutability, one published and one open version per substance, at least one source before publishing, and frozen sources once in review.
   - **Author ≠ reviewer** (grants `pregnancy.draft` / `pregnancy.review`), as for calculators (ADR-006 D1). The design system asks for **two** medical reviewers for pregnancy content; V1 enforces one reviewer distinct from the author, because the clinical team is one doctor today. Raising it to two is a lifecycle change to schedule with the Product Owner.
   - The review gate lists what is missing (both blocks, the four periods, a conduct sentence where a period has a badge, the lactation conduct sentence, ≥ 1 source, alternatives that exist, conflicts citing the version's own sources).
   - Presets: `CALCULATOR_EDITOR` authors (`pregnancy.read`, `pregnancy.draft`); `CLINICAL_REVIEWER` reviews and publishes (`pregnancy.read`, `pregnancy.review`); visibility (demo sample, enabled) is a reviewer's decision. Finance grants are never combined with them.

4. **Access** (section 27, ADR-010): a new content type `pregnancyProfiles` and feature `pregnancy.view`, following the reference documents — Professional: all; Student (ADR-006 Q2), unpaid professional (Q1) and Demo: `demoSample` profiles, the others listed and locked with their reason; Restricted: none. A locked profile returns no content.

5. **Where it lives.** API module `pregnancy` (the 19th module; owns `substances`, `substance_profile_versions`, `clinical_sources`, `profile_version_sources`, `content_reports`). Global search gets a `PREGNANCY` group (names and synonyms; « grossesse », « allaitement »… put it first). The app adds « Grossesse » to the library; Admin Web adds « Grossesse · Allaitement » under Bibliothèque. Analytics gain `PREGNANCY_VIEWED` (section and version only).

6. **User reports.** « Signaler une erreur » records the block, a reason code and an optional comment (500 characters, the app asks for no patient data) for people who can read the profile; the clinical team resolves them in Admin Web. Account deletion detaches the reports from the account (ADR-018).

## Consequences

- **Offline (5 October 2026).** The offline manifest (`GET /v1/offline/manifest`) carries every profile the account opens, in full (`substances`, part of the data version as `sub:id:version`); the app keeps them in its `offline_substances` table, replaces one when its version changes and purges them with the calculators when the entitlement is lost or the person signs out. Without a connection the library and the profile screen read that copy; a profile never kept says « Connexion requise ».
- **Favorites and history (5 October 2026).** `FavoriteTargetType.SUBSTANCE` and `ActivityKind.PREGNANCY_VIEW` (one entry per opening, the substance id only — never a section or a note); the favorite star sits on the profile header, and « Activité » lists them under « Grossesse ». Admin Web counts them with the other favorites and history entries.
- No profile content ships with the code: the doctor authors every profile in Admin Web.
