# DokTool — instructions for Claude Code (Design System v2.2 — 25 September 2026)

DokTool V1 is a **mobile-first, mobile-only clinical utility** for doctors, residents and medical students in Algeria: one **Flutter** app for iOS and Android, operated through a separate **Next.js Admin Web**, over a **NestJS** backend that is the source of truth for every rule. It is a fast, reliable clinical instrument — not an EMR, a document generator, a drug database, a SaaS dashboard, a chatbot or a marketing platform.

```
References    SEARCH → FIND REFERENCE MODEL → VIEW PDF → USE AS CLINICAL REFERENCE
Calculators   SELECT TOOL → ENTER VALIDATED INPUTS → CALCULATE → REVIEW RESULT + SOURCE → DONE
Prospects     DEMO → EXPLORE → UNDERSTAND → SUBSCRIBE
```

**Read first:** `docs/adr/ADR-006-product-owner-decisions.md` (the Product Owner's answers to Q1–Q8 — they override everything below and in the design system), `docs/ARCHITECTURE-AUDIT.md` (the 17-section audit and target architecture — the Product Owner decisions it records override any older text), then `design/system/README.md` and `design/system/11-design-critique-and-lock.md` (Design Lock L1–L44).

The design system is the visual/UX source of truth; the repository is the implementation source of truth. **Do not redesign. Do not invent modules, formulas or UX.** When something is unspecified, use the nearest hi-fi card and the component contract; if still undecided, stop and ask.

## Applications

| App | Stack | Notes |
|---|---|---|
| `apps/mobile` | Flutter · Dart · Riverpod · go_router · dio + generated OpenAPI client · freezed/json_serializable · drift (SQLite) · flutter_secure_storage · pdfrx (read-only) · gen-l10n (ARB) · bundled Inter + JetBrains Mono · `doktool_tokens.dart` | One app for Doctor, Resident, Student and Demo access. No print/share/export packages. |
| `apps/admin` | Next.js (App Router) · TypeScript · Tailwind (generated preset) · Radix · TanStack Table · React Hook Form + Zod · Recharts (bars/lines) · lucide-react · generated TS client | Desktop ≥ 1024 px. Separate auth, mandatory TOTP 2FA. **API-only — no Prisma or DB connection here.** Never Flutter. |
| `apps/api` | NestJS · PostgreSQL · Prisma · Cloudflare R2 via `StorageService` · pg-boss jobs on PostgreSQL, no Redis (ADR-007) · OpenAPI | Modular monolith; each module owns its tables. |
| Future DokTool Web | — | **Not built.** No routes, no scaffold. The API is client-agnostic so it can be added later. |

Shared packages: `packages/design-tokens` (tokens.json → tokens.css, tailwind.preset.js, tokens.ts, **doktool_tokens.dart**), `packages/i18n` (`messages.fr.json`, `messages.en.json`, ICU → ARB + TS), `packages/api-contract` (OpenAPI → Dart + TS clients), `packages/calculator-vectors` (shared test vectors for the TS and Dart calculator engines). CI fails on: token/i18n key drift, raw colour/radius/blur/duration literals, an engine disagreeing with a vector.

## The rules that matter most

- **Backend decides access.** `GET /v1/me/access` returns an `AccessProfile` (tier `DEMO · STUDENT · PROFESSIONAL_UNPAID · PROFESSIONAL · RESTRICTED` + features/content tiers, each `AVAILABLE`/`LOCKED` with reason and unlock path). Every endpoint re-checks. The app renders it with one `EntitlementGate`; **never** `if (professionalType == STUDENT)` in UI code. (section 27)
- **Demo is an access context**, never a professional type: no sign-up, short-lived demo token (read endpoints + analytics only), real `demoSample` content, nothing written to user tables, no time limit and no contact data (ADR-006 Q5). (section 27, L37)
- **Students are free**: calculators open; ordonnances and certificates are titles only (locked), except `demoSample` items (ADR-006 Q2, D2). Professional items stay **visible and locked** — no purchase action for them. Locked ≠ hidden; deferred modules are never shown at all. (L38)
- **Ordonnances and Certificates are read-only reference PDFs** uploaded by the Super Admin. No editor, patient field, generation, export, print, share or download anywhere. Minimal metadata: `titleFr` (pre-filled from file name), optional `titleEn`, `demoSample`, status — no per-PDF access tier (ADR-006 D3); file versions derived automatically. PDF language ≠ UI language. (section 13, L31)
- **R2 via `StorageService` only** (`upload/replace/delete/head/getSignedReadUrl/getSignedUploadUrl`); no SDK import outside the storage module; buckets `doktool-content` and `doktool-private` (verification); immutable keys; signed URLs (reference 10 min, verification 60 s); no public object. (section 26, L43)
- **Calculators**: declarative versioned definitions (typed inputs, units via a sourced unit registry, hard/validated/plausible ranges, formula AST over a closed operator set, bands, limitations), ≥ 1 primary source, test cases, author ≠ reviewer, immutable once published; deterministic TS engine (authoritative) + Dart engine (offline, self-tests the version before use). No result while invalid or outside the validated range. Validation on field commit, not per keystroke. **Never generate or alter a formula with AI; never invent one.** (section 28, L41)
- **Subscriptions**: Pro for verified doctors/residents; checkout only after professional verification is VERIFIED; plan screen shows includes / not included / duration / price / method / access and "non-refundable" with an acknowledgement; manual renewal; calm UI (no red, no countdowns). **No refund workflow, status, endpoint or grant.** Exceptional adjustments: Super Admin, dual approval, isolated. (sections 06, 15, L39, L40)
- **Finance**: Gross revenue → Payment fees → Net revenue; Operating expenses → Net profit in a separate block. Transactions are individual payments with the fields of section 15.
- **Offline** for every real account (students included) — reference PDFs they are entitled to, published calculator versions, favorites, activity, settings; data version + cached/live + update availability always visible; no deferred packs. (section 18, L44)
- **Account access** (ADR-023): two contacts (e-mail and phone), every change confirmed by the password and announced on the other contact; assisted recovery with identity photo + selfie, reviewed, applied after a 24 h hold the owner can cancel; sessions end on the next request when revoked.
- **No patient data** anywhere; analytics carry no free text, no query text, no calculator inputs. (L42, section 16)
- **Bilingual FR/EN** from one catalogue; no Arabic/RTL. (section 19)
- **Grossesse · Allaitement** (ADR-019, Product Owner 4 October 2026): pregnancy and lactation profiles per substance — authored in Admin Web, sourced, reviewed by someone other than the author, immutable once published; conduct and evidence level always separate, never a safe/unsafe verdict.
- **Deferred — never build, route, list or tease**: the rest of the Drug Database (posology, pediatric dosing, interactions, contraindications, products), prescription/certificate generation, pharma partnerships/sponsored content, pharmacist/other-HCP accounts, user web app, admin mobile app. (section 25)

## Read map

`design/system/`: `01` product · `02` navigation (mobile route map, admin nav) · `03` roles & grants · `04` journeys · `05` clinical modules · `06` verification & subscription · `07` Admin Web · `08` **V1 screen inventory** (M / A) · `09` layout · `10` implementation handoff (stack, API, client state) · `11` Design Lock + QA record · `12` search · `13` reference library · `15` finance · `16` analytics · `18` offline · `19` language · `20` accessibility & motion · `22` states · `23` component index · `25` future roadmap (+ appendices: pharma, evidence governance) · `26` platform/backend/storage/data model · `27` access, Demo, Student · `28` calculator safety.

Components: `design/system/components/<Name>/README.md` + `preview.html` (visual reference for both platforms; code reference for Admin Web only). Cards in groups starting with **Future ·** are not V1. `design/tokens/doktool_tokens.dart` is generated from `tokens.json` (not compiled in the design environment — run `flutter analyze` on first import).

## Build order

The 18 phases of the audit §15.2, each with its exit criterion: architecture audit → backend/domain → auth + account model → entitlements → R2 storage → Reference Documents → calculator engine + governance → Flutter shell → mobile auth/onboarding → Home/Search/Library → PDF viewer → calculator UX → favorites/recents/profile → subscription + Demo → offline → Admin Web → analytics + finance + audit → security/accessibility/QA. Do not start screens before phases 2–7.

## Product Owner decisions (answered 25 September 2026 — ADR-006)

Q1 unpaid professional → demo sample set with a real account · Q2 students → calculators only; ordonnances/certificates titles only (+ `demoSample` items, D2) · Q3 payment → CIB + Edahabia, through Chargily Pay first (ADR-021, pluggable gateways; SATIM direct kept as an adapter); PayPal future; no bank transfer; Pro Monthly + Annual, prices set by the Super Admin (D4) · Q4 formula reviewer → the Super Admin (a doctor); a second admin authors, author ≠ reviewer enforced (D1) · Q5 demo → no time limit, no contact data · Q6 pay before verification → no · Q7 pharmacist/other HCP → out of V1 · Q8 library categories → none. Decision log: `docs/adr/`.
