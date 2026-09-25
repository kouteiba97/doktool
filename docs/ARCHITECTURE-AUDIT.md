# DokTool V1 — Architecture Audit and Target Architecture

**Version:** Design System v2.2 correction · 25 September 2026
**Input:** DokTool Design System v2.1 (23 September 2026) + the Product Owner decisions A–Z of 25 September 2026
**Status:** Required output before any code is written. There is no repository yet, so this audit maps the v2.1 design system (docs, hi-fi references, handoff instructions) against the new decisions, and the migration plan describes how the codebase is bootstrapped correctly rather than how an existing one is cleaned.

The Product Owner decisions override v2.1 wherever they conflict. The v2.1 visual language — tokens, Clinical Glass, the ECG trace, typography, the result block, the component contracts — is preserved untouched. What changes is the product architecture around it: who the clients are, where business rules live, how access is decided, where files are stored, how calculators are governed, and how money is described.

---

## 1 · Current architecture (v2.1, as documented)

v2.1 describes DokTool as **three user-facing surfaces sharing one TypeScript monorepo**: a physician web application (Next.js, sidebar + ⌘K palette, full URL structure), a physician mobile application (Expo / React Native), and an admin console (Next.js, desktop-only). Shared packages `@doktool/clinical`, `@doktool/search`, `@doktool/library`, `@doktool/i18n` and `@doktool/tokens` are pure TypeScript and are meant to be imported directly by both clients — which means calculator formulas, search normalisation and access rules are designed to execute inside the client.

The v2.1 product-scope correction (Reference Library instead of document generation, Drug Database deferred, bilingual FR/EN) was applied to sections 01, 02, 03, 05, 07, 08, 11, 12, 13, 14, 15, 16, 17, 19, 23, 24 and 25. It was **not** applied to sections 04 (journeys), 09 (responsive), 10 (implementation blueprint), 18 (offline), 20 (accessibility shortcuts), 21 (motion) and 22 (states), and it was not applied to the hi-fi references that pre-date it: 30 V1 screens still render the pre-V1 five-tab navigation (Accueil · Outils · Recherche · Documents · Profil), the pre-V1 physician sidebar (Médicaments, Pédiatrie, Grossesse, Mes documents) and the pre-V1 admin sidebar (Revue clinique, Médicaments, Posologies, Dépenses & remboursements, Partenariats), and many of them show drug content (Amoxicilline, posologies, interactions) as if it were live.

Storage is described generically ("S3-compatible or whatever the codebase already uses"). Access is a single derived enum `accessLevel` computed from `professionalType × verificationStatus × subscriptionStatus`. Finance follows `Revenu brut → Remboursements → Frais → Revenu net → Charges → Résultat net` with a refunds tab, a refunds screen and refund actions on users and transactions. Demo does not exist as a concept; a `TRIALING` subscription status does.

---

## 2 · Contradictions found in v2.1

Each row names where the contradiction lives, what v2.1 says, and which Product Owner decision it violates. Rows 1–20 correspond to the twenty corrections the brief listed; rows 21 onward are additional contradictions found during the audit.

| # | Location in v2.1 | What v2.1 says | Violates | Resolution |
|---|---|---|---|---|
| 1 | 02 "Physician app — web"; README principle 1 (`⌘K` on web); 11 L15 | A physician web app with sidebar, top bar, command palette | A, C | Removed from V1. Kept only as future-web reference (section 25). |
| 2 | 02 "URL structure (web) — V1"; 10 "Routes (web)" | Full user-facing web route map, including pre-V1 `/medicaments`, `/pediatrie`, `/ordonnances/nouvelle`, `/documents`, `/modeles` in section 10 | A, C, K, Q | Route map replaced by the Flutter route map (§11). No user web routes exist in V1. |
| 3 | 08 platform codes `M T W A`; rows marked `W`; hi-fi `ScreenHomeDesktop`, `ScreenSearchDesktop`, `SearchCommand`, `ScreenCalculatorLibrary`, `ScreenProfilePractice`, `ScreenPlans`, `ScreenSettings`, `ScreenVerifyProfessional`, `ScreenReferenceLibrary`, `ScreenReferenceViewer`, `ScreenSettingsLanguage` are desktop layouts | Web physician screen inventory | A | Codes reduced to `M` (Flutter mobile) and `A` (Admin Web). Every V1 user screen gets a mobile hi-fi reference. Desktop physician references move to Future Web. |
| 4 | 05 calculators ("no Calculate button on web"); 08 H "Library + calculator split — W" | Web calculator as a current surface | A | Calculator is a mobile screen in V1. |
| 5 | 08 J "Profile tabs" (desktop); `ScreenProfilePractice` | Web profile | A, H | Mobile Profile rebuilt around decision H (personal, activity, favorites, subscription, settings). |
| 6 | 06 "a comparison table on web"; `ScreenPlans` desktop | Web subscription journey | A, I | Mobile plan and checkout flow. |
| 7 | 04 journeys 8, 9, 10, 11, 15; 09 rows "Prescription editor", "Document preview", "Export"; 10 build step 5 and "Documents" state row; 18 "Prescription editor + validation", "Export PDF / print / copy / image" offline; 11 L16 "exports queue", L24 "reason to export"; 22 success copy « Ordonnance exportée »; 20 shortcuts `⌘N` new prescription, `⌘E` export, `⌘P` print | Prescription generation, editing and export | K | Removed from every active section. L24 and the export clauses of L16 retired. |
| 8 | 04 journey 11 "Creating a certificate"; 18 "Certificates — Available" (as generation offline) | Certificate generation | L | Removed; certificates are reference PDFs. |
| 9 | 18 "Share by link — queued", "Queued badge — documents waiting to share"; 09 export sheet/modal; 21 "Success (save, copy, export)"; 22 maintenance « exports suspendus » | Export/print/share remnants | K, L | Removed. |
| 10 | 04 journeys 1, 5, 6, 7, 21, 22; "Search → action model" (drug row actions); 09 rows "Drug page", "Pediatric"; 10 build step 3; README principle 7 ("a drug result exposes its actions"); 30 hi-fi screens show drug content | Drug Database active | Q | Removed from all active text and all V1 hi-fi references. |
| 11 | 18 packs "Posologies pédiatriques", "Grossesse & allaitement"; 04 journeys 6, 7; 10 build step 4; 11 L5 (pediatric max-dose), L6 (pregnancy verdicts) | Pediatric / pregnancy / lactation / interactions in V1 | Q, U | L5/L6 clauses scoped to future roadmap; packs removed. |
| 12 | 15 metric order with **Remboursements**; 11 **L20**; 07 finance tabs "Remboursements", "Reversements", Overview "À traiter … refunds"; `ScreenExpensesRefunds`; 03 `subscriptions.refund`, `finance.refund`; 07 Users drawer "refund"; 15 ledger status `REFUNDED`, "Refund policy shown in the plan page" | Refund-centred finance and customer workflow | I, J | Finance becomes Gross → Payment fees → Net revenue (→ Operating expenses → Net profit, visually separate). No refund workflow, tab, screen or grant. One isolated exceptional-adjustment operation (§10). L20 rewritten. |
| 13 | Nowhere — Demo is absent; 01 subscription status `TRIALING` | Demo not modelled; a trial status exists instead | E | Demo introduced as an **access context**, never a `professionalType`. `TRIALING` removed. |
| 14 | 01 access table: `STUDENT → "Full read access to the reference libraries and calculators"`; 08 E "Doctor-only feature (certificates)" as the only student boundary | Student = everything free | F | Student entitlements come from a centralised policy; professional items stay visible and locked. |
| 15 | 18 packs "Médicaments & interactions" (48 MB), "Posologies pédiatriques", "Grossesse & allaitement", "Modèles d'ordonnance & certificats (system templates)", "Mes modèles … Documents" | Offline packs for deferred modules | U | Offline redesigned around Reference PDFs, calculator definitions, favorites, activity and settings. |
| 16 | 16 V1 vocabulary is only 3 events; no demo, favorite, subscription events; 07 Overview "Contenu en revue", "Dernières publications (clinical content)" | Incomplete / pre-V1 analytics | V | Event vocabulary extended per decision V; demo events tagged by context. |
| 17 | 10 "Mobile: Expo (React Native) + TypeScript, React Navigation, `@gorhom/bottom-sheet`, `expo-blur`, lucide-react-native, `expo-print`"; tokens pipeline "→ RN theme"; handoff `CLAUDE.md` repeats it | Expo / React Native mobile | D | Flutter (Dart) for iOS + Android. Token and i18n pipelines emit Dart. |
| 18 | 09 "Mobile-first, never mobile-only"; 11 L15 "same structured data on web and mobile" | Implies one cross-platform UI codebase; nothing says Admin must not be Flutter | B | Admin Web is Next.js only (Lock L36). |
| 19 | 02 web shell, 10 web routes and build order, 12 web palette and results page, 20 web shortcuts | Future user web being specified as current | C | Future web is architecture-ready only: API and domain, no UI, no routes. |
| 20 | 13 "S3-compatible bucket, or whatever the codebase already uses"; 10 "signed direct uploads" without a provider | Object storage undefined | N | Cloudflare R2 behind a `StorageService` abstraction; PostgreSQL holds metadata and keys only. |
| 21 | 10 shared packages `@doktool/clinical`, `@doktool/search`, `@doktool/library` as pure TS imported by clients; "result computed locally" | Business rules (formulas, access, search) live in client packages | C, Y | Rules live in NestJS domain services. Calculators become declarative, versioned definitions executed by a deterministic engine on the backend and, for offline, by an equivalent Dart engine verified against the same test vectors. |
| 22 | 01 `professionalType` includes `PHARMACIST`, `OTHER_HCP`; 06 five-role picker; 03 `PHARMACIST` end-user role | Five professional types | D (supports Doctor, Resident, Medical Student, Demo) | V1 onboarding offers Doctor · Resident · Medical student. `PHARMACIST`/`OTHER_HCP` move to Future Roadmap (enum values reserved, not offered). *Confirmation requested, §17 Q7.* |
| 23 | 01 access table: `DOCTOR · PENDING · FREE → PROFESSIONAL_PENDING → "Full reference library read, calculators"`; `RESIDENT · FREE or PRO → full` | Unpaid, unverified professionals get the full product free | G, I | Professional access requires verification + active subscription. Unpaid professionals get a defined limited state (§7, *Q1*). |
| 24 | 01 single enum `accessLevel` | Verification, subscription and entitlement collapsed into one value | G | Separate `identityVerification`, `professionalVerification`, `subscription`, and a derived entitlement set (§7). |
| 25 | 01 "PROFESSIONAL — Everything, including offline packs"; 18 "Packs update automatically on Wi-Fi for Pro users" | Offline gated to paid professionals | U (+ "continue the offline feature for the doctor, resident and the medical student") | Offline is available to every real account for the content that account is entitled to. |
| 26 | 13 `nameFr` + `nameEn` **required**, `descriptionFr/En`, `category` per PDF | Admin must author bilingual display metadata per PDF | M | One required display title (pre-filled from the file name), optional English title, one access flag; everything else is derived from the file automatically (§6, §8). |
| 27 | 05 "out-of-range (warning, still computes if allowed by the formula)"; unit "toggles"; live compute per keystroke; `Calculator` entity has `references` but no source version, reviewer, test cases or published version | Calculator safety and provenance under-specified | O, P | Calculator Safety Architecture (§9): typed inputs, explicit units, two-tier ranges, no result outside the validated range, sourced and versioned formulas, four-eyes publication. |
| 28 | 06 lifecycle banner « Abonnement expiré — les documents sont verrouillés » in `critical`; « Expire dans 14 jours » `warning` banners | Anxious, warning-coloured subscription UX | H, I | Subscription status in neutral/info tones; no red, no countdowns (Lock L39). |
| 29 | 06 plans `FREE · PRO · PROFESSIONAL · INSTITUTIONAL`; "Pro (doctors, residents optional)" | Residents optional payers; four plan tiers | I | V1 plan catalogue = Student (free) and Pro for Doctors and Residents; other tiers future roadmap. |
| 30 | 01 "Practice profile (cabinet name, address, order number)… useful context" | Practice data kept for document rendering that no longer exists | H, K | Removed; Profile holds name, picture, bio, professional/student information, preferences. |
| 31 | 06 "Privacy by design: patient identifiers in documents are optional…"; 11 L17, L27 | Patient-field rules for a generator that doesn't exist | K | Replaced by one rule: DokTool collects no patient data anywhere (Lock L42). |
| 32 | 19 `@doktool/i18n` as a TypeScript catalogue | Flutter cannot consume a TS catalogue | R | Single-source JSON catalogues `messages.fr.json` / `messages.en.json` (ICU) compiled to Dart (ARB) and TS. |
| 33 | 08 and 13 reference `ScreenReferenceLibraryAdminForm` | The card does not exist (the form is inside `ScreenReferenceLibraryAdmin`) | internal | Reference corrected. |
| 34 | 03 roles `DRUG_EDITOR`, `PRESCRIPTION_EDITOR`, `PARTNERSHIP_MANAGER`, `SUPPORT_AGENT`; grants `content.drugs/pediatric/pregnancy/templates`, `partnerships.*`, `sponsored.*` | Pre-V1 admin roles still listed as presets | Q, 13 | V1 presets reduced (§12); deferred grants listed under Future Roadmap. |
| 35 | 10 build order starts with web shells and drug page | Implementation order contradicts decision 15 | 15 | Replaced by the 18-phase order (§15). |

---

## 3 · Required corrections (summary)

The contradictions above collapse into eleven corrections. **Platforms:** V1 has exactly two clients, Flutter Mobile (iOS + Android) for Doctor, Resident, Medical Student and Demo, and Admin Web (Next.js) for the Super Admin and granted sub-admins; the user web application moves to Future Roadmap and is prepared only at the API level. **Backend authority:** NestJS owns authentication, authorisation, entitlements, subscriptions, reference availability, calculator definitions and their provenance, verification, analytics, audit and finance; clients render what the backend decides. **Access:** Demo becomes an access context, Student becomes a centrally configured entitlement tier, and access is a derived entitlement set rather than a single enum. **Money:** subscriptions and transactions follow a no-refund model with a Demo-first purchase journey, and finance reads Gross → Fees → Net with profit kept apart. **Content:** Reference Documents carry minimal technical metadata and live in R2; calculators become sourced, versioned, tested definitions. **Offline** covers only V1 content and is available to every real account. **Design:** the visual language is unchanged, expressed through a platform-neutral token layer that emits CSS/Tailwind for Admin Web and Dart for Flutter; every stale V1 hi-fi reference is rebuilt on mobile with the V1 navigation. **Locks:** L20, L24, L26 and parts of L5, L6, L15, L16, L17 are superseded by Design Lock v4 (L33–L44).

---

## 4 · Target architecture

```
                              DOKTOOL BACKEND  (single source of truth)
                  NestJS · PostgreSQL (Prisma) · Cloudflare R2 · Redis (jobs, rate limits)
                                          │
                        REST /v1  ·  OpenAPI contract  ·  generated clients
              ┌───────────────────────────┼───────────────────────────┐
              │                           │                           │
              ▼                           ▼                           ▼
     Flutter Mobile               Admin Web                    Future DokTool Web
     iOS + Android                Next.js · TypeScript         (future phase — not built;
     one app                      desktop ≥ 1024 px            consumes the same /v1 API)
              │                   separate admin auth + 2FA
     ┌────────┼─────────┐
     │        │         │
   Doctor  Resident  Medical student      ← professionalType on a real account
              │
        Demo access                       ← accessContext = DEMO (no account, controlled mode)
```

**Backend modules (NestJS, one deployable, modular monolith).** `auth` (user sessions), `admin-auth` (separate issuer, sessions, mandatory TOTP), `users` (account, profile, preferences), `verification` (cases, documents, decisions), `access` (entitlement policy engine — the only place access is decided), `billing` (plans, subscriptions, checkout, provider webhooks, transactions), `finance` (aggregates, expenses, reports, exceptional adjustments), `reference-library` (ReferenceDocument lifecycle), `calculators` (definitions, versions, sources, test vectors, deterministic engine), `search` (V1 index over reference documents and calculators; `type` facet reserved for future `DRUG`), `activity` (favorites, recent activity), `offline` (manifests), `notifications`, `analytics` (event ingestion + aggregates), `audit` (append-only log), `demo` (demo sessions and the demo content subset), `storage` (the `StorageService` abstraction and its R2 adapter), `admin` (admin-facing read models and grant checks).

**Why a modular monolith.** DokTool V1 has one team, one database and modest traffic. A single NestJS deployable with strict module boundaries (each module owns its tables; cross-module calls go through exported services, never shared repositories) gives the separation needed for a future split without the operational cost of microservices.

**Redis — justified uses only.** Rate limiting (auth, OTP, search, signed-URL issuance), the BullMQ job queue (payment webhook processing and reconciliation, PDF post-processing, verification-document retention purge, notification fan-out, analytics roll-ups), and short-lived OTP / session-revocation keys. No Redis cache in front of PostgreSQL in V1. If the team prefers one fewer service, `pg-boss` on PostgreSQL can replace BullMQ; rate limiting then moves to the edge (Cloudflare) — both options are acceptable, the choice is recorded once in the repo's ADR log.

---

## 5 · Target application boundaries

| Concern | Flutter Mobile | Admin Web | Backend | Future Web |
|---|---|---|---|---|
| Authentication | Holds tokens in secure storage; never decides validity | Holds an httpOnly admin session cookie | Issues, rotates, revokes; separate user and admin issuers | Will use the user issuer |
| Authorisation / entitlements | Renders `GET /v1/me/access`; hides nothing the backend marks `LOCKED` (shows it locked) | Renders grant-filtered navigation from `GET /admin/v1/me` | **Decides.** Every protected endpoint re-checks | Same contract |
| Calculator maths | Executes the **published** definition offline with the Dart engine; engine self-tests against the version's test vectors before use | Previews definitions using the backend engine only | Authoritative engine (TypeScript); runs test vectors at publication | Will call the backend engine or a shared web engine verified by the same vectors |
| Reference PDFs | Streams via short-lived signed URL; caches for offline when entitled | Uploads via signed upload URL; previews via signed URL | Issues URLs after entitlement check; validates uploads; owns lifecycle | Same |
| Search | Local index for offline; server search online | Admin search is separate (users, transactions, content by ID) | V1 index (reference documents + calculators) | Same |
| Finance, audit, analytics | Emits analytics events only | Reads aggregates and ledgers | Owns everything | — |
| Data access | API only | **API only — no Prisma, no direct DB connection in Next.js** | Only component with DB and R2 credentials | API only |

**Repository layout (monorepo, polyglot).**

```
doktool/
├── apps/
│   ├── api/            NestJS · Prisma schema · migrations · domain modules
│   ├── admin/          Next.js (App Router) · TypeScript · Tailwind · Radix · TanStack Table · RHF + Zod · Recharts
│   └── mobile/         Flutter · Dart (iOS + Android)
├── packages/
│   ├── design-tokens/  tokens.json (source) → tokens.css, tailwind.preset.js, tokens.ts, doktool_tokens.dart
│   ├── i18n/           messages.fr.json, messages.en.json (source, ICU) → ARB for Flutter, TS for Admin
│   ├── api-contract/   openapi.yaml generated from NestJS → Dart client (mobile), TS client (admin)
│   └── calculator-vectors/  shared JSON test vectors run by the TS engine (api) and the Dart engine (mobile) in CI
└── docs/adr/           architecture decision records
```

The two engines share **data** (definitions, test vectors), not code. CI fails if either engine disagrees with a vector, if the two i18n catalogues have different key sets, or if a component contains a raw colour, radius or blur outside the token layer.

---

## 6 · Target data model (V1, conceptual)

PostgreSQL via Prisma. Money is stored in minor units (integer centimes) with an ISO currency code. Every table has `createdAt`/`updatedAt`; soft deletion only where stated. Module ownership is in brackets — a module is the only writer of its tables.

```
User ─1:1─ ProfessionalProfile
  │  ─1:1─ UserPreference
  │  ─1:n─ VerificationCase ─1:n─ VerificationDocument ──(R2 private)
  │  ─1:n─ Subscription ─n:1─ SubscriptionPlan
  │           └─1:n─ Transaction ─0:n─ TransactionAdjustment (exceptional)
  │  ─1:n─ Favorite ──→ ReferenceDocument | Calculator
  │  ─1:n─ RecentActivity
  │  ─1:n─ Notification
  └─ derived → AccessProfile (never stored as a column; computed by the access module)

ReferenceDocument ─1:n─ ReferenceDocumentFile ──(R2 content)
Calculator ─1:n─ CalculatorVersion ─1:n─ CalculatorSource
                                   └─1:n─ CalculatorTestCase
DemoSession (no link to User until conversion)
AdminAccount ─1:n─ AdminGrant
AnalyticsEvent (pseudonymous)          AuditLogEntry (append-only)
```

| Entity | Key fields | Ownership · rules |
|---|---|---|
| **User** [users] | id, email?, phone?, passwordHash, firstName, lastName, avatarStorageKey?, bio? (≤ 280 chars), status `ACTIVE · SUSPENDED · DELETED`, lastSeenAt | One per real person. Never a Demo. Email or phone required (OTP-confirmed). |
| **ProfessionalProfile** [users] | userId, professionalType `DOCTOR · RESIDENT · STUDENT`, specialty?, institutionId?, universityId?, academicYear? (1–7), residencyYear?, wilaya, orderNumberMasked? | `professionalType` is what the person *is*; it is never `DEMO`. A change of type (student → resident → doctor) is a re-verification on the same account; favorites and history survive. `PHARMACIST`, `OTHER_HCP` reserved for Future Roadmap. |
| **UserPreference** [users] | userId, language `FR · EN`, theme `LIGHT · DARK · SYSTEM` (default SYSTEM; Settings offers Light and Dark and "follow device"), notificationPrefs (json), weightUnitDefault? | Synced across devices. |
| **VerificationCase** [verification] | id, userId, type `IDENTITY · PROFESSIONAL_STATUS · STUDENT_STATUS`, status `NOT_STARTED · SUBMITTED · IN_REVIEW · VERIFIED · REJECTED · EXPIRED · APPEALED`, submittedAt, reviewerId (AdminAccount), decidedAt, expiresAt, rejectionReasonCode, rejectionNote | Identity and professional status are **separate cases**, so they can be decided, expire and be re-proved independently. History kept. |
| **VerificationDocument** [verification] | id, caseId, stepType, storageKey (private bucket), mimeType, sizeBytes, sha256, uploadedAt, purgeAfter | Readable only through the restricted viewer by an admin holding `verification.documents.view`; every view is audited. Purged by job after retention. |
| **SubscriptionPlan** [billing] | id, code (`PRO_MONTHLY`, `PRO_ANNUAL` …), version, audience `[DOCTOR, RESIDENT]`, nameFr/En, priceMinor, currency `DZD`, durationDays, includesFr/En[], excludesFr/En[], entitlementTier `PROFESSIONAL`, isPurchasable | Plans are **versioned**: a price or inclusion change creates a new version; existing subscriptions keep the version they bought. The includes/excludes lists are what the plan screen shows before payment. |
| **Subscription** [billing] | id, userId, planId + planVersion, status `PENDING_PAYMENT · ACTIVE · GRACE · EXPIRED · CANCELED`, currentPeriodStart, currentPeriodEnd, renewalMode `MANUAL` (V1), graceEndsAt? | No `TRIALING` (Demo replaces trials) and no `REFUNDED`. `CANCELED` = the user stopped renewal; access continues to period end. Students have no Subscription row — free access is an entitlement tier, not a zero-price subscription. |
| **Transaction** [billing] | transactionId (`DT-YYYY-NNNNNN`), userId, subscriptionId, planId (+ version), amountMinor, currency, paymentProvider (`SATIM_CIB · SATIM_EDAHABIA · BANK_TRANSFER` …), providerReference, status `PENDING · SUCCEEDED · FAILED · CANCELED`, paymentDate, paymentFeesMinor?, netAmountMinor?, metadata (json), createdAt, updatedAt | One row = one individual payment attempt/record. Immutable after `SUCCEEDED` except fee settlement (`paymentFeesMinor`, `netAmountMinor` filled when the provider settles). Failed attempts kept for provider monitoring, excluded from revenue. |
| **TransactionAdjustment** [finance] | id, transactionId, kind `REVERSAL · CORRECTION`, amountMinor (signed), reasonCode, reasonNote, requestedBy, approvedBy (≠ requestedBy), createdAt | The **only** place a reversal can exist. Not a product workflow (§10). |
| **ReferenceDocument** [reference-library] | id, type `ORDONNANCE · CERTIFICATE`, titleFr (required, pre-filled from file name), titleEn? (falls back to titleFr), accessTier `STUDENT · PROFESSIONAL`, demoSample (bool), status `PROCESSING · ENABLED · DISABLED · ARCHIVED`, currentFileId, createdAt, updatedAt, createdBy, updatedBy | Minimal technical/display metadata only. The medical content is the PDF; editing a title never changes it. `accessTier STUDENT` means available to students **and** professionals. |
| **ReferenceDocumentFile** [reference-library] | id, documentId, version (int, +1 on replace), storageKey, sha256, sizeBytes, pageCount, mimeType, uploadedBy, uploadedAt | Every replacement is kept, so "what did this model contain on date X" is always answerable. Derived automatically from the upload; the admin types none of it. |
| **Calculator** [calculators] | id, slug, nameFr, nameEn, category, accessTier, demoSample, status `ACTIVE · RETIRED`, currentVersionId | Stable identity for favorites and URLs. |
| **CalculatorVersion** [calculators] | id, calculatorId, version, definition (json: inputs, units, validation rules, formula AST, interpretation bands, limitations — §9), definitionSha256, status `DRAFT · IN_REVIEW · PUBLISHED · RETIRED`, authoredBy, reviewedBy (≠ author), reviewedAt, publishedAt, engineVersion, testRun {passed, ranAt, results} | Immutable once `PUBLISHED`. A change is a new version. |
| **CalculatorSource** [calculators] | id, calculatorVersionId, citation (authors, title, journal/publisher, year), doi?, url?, edition/version, formulaLocation (page / table / equation), accessedAt, role `PRIMARY · VALIDATION · UNIT_CONVERSION` | At least one `PRIMARY` source is required to publish. |
| **CalculatorTestCase** [calculators] | id, calculatorVersionId, inputs (json), expectedValue, tolerance, expectedBand?, expectedOutcome `RESULT · INVALID · OUT_OF_VALIDATED_RANGE`, origin (e.g. "worked example, source p. 34") | Run by both engines in CI and by the backend at publication. |
| **Favorite** [activity] | userId, targetType `REFERENCE_DOCUMENT · CALCULATOR`, targetId, createdAt | Unique per target. A disabled target shows "No longer available". |
| **RecentActivity** [activity] | id, userId, kind `SEARCH · REFERENCE_VIEW · CALCULATOR_USE`, targetType?, targetId?, queryText? (SEARCH only), occurredAt, deviceId | User-facing history ("Research"). Capped (last 200 per kind), user-clearable, never shown to admins as content — support sees counts only. Calculator **inputs are never synced**; the last inputs stay on the device. |
| **Notification** [notifications] | id, userId, type, messageKey, params (json), readAt?, createdAt | Rendered in the user's language from catalogue keys. |
| **DemoSession** [demo] | id, deviceIdHash, demoContext `DOCTOR · RESIDENT`, startedAt, expiresAt, lastSeenAt, status `ACTIVE · EXPIRED · CONVERTED`, convertedUserId? | No name, e-mail or phone. Separate from `User`; nothing written by a demo ever lands in user tables. |
| **AnalyticsEvent** [analytics] | id, type, occurredAt, receivedAt, subjectHash (pseudonymous user or demo session), accessContext `AUTHENTICATED · DEMO`, professionalType?, entitlementTier, specialty?, wilaya?, entityType?, entityId?, calculatorVersion?, resultBand?, platform, appVersion, dataVersion | No patient data, no free text, no search query text, no calculator input values. |
| **AuditLogEntry** [audit] | id, actorType `ADMIN · SYSTEM · USER`, actorId, action, entityType, entityId, before (json), after (json), reason?, ip, userAgent, occurredAt | Append-only (the application DB role has INSERT/SELECT only on this table). |
| **AdminAccount / AdminGrant** [admin-auth] | email, passwordHash, totpSecret (encrypted), status, lastLoginAt · grant, expiresAt? | Admins are **not** Users: separate table, issuer, session policy and 2FA. |

**Supporting reference tables:** `Institution` and `University` (pickers), `Specialty`, `Wilaya`. **Derived, never stored:** `AccessProfile` (§7).

---

## 7 · Target entitlement model

### Inputs → policy → entitlements

```
accessContext            AUTHENTICATED | DEMO
professionalType         DOCTOR | RESIDENT | STUDENT          (absent for DEMO; DEMO carries demoContext)
identityVerification     NOT_STARTED | SUBMITTED | VERIFIED | REJECTED | EXPIRED
professionalVerification NOT_STARTED | SUBMITTED | VERIFIED | REJECTED | EXPIRED
subscription             NONE | PENDING_PAYMENT | ACTIVE | GRACE | EXPIRED | CANCELED(active until period end)
academicYear             1–7 (students; unused by V1 rules, available to future rules)
          │
          ▼   access module · EntitlementPolicy (versioned config, evaluated server-side)
          │
AccessProfile {
  tier:          DEMO | STUDENT | PROFESSIONAL_UNPAID | PROFESSIONAL | RESTRICTED   ← one word for badges & analytics
  features:      [{ key, state: AVAILABLE | LOCKED, lockReason?, unlockPath? }]
  contentTiers:  [STUDENT] | [STUDENT, PROFESSIONAL] | [DEMO_SAMPLE]                    ← which items are openable
  computedAt, policyVersion
}
```

`GET /v1/me/access` returns the `AccessProfile`; every protected endpoint evaluates the same policy again on the server. The Flutter app has exactly one widget-level primitive — `EntitlementGate(featureKey | item)` — which renders the child, or the locked presentation with the reason and path the backend supplied. No widget ever tests `professionalType == STUDENT`.

### Feature keys (V1)

`search` · `reference.view` (per item, by `accessTier`) · `calculator.use` (per item, by `accessTier`) · `favorites` · `activity.history` · `offline.sync` · `subscription.purchase` · `profile.edit`

### V1 policy (defaults — values are configuration, not code)

| Tier | Who | Search | Open reference / calculator | Favorites · history | Offline | Purchase |
|---|---|---|---|---|---|---|
| **DEMO** | Demo context, no account | Full V1 index (names visible) | `demoSample` items only; everything else visible + **LOCKED · DEMO_LIMIT** → "Included in DokTool Pro" | Session-local, discarded at expiry | No | Visible; requires creating an account |
| **STUDENT** | STUDENT with student status VERIFIED, or SUBMITTED within the pending window (default 14 days) | Full V1 index | `accessTier = STUDENT` items; `PROFESSIONAL` items visible + **LOCKED · PROFESSIONAL_ONLY** → "Reserved for verified doctors and residents with DokTool Pro" | Yes | Yes (student-tier content) | Not offered (free tier) |
| **PROFESSIONAL_UNPAID** | DOCTOR/RESIDENT without ACTIVE/GRACE subscription | Full V1 index | `demoSample` items (the same representative set as Demo, now with a real account) — *Q1* | Yes | No | Yes, once professional verification is VERIFIED — *Q6* |
| **PROFESSIONAL** | DOCTOR/RESIDENT, professional verification VERIFIED, subscription ACTIVE or GRACE | Full | All enabled items | Yes | Yes (all content) | Renew |
| **RESTRICTED** | Account suspended, or verification REJECTED on the relevant case, or student pending window elapsed | Full V1 index | Nothing; items visible + **LOCKED · VERIFICATION_REQUIRED** (or suspension notice) | Read-only | Local copies purged at next online launch | No |

**Lock reasons** (each maps to a catalogue string and an unlock path): `DEMO_LIMIT` → create account / see plans · `PROFESSIONAL_ONLY` → explanation only (no upsell to students) · `SUBSCRIPTION_REQUIRED` → plans · `VERIFICATION_REQUIRED` → verification step · `VERIFICATION_PENDING` → status timeline · `OFFLINE_UNAVAILABLE` → reconnect · `NO_LONGER_AVAILABLE` → remove favorite.

**Available · Locked · Not available.** A **locked** item is something DokTool has and this access context does not open; it is always visible with its reason. A **not available** item is something that exists but cannot be opened right now (disabled by the admin, not downloaded while offline). **Future** modules (the Drug Database and everything under it) are neither: they are not shown anywhere — no nav entry, no locked row, no "coming soon" (Lock L32). The only place V1 speaks about what DokTool does *not* do is the plan screen's "Not included" list, which states it plainly so nobody pays expecting a drug database.

**Edge rules.** Professional verification expiring during an active subscription does not interrupt access before `currentPeriodEnd`; renewing requires re-verification. A student who becomes a resident keeps everything and moves to `PROFESSIONAL_UNPAID` until they subscribe. Rules may later reference `academicYear` (e.g. a tool available from year 4) by adding a condition to the policy — no authorisation code changes.

### Demo — how it is contained

A demo starts from Welcome → "Explore the demo" with no sign-up: the app requests `POST /v1/demo/sessions {demoContext}` and receives a short-lived demo token (audience `demo`, scope limited to read endpoints and demo analytics). The session lasts a configurable period (default 7 days, device-bound; resettable by the admin), after which the app returns to Welcome with "Create an account to continue". Demo content is the **real** V1 content subset flagged `demoSample` — no invented PDFs, no fake calculators — so the demo never misrepresents what the paid plan contains. Demo tokens can never reach verification, profile, billing, admin or any write endpoint other than analytics. Demo analytics carry `accessContext = DEMO` and are excluded from product KPIs by default. On conversion, the demo session is marked `CONVERTED` and linked to the new user for funnel analytics only; no demo favorites are imported (they were session-local).

---

## 8 · Target storage architecture (Cloudflare R2)

**Principle:** PostgreSQL stores structured metadata and storage keys; R2 stores bytes. R2 is never queried as a database, and no domain module imports an R2/S3 SDK — they depend on `StorageService`.

```ts
interface StorageService {
  upload(input: { bucket: BucketId; key: string; body: Stream; contentType: string }): Promise<StoredObject>;
  replace(input: { bucket: BucketId; oldKey: string; newKey: string; body: Stream; contentType: string }): Promise<StoredObject>;
  delete(bucket: BucketId, key: string): Promise<void>;
  head(bucket: BucketId, key: string): Promise<StoredObject | null>;          // size, etag, contentType
  getSignedReadUrl(bucket: BucketId, key: string, opts: { ttlSeconds: number; disposition: 'inline' }): Promise<string>;
  getSignedUploadUrl(bucket: BucketId, key: string, opts: { contentType: string; maxBytes: number; ttlSeconds: number }): Promise<string>;
}
// V1 implementation: R2StorageAdapter (S3-compatible API, @aws-sdk/client-s3 + s3-request-presigner, R2 endpoint)
```

**Buckets and prefixes.** The prefix tree follows the brief; the verification area is placed in its own bucket so it has separate credentials, no public-access path at all and its own lifecycle rules.

```
bucket doktool-content  (private; no public domain)
  doktool/reference-documents/ordonnances/{documentId}/v{n}-{sha8}.pdf
  doktool/reference-documents/certificates/{documentId}/v{n}-{sha8}.pdf
  doktool/profile-images/{userId}/{uuid}.webp
  doktool/future/                                 (reserved)

bucket doktool-private  (private; separate API token; restricted viewer only)
  doktool/verification/{userId}/{caseId}/{documentId}.{ext}
```

Keys are **immutable**: replacing a PDF writes a new key and moves the `currentFileId` pointer, so caches can never serve a stale file under the same name and every past version stays retrievable for audit.

**Access rules.**

| Object | Upload | Read | Signed-URL TTL | Extra |
|---|---|---|---|---|
| Reference PDF | Admin with `library.write`: signed upload URL → `POST …/confirm` → server `head` + PDF magic-byte check + size limit (default 20 MB) → job computes sha256 and page count → `ENABLED` or `DISABLED` as chosen | Any client whose `AccessProfile` opens that item | 10 min | Also downloadable into the offline store for entitled real accounts |
| Profile image | User, via API (server re-encodes to WebP, strips EXIF, max 1024 px) | Authenticated users | 1 h | Replaced key on change; old key deleted by job |
| Verification document | User, via signed upload URL bound to the case | Admin with `verification.documents.view` only, through the restricted viewer (watermark with reviewer name, no download control) | 60 s, single use per view | Every view writes an `AuditLogEntry`; purged after retention (default 24 months after decision) |

No permanent public URL exists for any object. Cloudflare R2 encrypts at rest; whether identity documents also get application-level envelope encryption is listed as a risk decision (§16).

---

## 9 · Target calculator architecture

### Pipeline

```
Calculator (stable id, slug)
  └── CalculatorVersion  (immutable once published)
        ├── definition
        │     ├── inputs[]            CalculatorInput + CalculatorValidationRule[]
        │     ├── formula             CalculatorFormula (declarative AST — no code, no eval)
        │     ├── interpretation[]    bands on the result
        │     └── limitations         FR/EN text
        ├── sources[]                 CalculatorSource (≥ 1 PRIMARY)
        ├── testCases[]               CalculatorTestCase (worked examples from the source + edge cases)
        └── review                    authoredBy ≠ reviewedBy, reviewedAt, testRun
                     │
     DRAFT ──► IN_REVIEW ──► PUBLISHED ──► RETIRED
                     publish requires: primary source · all test cases pass on the backend engine ·
                     reviewer ≠ author · review note · definition checksum recorded
```

### Definition types

| Type | Fields |
|---|---|
| **CalculatorInput** | key, labelKey (i18n), kind `NUMBER · CHOICE · BOOLEAN · INTEGER`, quantity (e.g. `BODY_WEIGHT`, `SERUM_CREATININE`, `AGE_YEARS`), canonicalUnit, allowedUnits[], defaultUnitByLocale?, required, decimals, choices[] (CHOICE: value, labelKey, points?) |
| **CalculatorValidationRule** | `hardRange` (physiologically impossible → **invalid**, blocks), `validatedRange` (the population the formula was validated on → outside = **not computed**, reason shown), `plausibleRange?` (inside validated range but unusual → neutral "Check the value" note, does not block), cross-field rules (e.g. `age ≥ 18` for an adult-only formula) |
| **CalculatorFormula** | JSON AST over a closed operator set: `+ − × ÷`, `pow`, `sqrt`, `ln`, `log10`, `exp`, `min`, `max`, `round(n)`, `if(cond, a, b)`, `piecewise`, `sum(points)`, comparisons; references only declared input keys in their **canonical units**. No string evaluation, no custom code per calculator. |
| **Interpretation** | ordered bands `{from, to, severity: info · caution · warning · critical, labelKey}` — rendered as icon + word (Lock L5) |
| **CalculationResult** | value, unit, band, versionId, definitionSha256, computedAt, engine `server · device` — never persisted server-side with inputs |

### Units

Unit conversion lives in one **unit registry** keyed by quantity (e.g. `SERUM_CREATININE: µmol/L ↔ mg/dL, factor 88.42`), each factor itself carrying a `CalculatorSource` of role `UNIT_CONVERSION`. Inputs are converted to canonical units before evaluation; the conversion is displayed, never silent. Changing the unit of a field that already holds a value converts it and shows an inline "Converted: 70 kg = 154.3 lb" note for 4 seconds; the unit is always printed next to the number in the field, the result and the copied text.

### Engine

A deterministic evaluator (pure function: definition + canonical inputs → result | invalid | outOfValidatedRange) implemented twice: **TypeScript** in the backend (authoritative; used for publication tests, admin preview and online evaluation `POST /v1/calculators/{id}/versions/{v}/evaluate`) and **Dart** in the mobile app (offline and instant results). Both are run in CI against every published version's test cases plus a shared vector suite (`packages/calculator-vectors`). The mobile app additionally runs a version's test cases once when it installs that version into the offline store and refuses to use a version that fails (falls back to online evaluation and reports the failure). Floating-point: IEEE-754 double in both engines; rounding happens only at the formula's declared `round` nodes and at display, with the declared decimals.

### Mobile calculator UX (safety requirements)

Numeric fields use the numeric keypad (`TextInputType.numberWithOptions(decimal: true)`) and accept both `,` and `.` as decimal separator, normalising to the active locale for display. Every numeric field is `[ value ] [ unit ▾ ]` with the unit selector inside the field; single-unit quantities show the unit as a fixed suffix. Finite choices use segmented controls (≤ 4 options) or a picker sheet (> 4); booleans use a two-option segmented control, never a checkbox. Required fields are marked with the word "required" in the label line, optional fields with "optional" — not an asterisk alone. Validation runs on field commit (keyboard "next"/"done", focus change, or 400 ms after typing stops) — never on every keystroke, so a half-typed "7" on the way to "70" never produces a result. The result area reads "Complete 2 required fields" until every required input is valid; then the result appears in the sticky glass result bar and the full result block (value in `result` style + unit, interpretation band, formula in mono with the inputs substituted, source citation with version and date, limitations). Outside the validated range the result area shows "Calculation not available — {input} outside the range this formula was validated for ({range from the source})" and no number (the range always comes from the calculator's source, never from this document). The copied text always includes value, unit, calculator name and version.

---

## 10 · Target subscription and finance architecture

### Purchase journey (no-refund, Demo-first)

```
Demo ─► explore real product ─► understand plan ─► create account ─► professional verification (VERIFIED)
     ─► Plans (includes · not included · duration · price · payment method · access level)
     ─► Review & confirm ("This payment is not refundable. You tried the demo and saw what Pro includes.")
     ─► Payment provider (SATIM redirect for CIB / Edahabia; bank transfer with manual confirmation)
     ─► Confirmation (status ACTIVE, period start/end, transaction ID, receipt)
```

The plan screen and the review step state, before payment: what the plan includes, what it does not include (including, plainly, that V1 has no drug database and does not generate prescriptions or certificates), the duration, the price in DZD with taxes, the payment method, the access level obtained, and that the payment is non-refundable. The review step carries one acknowledgement line the user confirms before "Pay". Checkout is enabled only when professional verification is `VERIFIED`, so nobody pays for access they might then be refused — the main source of refund requests is removed by design (*Q6*).

**Renewal** is manual in V1 (SATIM card payments do not provide recurring tokens by default — to confirm with the acquirer): the app shows the end date calmly from 14 days before, sends one notification at 14 days and one at 3 days, and offers "Renew". After `currentPeriodEnd` a 7-day `GRACE` keeps access with a neutral notice; then `EXPIRED` returns the account to `PROFESSIONAL_UNPAID` with every favorite, history item and setting kept.

**Subscription screen (mobile, calm).** Plan name and status as a neutral badge ("Active" / "Renewal due 12 Oct" / "Ended"), period start and end, access level, payment method, renewal information, and a transaction history list (date · amount · method · transaction ID · receipt). No red, no countdown timer, no promotional blocks, no "Request refund" anywhere.

### Finance (Admin Web)

```
Subscriptions ─► Transactions ─► Gross revenue ─► Payment fees ─► Net revenue
                                                                     │
                                          (separate block) Net revenue ─► Operating expenses ─► Net profit
```

| Metric | Definition |
|---|---|
| Gross revenue | Sum of `SUCCEEDED` transactions in the period, minus any exceptional adjustments in the period (shown as a footnote line "including exceptional adjustments: −X DZD" when non-zero) |
| Payment fees | Provider fees on those transactions (estimated until settlement, then actual; estimated values are labelled) |
| Net revenue | Gross revenue − payment fees |
| Operating expenses | Expenses entered by finance (infrastructure, clinical review, support, other) |
| Net profit | Net revenue − operating expenses — displayed in its own "Profitability" block, never beside revenue as one strip |
| MRR / ARR | Normalised monthly value of ACTIVE + GRACE subscriptions (ARR always labelled "projection") |
| Paying professionals | Distinct verified doctors and residents with ACTIVE or GRACE subscriptions |
| New · Renewed · Ended | Subscriptions starting, renewing, ending in the period |

**Exceptional adjustments.** If accounting or law ever requires reversing a payment (duplicate charge, provider error, court order), a Super Admin creates a `TransactionAdjustment` from the transaction drawer's overflow menu ("Exceptional adjustment…"): reason code + note required, a second admin approves, the adjustment is linked to the original transaction, audited, and reflected in Gross revenue as described. There is no refunds tab, no refunds dashboard, no refund status on subscriptions, no refund grant for sub-admins, and no user-facing path to request one. Support requests are answered outside the product.

Screens: Finance overview (ledger strip Gross → Fees → Net; Profitability block; MRR; charts by plan) · Subscriptions (plans catalogue + subscription list) · Transactions (ledger + drawer with every field of §6) · Expenses · Reports (monthly revenue, subscription report, provider fee report; CSV/PDF with definitions on page 1).

---

## 11 · Target mobile navigation (Flutter)

```
┌────────────────────────────────────────────┐
│  Bottom navigation (glass)                 │
│  Accueil · ( Recherche ) · Bibliothèque · Profil
│  Home      raised search   Library        Profile
└────────────────────────────────────────────┘
```

| Destination | Contains |
|---|---|
| **Home** | Glass search field (opens Search), quick access Ordonnances · Certificats · Calculateurs, Recent (last 3), Favorites strip, "Updated" line for newly added models, notification bell in the top bar. Demo shows a thin neutral demo bar; students see "Student access". |
| **Search** (centre, raised) | Full-screen overlay: recent searches, grouped results (Ordonnances · Certificats · Calculateurs), locked items shown with a lock and reason. Front door of the product. |
| **Library** | Segmented Ordonnances · Certificats · Calculateurs, each a searchable A–Z list with favorites first. |
| **Profile** | Header (photo, name, type, verification) → Activity ("Research": searches, viewed models, calculators used) → Favorites → Subscription (or "Student access — free") → Settings (Appearance light/dark, Language FR/EN, Notifications, Security, Account, Data & offline) → Log out. |

Favorites and Recents are first-class through Home and Profile, not separate tabs. No "Documents" tab, no floating action button (nothing is authored on mobile). Reference PDFs and calculators open by push; pickers, confirmations and row actions use bottom sheets.

**Route map (go_router):** `/welcome` · `/demo/start` · `/auth/{sign-in, sign-up, otp, reset}` · `/onboarding/{role, specialty, language, notifications}` · `/verification/{intro, identity, professional, student, summary, status}` · `/home` · `/search` · `/library/{ordonnances|certificates|calculators}` · `/reference/:id` · `/calculators/:slug` · `/profile` · `/profile/{activity, favorites, edit}` · `/subscription` · `/subscription/{plans, review, payment, result}` · `/settings/{appearance, language, notifications, security, account, offline}` · `/notifications`. Guards read the `AccessProfile`; a guard never hides a route the backend marked `LOCKED` — it renders the locked state.

---

## 12 · Target Admin Web navigation (Next.js)

```
Vue d'ensemble / Overview
OPÉRATIONS     Utilisateurs · Vérification
BIBLIOTHÈQUE   Bibliothèque de référence (Ordonnances · Certificats) · Calculateurs
BUSINESS       Abonnements · Transactions · Finance
INTELLIGENCE   Analytics
SYSTÈME        Journal d'audit · Permissions · Paramètres système
```

Desktop ≥ 1024 px, navy console bar, dense 36 px tables, right drawers (480 / 560), reason required on every mutation, audit entry on every mutation, FR/EN. Groups render from grants; a missing grant hides the item. **V1 presets:** `SUPER_ADMIN` (everything, including exceptional adjustments), `VERIFICATION_REVIEWER` (verification queue; documents only with the time-limited `verification.documents.view`), `LIBRARY_MANAGER` (`library.read/write/disable`), `CALCULATOR_EDITOR` (`calculators.draft`), `CLINICAL_REVIEWER` (`calculators.review/publish`, never on a version they authored), `FINANCE_ADMIN` (`finance.read`, `transactions.read`, `expenses.write`, `reports.export` — no adjustments), `ANALYST` (`analytics.read/export`). Separation of duties: calculator author ≠ reviewer; finance and content grants never on the same account; adjustment requester ≠ approver.

---

## 13 · V1 screen inventory

`M` = Flutter mobile (iOS + Android) · `A` = Admin Web (≥ 1024 px). There are no `W` (user web) or `T` (tablet-specific) screens in V1; the Flutter app runs on tablets with the mobile layout at a constrained content width. State codes as in design-system section 08: L loading · E empty · Er error · O offline · N no results · R restricted · Lk locked · P pending · S success · C confirmation · V validation · RU reference unavailable · CC calculation not available.

### Mobile (M)

| Area | Screen | Hi-fi reference (v2.2) | States |
|---|---|---|---|
| Authentication | Welcome (Create account · Sign in · Explore the demo) | ScreenWelcome | O, maintenance |
| | Sign in · OTP · Reset password · Create account | ScreenAccountCreate (+ pattern) | V, Er, locked after 5 tries, resend timer |
| Onboarding | Who are you? (Doctor · Resident · Medical student) | ScreenRoleSelect | none selected |
| | Specialty / university & year · Language · Notification permission | pattern of ScreenRoleSelect, LanguageSwitch | V, declined |
| Verification | Intro · Identity · Professional status / Residency / Student status · Summary | ScreenVerifyIdentity, ScreenVerifyProfessional | P (upload), Er (illegible, glare), O (queued) |
| | Status timeline · Verified · Rejected → resubmit · Appeal · Expiring | ScreenVerifyOutcomes | P, S, Er, expiring |
| Home | Home (doctor / resident) | ScreenHomeMobile | L, E (first use), O, P (verification), Lk |
| | Home (student) | ScreenHomeStudent | P (student verification), Lk |
| Global search | Search overlay (grouped results, locked rows) | ScreenSearchMobile | L, N, O, Lk |
| | Search states | ScreenSearchStates | E, N, O, Pa |
| Ordonnances | Library (search + A–Z list) | ScreenReferenceLibrary | L, E, N, O, Lk |
| | Reference PDF viewer (read-only) | ScreenReferenceViewer | L, RU, O (cached copy), multi-page |
| Certificates | Library · Viewer | ScreenReferenceLibrary · ScreenReferenceViewer (type = CERTIFICATE) | same |
| Library states | Loading · empty · no results · disabled favorite · offline | ScreenReferenceLibraryStates | E, L, N, RU, O |
| Calculators | Calculator library | ScreenCalculatorLibraryMobile | L, N, Lk |
| | Calculator (safe inputs, result, source) | ScreenCalculatorMobile | V, CC, plausibility note, unit conversion note |
| | Calculator states & source sheet | ScreenCalculatorStates | V, CC, O (offline version), source/version sheet |
| Favorites / Research | Favorites & activity | ScreenFavoritesRecents | E, RU (target disabled), cleared history C |
| Profile | Profile | ScreenProfileMobile | L, S (saved), photo upload |
| Subscription | Subscription (status, period, payment, history) | ScreenSubscriptionMobile | active, renewal due, grace, ended, pending transfer |
| | Plans · Review & confirm · Payment result | ScreenPlans | role-ineligible, verification required, Er (provider), P (transfer), S |
| | Subscription states | ScreenSubscriptionStates | active, renewal due, grace, ended, payment failed, pending transfer |
| Demo | Demo journey (start → context → demo home → boundary → subscribe) | ScreenDemo | expired demo, demo limit |
| Locked states | Student · Demo · Unpaid professional · Verification required · Not available offline · No longer available | ScreenLockedStates | Lk, RU, O |
| Settings | Settings (Appearance, Language, Notifications, Security, Account, Data & offline, Log out) | ScreenSettings | S, revert on failure, C (log out, delete account) |
| Notifications | Notification centre | ScreenNotifications | E, unread |
| Offline | Data & offline | ScreenOfflinePacks | downloading, update available, outdated, sync failed, low storage |
| | Offline bar / version chip | OfflineBar | offline, syncing, outdated, failed |

### Admin Web (A)

| Area | Screen | Hi-fi reference (v2.2) | States |
|---|---|---|---|
| Overview | Overview (work lists, ledger strip) | ScreenAdminOverview | L, E queues |
| Users | Users + drawer (profile, access profile with its inputs, subscription, activity counts, history) | ScreenUsersAdmin | suspend C, reset 2FA C |
| Verification | Queue + review drawer · Restricted document viewer · Decision dialogs | ScreenVerificationCenter · RestrictedViewer | E, SLA breach, R, timed access |
| Reference Library | List + upload/replace drawer (Ordonnances · Certificats) | ScreenReferenceLibraryAdmin | L, E, N, processing |
| | Upload / replace / enable / disable / archive states | ScreenReferenceLibraryAdminStates | uploading, success, failure, PDF unavailable, C |
| Calculators | Calculator list + version detail (definition, sources, test run, review, publish) | ScreenCalculatorAdmin | draft, in review, tests failing, published, retired |
| Subscriptions | Plans catalogue + subscriptions list | ScreenSubscriptionsAdmin | plan version change C |
| Transactions | Ledger + transaction drawer | ScreenTransactions | filters, E, exceptional adjustment C |
| Finance | Finance overview · Expenses · Reports | ScreenAdminRevenue · ScreenExpenses | L, Pa (current period), estimated fees |
| Analytics | Usage, library, calculators, users, subscriptions, demo funnel | ScreenAnalytics | L, E, suppression (< 10) |
| Audit | Audit log | ScreenAuditLogs | filters, export C |
| Permissions | Roles & grants | ScreenPermissions | temporary grants |
| System | System settings (plans visibility, demo duration, verification SLA/retention, offline, notifications, maintenance) | ScreenSystemSettings | reason required |

---

## 14 · Deferred / Future Roadmap inventory

Nothing below is built, routed, placed in navigation, returned by search, or shown as "coming soon" in V1. Hi-fi references stay in the design system, labelled Future.

| Item | Why deferred | Preserved references |
|---|---|---|
| **DokTool Web (user)** | Decision A/C: mobile-only V1; architecture prepared at API level only | ScreenHomeDesktop, ScreenSearchDesktop, SearchCommand, ScreenCalculatorLibrary, ScreenProfilePractice, ScreenReferenceLibraryWeb, ScreenReferenceViewerWeb, ScreenTabletDrug, Sidebar, TopBar |
| **Drug Database** (profile, formulations, posology, pediatric dosing, pregnancy, lactation, interactions, contraindications, renal/hepatic, alternatives, Algerian products, evidence) | Decision Q: no medical staff to maintain it safely | ScreenDrugDesktop, ScreenDrugMobile, ScreenDrugProducts, ScreenDrugHistory, ScreenPediatric*, DoseCard, ScreenPregnancyDesktop, ScreenLactationMobile, ScreenInteractions, DrugHeader, EvidenceBlock, ScreenDrugEditorAdmin, ScreenClinicalReview, ScreenDrugIntelligence |
| **Prescription / certificate generation** | Decisions K/L | ScreenPrescriptionLibrary, ScreenPrescriptionEditor, ScreenPrescriptionMobile, ScreenPrescriptionValidation, ScreenCertificateEditor, ScreenDocuments, MedicationRow, ExportSheet |
| **Pharma partnerships / sponsored content** | No surface and no relationships in V1 | ScreenPartnerships, ScreenSponsoredContent, SponsoredLabel |
| **Pharmacist and other HCP accounts** | Decision D lists Doctor, Resident, Student | enum values reserved |
| **Plans beyond Pro** (Professional, Institutional) | Decision I | — |
| **Admin mobile app** | Decision X | — |
| **Automatic renewal** | Provider capability (to confirm) | — |
| **Refund workflow** | Decision I/J — not deferred, **excluded** | ScreenExpensesRefunds removed |

---

## 15 · Migration plan

There is no code yet, so the migration is of the **design system and handoff** (what an implementer would otherwise copy) and of the **build plan** (so the repository is born correct instead of being cleaned later).

### 15.1 Classification of v2.1 artefacts

| Artefact | Class | Action taken in v2.2 |
|---|---|---|
| tokens.json, fonts, logos, Clinical Glass rules, result block, state patterns (22), accessibility floor and motion (20) | **KEEP** | Unchanged values. Web-only wording (shortcuts, page transitions, export toasts) removed. |
| Section structure (the Design System holds at most 24 sections) | **MODIFY** | Former 14 (evidence governance) and 17 (pharma) became appendices of 25; former 21 (motion) merged into 20; former 24 (design QA) became an appendix of 11. |
| 01 product architecture, 02 navigation, 03 roles, 04 journeys, 06 verification & subscription, 09 responsive, 10 implementation, 13 reference library, 15 finance, 16 analytics, 18 offline, 19 language, README | **MODIFY** | Rewritten to match this audit. |
| New sections 26 platform & backend, 27 access & entitlements (Demo, Student), 28 calculator safety | **ADD** | Written from §4–§9. The design system is published as Version 9. |
| 11 Design Lock: L20, L24 | **REMOVE / REPLACE** | L20 replaced by L40 (no refund stage); L24 retired (no export). |
| 11 Design Lock: L5, L6, L12, L15, L16, L17, L22, L26, L27 | **MODIFY** | Scoped or superseded by Design Lock v4 (L33–L44). |
| `@doktool/clinical`, `@doktool/search`, `@doktool/library` as client-imported TS packages; Expo/RN stack; `expo-print`; RN theme output | **REMOVE** | Replaced by backend modules, the Dart engine + shared vectors, and the Dart token output. |
| `@doktool/i18n` TS catalogue | **MODIFY** | Becomes JSON source compiled to ARB + TS. |
| Physician web shell, web routes, ⌘K palette, web shortcuts, desktop physician hi-fi | **FUTURE ROADMAP** | Kept as Future Web reference; out of V1 inventory. |
| V1 hi-fi screens with pre-V1 navigation/content (Home, Home student, Search, Search states, Calculator, Favorites, Profile, Plans, Subscription states, Offline, Notifications, Settings, Role select, Welcome, Verify professional, Verify outcomes; all admin screens' sidebar) | **MODIFY** | Rebuilt on mobile with V1 navigation and V1 content; admin sidebar replaced. |
| `ScreenReferenceLibrary`, `ScreenReferenceViewer` (desktop, v2.1) | **MODIFY + FUTURE** | Rebuilt as mobile; desktop versions preserved as `…Web` (future). |
| `ScreenSettingsLanguage` (desktop) | **REMOVE** | Covered by mobile ScreenSettings + LanguageSwitch. |
| `ScreenExpensesRefunds` | **REMOVE** | Replaced by `ScreenExpenses`; refunds excluded. |
| New hi-fi: ScreenDemo, ScreenLockedStates, ScreenProfileMobile, ScreenSubscriptionMobile, ScreenCalculatorLibraryMobile, ScreenCalculatorStates, ScreenCalculatorAdmin, ScreenSubscriptionsAdmin, ScreenExpenses | **ADD** | Built in the existing visual language. |
| Drug, pediatric, pregnancy, lactation, interactions, prescription/certificate generation, documents, partnerships, sponsored references | **FUTURE ROADMAP** | Unchanged, labelled Future. |
| `TRIALING`, `REFUNDED`, `PAST_DUE`, `accessLevel` enum, `PROFESSIONAL_PENDING` free access, practice profile | **DEPRECATE** | Replaced by §6–§7 model. |

### 15.2 Implementation order (each phase has an exit criterion)

| Phase | Scope | Done when |
|---|---|---|
| 1 Architecture audit | This document; ADR-001 (modular monolith), ADR-002 (R2 + StorageService), ADR-003 (calculator definitions + dual engine), ADR-004 (entitlement policy), ADR-005 (no-refund finance) | Product Owner answers §17 or accepts the proposed defaults |
| 2 Backend / domain | Monorepo, NestJS skeleton, Prisma schema for §6, migrations, module boundaries, OpenAPI generation, CI (lint, tests, token/i18n parity) | `prisma migrate` clean; OpenAPI published; CI green |
| 3 Auth + account model | User auth (OTP, access/refresh rotation, device sessions), Admin auth (separate issuer, TOTP mandatory), rate limits | Pen-test checklist for auth passes; admin cannot log in without 2FA |
| 4 Entitlements | Access module, policy config, `GET /v1/me/access`, server guards, Demo tokens | Policy test matrix (every tier × feature × item tier) passes |
| 5 R2 storage | StorageService + R2 adapter, buckets, signed URLs, upload confirm flow, retention job | No public object reachable; signed URL expiry verified |
| 6 Reference Document system | Admin CRUD API, file versions, processing job, search indexing, offline manifest | Upload → enable → visible to entitled users → replace keeps id → audit rows |
| 7 Calculator engine + governance | Definition schema, TS engine, unit registry, versions, sources, test cases, review/publish API, shared vectors | A published calculator cannot exist without a source, passing tests and a distinct reviewer |
| 8 Flutter shell | App skeleton, go_router, Riverpod, generated API client, `doktool_tokens.dart` theme, ARB i18n, secure storage, drift DB | Light/dark + FR/EN switch live; tokens only |
| 9 Mobile auth / onboarding | Welcome, sign-up/in, OTP, role, verification flows | A doctor, resident and student can each reach their home |
| 10 Home / Search / Library | Home, search overlay (online + local index), libraries | Search → open in ≤ 2 taps; locked rows render with reasons |
| 11 Reference PDF viewer | Read-only viewer (pdfrx), reference notice, favorite, offline copy | No export/print/share affordance exists in the widget tree |
| 12 Calculator UX | Dart engine, safe inputs, result, source sheet, offline self-test | Dart engine passes the shared vectors; CC state never shows a number |
| 13 Favorites / Recents / Profile | Profile, activity ("Research"), favorites, photo upload | History clearable; inputs never leave the device |
| 14 Subscription + Demo | Plans, review/confirm, SATIM integration + webhooks, transactions, Demo sessions | End-to-end payment in provider sandbox; demo never writes user data |
| 15 Offline | Manifests, sync, pack store, OfflineBar, version chips | Airplane-mode test script passes for student and professional |
| 16 Admin Web | Shell, grants, all §12 screens | Every mutation writes an audit row with a reason |
| 17 Analytics + Finance + Audit | Event ingestion, aggregates, finance metrics, reports, audit viewer | Finance numbers reconcile to transactions; analytics suppress < 10 |
| 18 Security / accessibility / QA | Threat model review, dependency audit, WCAG 2.2 AA on mobile (TalkBack/VoiceOver) and admin, store readiness | Release checklist signed |

### 15.3 Things the repository must never contain in V1

A user-facing web app or empty web routes; a Flutter admin; Expo/React Native; any `/drugs`, `/pediatric`, `/pregnancy`, `/interactions`, `/prescriptions/new`, `/documents` route or model; a PDF generation, print or share library in the mobile app; a refund endpoint or refund status; a `DEMO` professional type; `if (professionalType == STUDENT)` in UI code; a calculator formula in code outside the engine; an R2/S3 SDK import outside the storage module; a public bucket.

---

## 16 · Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **No-refund policy enforceability.** Algerian consumer-protection and e-commerce rules (e.g. Law 18-05 on electronic commerce) may impose obligations for online sales. | A policy that is not enforceable creates disputes and chargeback exposure. | Have Algerian counsel validate the terms before launch; keep the exceptional-adjustment path; make the policy visible before payment (done by design). |
| **Payment provider constraints** (SATIM redirect flow, no recurring tokens, delayed fee settlement, webhook reliability). | Manual renewal only; fees estimated; missed confirmations. | Idempotent webhook handler + reconciliation job; renewal reminders; "estimated fee" labelling. |
| **No clinical reviewer for calculators.** Governance requires reviewer ≠ author with clinical competence. | Calculators cannot be published; the V1 module is empty. | Name at least one qualified reviewer before Phase 7 content entry (*Q4*). |
| **Unit and formula errors.** | Wrong clinical results. | Unit registry with sourced factors; test vectors from source worked examples; dual engines cross-checked in CI; offline self-test. |
| **Student self-declaration abuse** (professionals choosing "student" for free access). | Revenue leakage. | Student verification with a bounded pending window; professional items stay locked for students. |
| **Demo abuse** (reinstall to reset). | Low — demo content is a small real subset. | Device-bound sessions; demo subset curated by the admin. |
| **Personal-data law and hosting.** Identity documents on Cloudflare infrastructure outside Algeria may require declarations or authorisation under Algeria's personal-data law (Law 18-07) and its authority. | Legal exposure on verification documents. | Legal review; minimise retention; consider application-level envelope encryption for `doktool-private`. |
| **Offline PDF copies** can be extracted from a rooted device. | Content leakage of reference models. | Accept for V1 (content is reference material, not personal data); app-private storage; purge on lost entitlement. |
| **PDF accessibility.** Screen readers cannot read scanned PDFs. | Some models inaccessible to blind users. | Accessible title, notice and metadata; request text-based (not scanned) PDFs from content authors. |
| **Glass performance on low-end Android** (BackdropFilter). | Jank on scroll. | Opaque `surface` fallback (existing rule) switched on by a device-capability check. |
| **Catalogue drift** between Flutter and Admin Web. | Missing strings, mixed languages. | Single JSON source; CI key-parity check. |
| **Stale design references** (future screens mistaken for V1). | Scope creep. | Future references labelled; Design Lock v4; §15.3 list enforced in code review. |

---

## 17 · Questions that genuinely block implementation

Each question has a proposed default. If the Product Owner accepts the default, nothing is blocked; phases that depend on the answer are named.

| # | Question | Proposed default | Blocks |
|---|---|---|---|
| Q1 | What does a Doctor/Resident **with an account but no subscription** get? | The same representative `demoSample` set as the Demo, but with a real account (favorites and history persist) — so the account is useful and the paid plan is the clear upgrade. | Phase 4 policy values |
| Q2 | Which content is **student-available** vs professional-only? | Calculators: all student-available. Ordonnances: student-available (educational value). Certificates: professional-only. Set per item by the admin with the `accessTier` switch. | Content entry (not code) |
| Q3 | **Plans and prices**: Pro monthly and annual? Same price for residents and doctors? Which payment methods are contracted (SATIM CIB, Edahabia, bank transfer, international card)? | Pro Monthly + Pro Annual, one price for both audiences; SATIM (CIB + Edahabia) + bank transfer. | Phase 14 |
| Q4 | **Who reviews calculator formulas** (the clinical reviewer who signs off each version)? | At least one named physician reviewer, holding `CLINICAL_REVIEWER`, before the first calculator is published. | Publishing calculator content |
| Q5 | **Demo lifecycle**: duration, and is any contact detail collected? | 7 days per device, no contact details; admin-configurable. | Phase 14 configuration only |
| Q6 | May a professional **pay before verification** is complete? | No — checkout opens only after professional verification is VERIFIED (protects the no-refund policy). | Phase 14 |
| Q7 | Are **Pharmacist and Other HCP** accounts out of V1? | Yes — onboarding offers Doctor, Resident, Medical student only; enum values reserved. | Phase 9 |
| Q8 | Does the Reference Library need **categories** for filtering? | No category in V1: A–Z list + search on titles; add a category field only if the library exceeds ~150 models per type. | Phase 6 (small) |

---

## Appendix A · Offline (V1)

| Local data | Source | Who | Behaviour |
|---|---|---|---|
| Reference PDFs | Offline manifest (`GET /v1/offline/manifest` → `{id, type, fileVersion, sha256, sizeBytes, updatedAt}` for entitled items) | Students (student-tier items), Professionals (all) | Diff-sync on Wi-Fi by default; favorites first; a disabled or no-longer-entitled item is deleted at next sync; while offline, a cached copy opens with the "Cached · {date}" chip |
| Calculator definitions | Same manifest (published versions + checksums + test cases) | All real accounts | Installed after self-test; offline results show the version chip; a retired version is replaced at next sync |
| Search index | Built on device from the manifest | All real accounts | Offline search covers downloaded items; others show "Not available offline" |
| Favorites, activity, preferences | Server, cached | All real accounts | Queued writes replay on reconnect (last-writer-wins per record) |
| Calculator last inputs | Device only | All | Never synced |
| Analytics events | Device buffer (max 5 000) | All, including Demo | Sent on reconnect with original timestamps |

Indicators keep the v2.1 visual rules: neutral OfflineBar with data date and version, `DataVersionChip` states `Up to date · Cached · {date} · Update available`, `warning` only when content is older than 30 days. Demo has no offline store. Payments, verification decisions and profile photo upload require a connection and say so inline.

## Appendix B · Analytics vocabulary (V1)

| Event | Emitted when | Payload beyond the common envelope |
|---|---|---|
| `SEARCH_PERFORMED` | A search returns results (debounced) | resultCount, groups returned — no query text |
| `REFERENCE_SEARCHED` | A search inside a library | referenceType, resultCount |
| `REFERENCE_OPENED` | A reference row is tapped | entityId, referenceType |
| `REFERENCE_VIEWED` | The PDF rendered (≥ 1 page visible) | entityId, fileVersion, source `online · offline` |
| `CALCULATOR_STARTED` | A calculator screen opens | entityId, version |
| `CALCULATOR_COMPLETED` | A valid result is shown | entityId, version, resultBand, engine — no input values |
| `CALCULATOR_USED` | Aggregate alias of COMPLETED for dashboards | — |
| `FAVORITE_ADDED` / `FAVORITE_REMOVED` | Star toggled | targetType, entityId |
| `SUBSCRIPTION_VIEWED` | Plans or subscription screen shown | screen |
| `SUBSCRIPTION_STARTED` / `SUBSCRIPTION_RENEWED` | Server-side, on successful transaction | planCode, planVersion |
| `DEMO_STARTED` | Demo session created | demoContext |
| `DEMO_FEATURE_VIEWED` | A demo user opens a module or hits a demo limit | module, locked (bool) |

Every dashboard carries: « Activité dans DokTool, agrégée. Ne représente ni des prescriptions réelles ni des ventes. » / "Activity inside DokTool, aggregated. Does not represent real prescriptions or sales." Cells under 10 distinct subjects show "< 10". Demo events are reported only in the Demo funnel.

## Appendix C · Design token layer and i18n across platforms

`tokens.json` stays the single, platform-neutral source (semantic colour roles for light and dark, type scale, spacing, radii, elevation, blur, opacity, motion durations and easing, sizes). Generators emit **CSS variables + Tailwind preset** for Admin Web and **`doktool_tokens.dart`** for Flutter: a `ThemeExtension` (`DtColors` light/dark, `DtSpacing`, `DtRadii`, `DtElevation`, `DtMotion`, `DtGlass`) plus a `TextTheme` built from the type scale with the bundled Inter and JetBrains Mono font files. Flutter implements the language with native primitives — `BackdropFilter` for the enumerated glass surfaces (with the opaque fallback), `Material`/`InkWell` without ripples that conflict with the motion rules, `showModalBottomSheet` for sheets — never by translating CSS. The v2.1 `bundle.css` and previews remain the **visual** reference for both platforms and the code reference for Admin Web only.

i18n: `packages/i18n/messages.fr.json` and `messages.en.json` (ICU MessageFormat, namespaced `common.*`, `mobile.*`, `admin.*`) → `app_fr.arb` / `app_en.arb` for Flutter `gen-l10n`, and TS modules for Admin Web. The user's `preferredLanguage` lives on the server; a reference PDF is shown exactly as uploaded whatever the UI language.

## Appendix D · Security baseline

User auth: e-mail/phone + password (Argon2id) with OTP confirmation; access JWT 15 min, rotating refresh token (hashed, device-bound, revocable) stored in Keychain/Keystore via `flutter_secure_storage`; optional user 2FA. Admin auth: separate issuer and cookie session (httpOnly, Secure, SameSite=Strict), TOTP mandatory at every login, 30-minute idle timeout, IP and user-agent recorded, no admin API reachable with a user token. Everywhere: least-privilege grants, reason + audit on every admin mutation, rate limiting (auth, OTP, search, signed URLs), TLS only, no secrets in clients, signed URLs only, verification documents in the private bucket through the restricted viewer, dependency scanning in CI, no patient data collected anywhere.

## Appendix E · Design Lock v4 (25 September 2026)

L1–L32 stay in force except where superseded here.

- **L33 Mobile-only end-user platform.** DokTool V1's user application is one Flutter app for iOS and Android. No user-facing web app, web route or empty placeholder route ships in V1. *(Supersedes the web half of L15.)*
- **L34 Backend is authoritative.** Access, subscriptions, reference availability, calculator definitions and provenance, verification, analytics, audit and finance are decided by the backend. Clients render decisions; they never re-implement rules.
- **L35 One visual language, platform-neutral tokens.** `tokens.json` is the only source; Admin Web consumes CSS/Tailwind output, Flutter consumes the generated Dart theme. No platform may add colours, radii, blur or motion values of its own; no second visual system.
- **L36 Admin Web is a Next.js desktop application** (≥ 1024 px), separate from the mobile app, with separate authentication, mandatory 2FA and API-only data access. It is never built in Flutter; there is no admin mobile app. *(Replaces L26.)*
- **L37 Demo is an access context, never a professional type.** Demo uses the real product with real sample content, never writes to real user data, and never misrepresents the paid plan.
- **L38 Entitlements are centralised and visible.** Items an access context cannot open are shown locked with a reason and a path; nothing is hidden to create false simplicity; deferred modules are never shown at all. No UI component branches on professional type.
- **L39 Subscription UI is calm.** Neutral and info tones only, no red, no countdowns, no aggressive upsell. Before payment the user sees includes, not-included, duration, price, payment method, access level and that the payment is non-refundable.
- **L40 Finance has no refund stage.** Gross revenue → Payment fees → **Net revenue**; Operating expenses → **Net profit** in a separate block. Exceptional adjustments are an isolated, dual-approved administrative operation. *(Replaces L20.)*
- **L41 Calculator safety.** Typed inputs with explicit units; no result while validation fails or outside the validated range; every formula sourced, versioned, tested, reviewed by someone other than its author, and never generated or altered by AI; offline uses exactly the published version.
- **L42 No patient data.** DokTool collects no patient identifiers, no patient fields, no free text in analytics, and never syncs calculator inputs. *(Replaces L17 and L27.)*
- **L43 Storage.** Files live in Cloudflare R2 behind `StorageService`; PostgreSQL holds metadata and keys; no permanent public URL for any protected object; verification documents live in a separate private bucket readable only through the restricted viewer.
- **L44 Offline covers V1 content for every real account** (students included), always shows data version, cached/live state and update availability, and never includes deferred modules. *(Amends L16; the export clause is retired.)*
- **Retired:** L24 (export overrides — no export exists). **Scoped to Future Roadmap:** the pediatric/pregnancy clauses of L5 and L6, L12 and L22 (sponsored content).
