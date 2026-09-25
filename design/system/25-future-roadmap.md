# 25 · Future roadmap

This file consolidates everything the 23 and 25 September 2026 corrections removed from **active V1** — not because it was a bad idea, but because DokTool does not yet have the medical staff resources to maintain a safe clinical drug database, and because generating a real patient document requires the same clinical governance the drug database does. Nothing here is deleted: every screen, component and data model below stays in this design system, unmodified, as reference for when the team is ready to build it. Nothing here is scaffolded as an empty "coming soon" screen in V1 — it simply does not appear in V1 navigation, the V1 screen inventory (`08-screen-inventory.md`), or V1 search results.

## 0 · DokTool Web (user application) — added 25 September 2026

**What it is**: a full DokTool web client for doctors, residents and students (home, search palette, libraries, calculators, profile, subscription), consuming the same backend as the mobile app.

**Why deferred**: V1 is mobile-first and mobile-only for end users (Lock L33). Building a second user client now would double the UI surface before the product is proven on mobile.

**What V1 does to prepare**: nothing in the UI. The backend is client-agnostic (versioned `/v1` API with OpenAPI, server-side entitlements, catalogue-key errors, calculator definitions as data with shared test vectors, signed-URL file access, server-held preferences — section 26), so the web client can be added without changing identity, subscriptions, reference documents, calculators, favorites, activity, analytics, permissions, verification or finance.

**Preserved references (Future Web)**: `ScreenHomeDesktop`, `ScreenSearchDesktop`, `SearchCommand`, `ScreenCalculatorLibrary`, `ScreenProfilePractice`, `ScreenReferenceLibraryWeb`, `ScreenReferenceViewerWeb`, `ScreenTabletDrug`, `Sidebar` (physician), `TopBar`, and the v2.1 web shell, URL map and keyboard map. Their content predates V1 (some show drug items) — they are **layout** references for a future web client, not content references.

**To bring it back**: a Next.js (or equivalent) app in `apps/web`, the physician web shell from the references above re-populated with V1 content, the same generated TS API client and i18n catalogue as Admin Web, and a web calculator engine verified against the shared vectors (or server evaluation).

## 1 · The Drug Database

**Concept tree**: `Drug → Profile, Posology, Pediatric dosing, Pregnancy, Lactation, Interactions, Contraindications, Alternatives, Local products, References`. This is the single largest deferred area — everything else in this file exists either to serve it (partnerships, sponsored content) or was generated from it (prescription models tied to specific drugs).

**Why deferred**: a drug database that doctors rely on for dosing, contraindications and interactions is only trustworthy with an ongoing clinical review pipeline — sourced, versioned, double-reviewed for pediatric and pregnancy content (Appendix B of this file's full `DRAFT → IN_REVIEW → APPROVED → PUBLISHED` lifecycle). DokTool does not yet have the medical staff to run that safely, so it does not ship an unreviewed drug database instead.

**What comes back with it**: drug detail screens (`ScreenDrugDesktop`, `ScreenDrugMobile`, `ScreenTabletDrug`), indications/posology/renal/hepatic/contraindications/adverse-effects sections, Algerian products (`ScreenDrugProducts`), version history (`ScreenDrugHistory`), pediatric dosing (`ScreenPediatricMobile`, `ScreenPediatricDesktop`, `DoseCard`, `ScreenPediatricStates`), pregnancy (`ScreenPregnancyDesktop`) and lactation (`ScreenLactationMobile`) profiles, the interactions checker (`ScreenInteractions`), the full evidence-treatment vocabulary of Appendix B of this file (evidence footer, evidence meter, evidence levels, sources registry), the admin drug editor (`ScreenDrugEditorAdmin`, "Médicaments" in section 07) and the full `Centre de revue clinique` review queue (field-level diff, four-eyes publishing for pediatric/pregnancy content), the `DRUG_SEARCHED`/`DRUG_VIEWED`/`PEDIATRIC_CALCULATION`/`PREGNANCY_SEARCH` analytics vocabulary and the "Médicaments" and "Drug activity" dashboards (`16-analytics.md`), and a `DRUG` search-result type.

**To bring it back**: add the `Drug` entity family, reinstate the `CLINIQUE` sidebar group (or fold Drug into `BIBLIOTHÈQUE` as a third content type), extend the search index's `type` facet with `DRUG` (the facet already exists — see `12-global-search.md`), and reactivate Appendix B of this file's content lifecycle for real. None of this requires touching the Reference Library or Calculators, which are independent V1 modules.

## 2 · Prescription and certificate generation

**What it was**: a real document-generation engine — `Template`, `MedicationRow` editor, clinical validation before export (contraindication/dose/allergy checks), `ExportSheet` (PDF/Print/Copy/Image/Share), and a "My documents" library (`ScreenDocuments`) with rename/duplicate/delete/share.

**Why deferred**: generating a document a doctor might actually sign and hand to a patient needs the same clinical safety net as the drug database (dose limits, interaction checks, an audit trail on every override) — DokTool V1 replaces this entirely with the **Reference Library** (`13-document-engine.md`): read-only example PDFs the Super Admin curates, which a doctor consults before writing the real document independently, outside DokTool. This is not a smaller version of the generator — it is a different, much simpler model (a static PDF plus metadata, not a data-driven document).

**Preserved screens/components**: `ScreenPrescriptionLibrary`, `ScreenPrescriptionEditor`, `ScreenPrescriptionMobile`, `ScreenPrescriptionValidation`, `ScreenCertificateEditor`, `ScreenDocuments`, `MedicationRow`, `DocumentPreview`'s editable/watermarked use, `ExportSheet`.

**To bring it back**: this would sit *alongside*, not replace, the Reference Library — a doctor could still browse reference models and separately generate a real document. It needs its own data model (a prescription/certificate distinct from `ReferenceDocument`), the clinical validation pipeline, and an export mechanism DokTool V1 deliberately does not have (Lock L31).

## 3 · Pharma partnerships and sponsored content

**What it was**: `Partnership` and `SponsoredContent` entities, editorial review separate from clinical review, placement rules keeping sponsored material out of clinical results (Appendix A of this file).

**Why deferred**: the module had no surface left once the Drug Database — the page a sponsored banner or link needed to sit beside — became future roadmap too. There are also no partnerships or sponsored relationships to manage in V1, and the design lock keeps the Reference Library and Calculators free of anything commercial (Lock L31).

**Preserved screens**: `ScreenPartnerships`, `ScreenSponsoredContent`. **Revenue impact**: the ledger's `source` enum keeps `PARTNERSHIP` and `SPONSORED` for schema stability, but no V1 row uses either (`15-revenue-finance.md`). **Analytics impact**: the "Partenariats" dashboard and partner-facing KPI exports are inactive (`16-analytics.md`).

**To bring it back**: needs either the Drug Database back (for a drug-page placement) or a new placement surface designed for the Reference Library — which the current design lock explicitly forbids, so that lock rule (L31) would need deliberate revision first, not just a feature flag flip.

## 4 · What each future-roadmap item does *not* affect

None of the above changes anything about the three V1 modules — Global Search, the Reference Library (Ordonnances & Certificates), and Calculators — which are built as permanent, independent modules, not placeholders. Reactivating any one item in this file is additive: a new entity, a new nav group or search facet value, a new admin queue — never a rewrite of what V1 already ships.

## 5 · Where the design reference lives

Every deferred screen and component listed above still renders in this design system's component library, unchanged since the pre-V1 draft. The per-section "what moved to Future Roadmap" notes in `01-product-architecture.md`, `05-clinical-modules.md`, `07-admin-architecture.md`, `08-screen-inventory.md`, `12-global-search.md`, Appendix B of this file, `15-revenue-finance.md`, `16-analytics.md` and Appendix A of this file each point back to this file; this file is the single index of all of them.

## 6 · Other deferred items (25 September 2026)

| Item | Status | Note |
|---|---|---|
| Pharmacist and other health-professional accounts | Future | `professionalType` values reserved; onboarding offers Doctor, Resident, Medical student only |
| Plans beyond Pro (Professional multi-device, Institutional seats) | Future | Plan catalogue is versioned, so new plans are data |
| Automatic renewal | Future | Depends on recurring-payment support from the acquirer |
| Admin mobile app | Not planned | Admin is Admin Web only (Lock L36) |
| Refund workflow | **Excluded, not deferred** | No-refund policy (Lock L40); only the isolated exceptional adjustment exists |

---

## Appendix A · Pharma partnerships and sponsored content (former section 17)

**This entire module is future roadmap (23 September 2026).** DokTool V1 has no partnerships, no sponsored content, no commercial entity of any kind, and no revenue source beyond subscriptions (`01-product-architecture.md`, `15-revenue-finance.md`). The module had no remaining surface once the Drug page it was designed to sit beside became future roadmap too — a sponsored banner needs a drug page or a module screen to attach to, and V1's only content screens are the read-only reference library and calculators, which the design lock (L31, section 11) keeps free of anything commercial. Nothing in this file is built, wired into navigation, or exposed as an admin screen in V1; it is kept here unmodified as design reference for if and when the platform adds partnerships, per this file.

Commercial activity is structurally separated from clinical content: different entities, different roles, different review, different visual treatment.

### Partnership entity

`{company, campaign, therapeuticArea, contractValue, currency, schedule[{installment, dueDate, amount, transactionId?, status}], paid, remaining, startDate, endDate, kpis[], sponsoredItems[], independenceClauseSignedAt, owner}` — `paid` and `remaining` are computed from the ledger, never typed.

States: Brouillon · Planifié · Actif · Suspendu · Terminé · Résilié. Screens: list (ScreenPartnerships), detail (contract, schedule, KPIs, sponsored items, independence panel, documents), statement export.

### Sponsored content entity

`{partnershipId, title, body (rich text, no clinical claims), placement (SEARCH_BLOCK · MODULE_BANNER · ARTICLE), therapeuticArea, period, editorialStatus (DRAFT · IN_EDITORIAL_REVIEW · APPROVED · REJECTED · LIVE · ENDED), reviewer, disclosure}`.

### Editorial review (separate from clinical review)

Rejected when the item: recommends, compares or ranks treatments; states efficacy or safety claims; mentions dosing; imitates clinical UI (evidence footer, result block, conduct badges); targets individuals; uses urgency. Reviewer role: `sponsored.review` (held by the editorial team, not by partnership managers, not by clinical reviewers).

### Placement rules (enforced by the renderer, not by convention)

| Allowed | Forbidden |
|---|---|
| Search: one labeled block below all clinical groups | Inside or between clinical result groups |
| Module banner slot (Home "Mises à jour" area excluded) | Drug page, pediatric result, calculator result, pregnancy/lactation page |
| Educational article (own page, labeled) | Prescription editor, preview, exports, documents |
| — | Notifications, e-mails, push |
| — | Evidence footers, sources lists |

Visual treatment: `SponsoredLabel` (uppercase "SPONSORISÉ", `sponsored` on `sponsored-soft`), sponsor name, "n'influence pas les résultats cliniques", "Pourquoi ce contenu ?" (explains therapeutic-area targeting), dismiss. The `sponsored` colour is used nowhere else.

### Firewall

| Commercial role can | Commercial role cannot |
|---|---|
| Manage partnerships, schedules, sponsored items | Read or edit clinical content, sources, rankings, rules |
| See campaign KPIs (aggregates) | See per-user data, search queries, documents |
| Export partnership statements | Influence search ranking, synonyms, alternatives lists |

Partnership managers and clinical reviewers are exclusive roles (section 03). Any attempt to link a sponsored item to a clinical entity other than a plain link to a drug page is refused by the API.

### Partner KPIs (activity, not outcomes)

Impressions, ouvertures, lectures complètes, médecins uniques atteints, répartition par spécialité (≥ 10). Never: prescriptions, sales, market share, "médecins convertis".

---

## Appendix B · Medical evidence and content governance for authored content (former section 14)

**V1 relevance check (23 September 2026):** this whole framework — evidence footers/meters, evidence levels, the sources registry, and the `DRAFT → IN_REVIEW → APPROVED → PUBLISHED` content lifecycle — was designed for **authored clinical content**: the Drug Database, dose rules, pregnancy/lactation profiles. None of that is V1. A V1 reference model is a static PDF the Super Admin uploads; it does not carry evidence levels, sources or a review pipeline — its lifecycle is the simple, logged Create/Update/Disable/Enable/Delete in `13-document-engine.md`. The one piece of this file still active in V1 is **Calculation integrity** below (detailed in section 28), scoped to calculator formulas only (pediatric dose rules are future roadmap). Everything else here is preserved as design reference for when the Drug Database is built — see this file.

Trust is a UX feature. Every clinical fact shown in DokTool has a source, a version, a review, and a visible treatment.

### Evidence treatment (what users see)

| Element | Where | Rule |
|---|---|---|
| Evidence footer | End of every clinical section, dose result, calculator result, pregnancy/lactation block | Sources (title · year) · reviewer + review date · version (`mono`) · "Signaler une erreur". Never omitted; if a reference is being updated: "Référence en cours de mise à jour" |
| Evidence meter | Pregnancy, lactation, pediatric rules where evidence strength varies | 4 neutral segments + the level word + population note. Never teal/green/red |
| Data version chip | Every clinical entity header | `À jour · v…` / `Cache · date` / `Mise à jour disponible` |
| Conduct badge | Contraindications, interactions, trimester conduct | Icon + word; this is an instruction, separate from evidence level |
| Under review | Section with a pending newer version | Info Alert: the published version remains authoritative |
| Outdated | Pack older than 30 days | Warning banner + chip |
| No evidence | Absence of data | Full block "Absence de données — ce n'est pas une preuve d'innocuité" + documented alternatives |
| Conflicting sources | Two references disagree | Info Alert naming both and the reviewers' synthesis |

### Evidence levels (pregnancy, lactation, pediatric)

| Level | Label | Meaning |
|---|---|---|
| 4 | Données robustes | Large cohorts / consistent meta-analyses |
| 3 | Données modérées | Cohorts with limitations, consistent series |
| 2 | Données limitées | Case series, < 100 exposures, animal data only with some human data |
| 1 | Données très limitées | Case reports |
| 0 | Absence de données | Nothing published |

### Sources registry

Each source: `{id, title, publisher, type (regulatory · guideline · reference · literature · national formulary), edition/date, url?, licence}`. Examples in use: RCP ANSM, CRAT, LactMed, GPIP/SFP, Vidal, Nomenclature nationale (Ministère de la Santé), HAS. Licensed sources are only displayed as allowed by their licence (title + year always).

### Content lifecycle

```
DRAFT → IN_REVIEW → APPROVED → PUBLISHED → (UPDATED = new DRAFT from PUBLISHED) → ARCHIVED
                ↘ CHANGES_REQUESTED ↗
```

| Transition | Who | Requirement |
|---|---|---|
| create/edit DRAFT | `content.<domain>.draft` | Structured fields; reason for change |
| submit → IN_REVIEW | author | Reason + cited sources |
| approve | `content.<domain>.review`, ≠ author | Comment; **two** medical reviewers for pediatric dose rules, pregnancy and lactation profiles, calculators' formulas |
| request changes | reviewer | Field-level comments |
| publish | `content.<domain>.publish`, ≠ author | Impact statement reviewed (dependent templates, packs) |
| archive | `content.<domain>.archive` | Replacement/alternative required for drugs still referenced |
| rollback | publish role | Creates a new version from an older one; never deletes |

Every transition writes an audit entry: who, what (field diff), when, previous value, new value, reason, reviewer(s).

### Publication effects

- New version number; public history entry (ScreenDrugHistory) with a one-sentence summary.
- Dependent system templates bump version automatically (still reviewed in batch).
- Users who favourited or used the item in the last 30 days get a "Contenu clinique" notification.
- The next offline pack includes it; packs are published on a schedule (weekly) or immediately for safety corrections ("Correctif de sécurité" flag forces an update prompt on next launch).

### User reports

"Signaler une erreur" (every evidence footer) opens a 3-field form (what's wrong, suggested correction, source optional). Reports land in Clinical Review → Signalements with the exact version; reporters are notified of the outcome.

### Calculation integrity — active in V1

Calculator formulas are declarative, versioned definitions — never code per calculator, never generated or altered by AI. Every version carries at least one primary clinical source (citation, edition, formula location), a test-case set taken from the source's worked examples plus edge cases, an author and a different reviewer, and is immutable once published. The backend engine runs the test cases at publication; the mobile engine runs them again before using a version offline. DokTool never computes outside the validated input range: it states "Calcul non disponible" / "Calculation not available" with the reason (Locks L23, L41). Full architecture: **section 28**. Pediatric dose rules are future roadmap.

### Commercial independence — future roadmap

No partnership, sponsor or payment can create, edit, reorder, annotate or hide clinical content, ranking, recommendations, evidence or calculations. This section describes the firewall for when partnerships and sponsored content return (this file, Appendix A); in V1 there is no partnership or sponsored role to firewall against, since neither exists yet. Partnership roles have no content permissions (section 03). Sponsored content goes through a separate editorial review that refuses clinical claims (Appendix A).
