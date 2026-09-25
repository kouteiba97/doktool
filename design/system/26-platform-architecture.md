# 26 · Platform, backend and storage architecture — V1

**v2.2 (25 September 2026).** This section is the implementation-level architecture behind every other section. Source: *DokTool V1 — Architecture Audit* (§4–§6, §8, Appendix D). Locks L33, L34, L36, L43.

## Target architecture

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

## Application boundaries

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

## Data model (conceptual)

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

## Storage — Cloudflare R2

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

## Security baseline

User auth: e-mail/phone + password (Argon2id) with OTP confirmation; access JWT 15 min, rotating refresh token (hashed, device-bound, revocable) stored in Keychain/Keystore via `flutter_secure_storage`; optional user 2FA. Admin auth: separate issuer and cookie session (httpOnly, Secure, SameSite=Strict), TOTP mandatory at every login, 30-minute idle timeout, IP and user-agent recorded, no admin API reachable with a user token. Everywhere: least-privilege grants, reason + audit on every admin mutation, rate limiting (auth, OTP, search, signed URLs), TLS only, no secrets in clients, signed URLs only, verification documents in the private bucket through the restricted viewer, dependency scanning in CI, no patient data collected anywhere.

## Future web readiness

A future DokTool Web client is added without changing identity, subscriptions, reference documents, calculators, favorites, activity, analytics, permissions, verification or finance, because: the API is versioned, client-agnostic and described by OpenAPI; access is computed server-side and returned as data; errors and notifications are catalogue keys; calculator definitions are data with shared test vectors; files are reached through signed URLs; and user preferences (language, theme) live on the server. No web UI, route or empty page is built in V1.
