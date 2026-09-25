# 10 · Implementation handoff — v2.2

Written for Claude Code / Claude Opus. The product and design decisions are made; implementation must not invent UX or product scope. When something is not specified, use the nearest hi-fi screen's pattern and the component contract; if still undecided, stop and ask. **The Design System is the visual/UX source of truth; the repository is the implementation source of truth; the Product Owner decisions recorded in sections 26–28 and Design Lock v4 override any older text.**

## Read order

1. README (brand book) → 11 (Design Lock L1–L44) → 26 (platform & backend) → 27 (access, Demo, Student) → 28 (calculator safety).
2. For a feature: its section (05 clinical, 06 verification/subscription, 07 admin, 12 search, 13 reference library, 15 finance, 16 analytics, 18 offline, 19 language) → its screens in 08 → the hi-fi and component cards named there.
3. `tokens.json` is the only source of values.

## Applications and stack

| Application | Stack |
|---|---|
| **Mobile** (iOS + Android, one app) | Flutter + Dart · Riverpod (state) · go_router (navigation) · dio + generated OpenAPI client · freezed/json_serializable (models) · drift/SQLite (offline store, local search index) · flutter_secure_storage (tokens) · pdfrx (read-only PDF rendering; no print/share affordances) · gen-l10n (ARB) · bundled Inter + JetBrains Mono · `doktool_tokens.dart` theme. Platform plugins only where needed (camera/image picker for verification, local notifications/push). |
| **Admin Web** | Next.js (App Router) · TypeScript · Tailwind with the generated preset · Radix primitives · TanStack Table · React Hook Form + Zod · Recharts (bars/lines only) · lucide-react · generated TS client. API-only data access; no Prisma in this app. |
| **Backend** | NestJS · PostgreSQL · Prisma · Cloudflare R2 via `StorageService` (S3-compatible SDK inside the storage module only) · Redis for BullMQ jobs and rate limiting (or pg-boss — one ADR) · OpenAPI generation. |
| **Future DokTool Web** | Not built. Will consume the same `/v1` API (section 26). |

Not used in V1: Expo / React Native, React Navigation, `expo-print`, any PDF generation or print library, any Flutter admin, any user-facing Next.js app.

## Repository layout

```
apps/api  ·  apps/admin  ·  apps/mobile
packages/design-tokens   tokens.json → tokens.css, tailwind.preset.js, tokens.ts, doktool_tokens.dart
packages/i18n            messages.fr.json, messages.en.json (ICU) → app_fr.arb/app_en.arb, TS modules
packages/api-contract    openapi.yaml → Dart client, TS client
packages/calculator-vectors   shared test vectors for the TS and Dart engines
docs/adr
```

## Tokens pipeline

`tokens.json` (platform-neutral: semantic colours light/dark, type, spacing, radius, elevation, blur, opacity, border, motion, sizes) → **Admin Web:** `tokens.css` (CSS variables, `[data-theme]`, `@font-face`) + `tailwind.preset.js` + `tokens.ts` → **Flutter:** `doktool_tokens.dart` — a `DtColors` `ThemeExtension` (light/dark), `DtSpace`, `DtRadius`, `DtBlur`, `DtOpacity`, `DtBorder`, `DtSize`, `DtMotion` (three durations, two curves), `DtType` text styles, and `dtTheme(Brightness)`. Flutter implements the language with native primitives: `BackdropFilter` (sigma = blur / 2) only on the glass surfaces of Lock L2 with the opaque `surface` fallback on low-capability devices; no ink ripples; `showModalBottomSheet` for sheets; `FontFeature.tabularFigures()` for numbers. CI fails on a raw colour, radius, blur or duration literal outside the token files, on either platform.

## API contract (conceptual)

| Domain | Endpoints (v1) |
|---|---|
| Session & access | `POST /v1/auth/*` · `GET /v1/me` · `GET /v1/me/access` (AccessProfile) · `PATCH /v1/me/preferences` |
| Demo | `POST /v1/demo/sessions` → demo token · demo tokens reach read endpoints + analytics only |
| Verification | `POST /v1/verification/cases` · `POST …/documents:uploadUrl` · `POST …/submit` · `GET /v1/verification/status` |
| Search | `GET /v1/search?q&types` → groups with per-row `access` state |
| Reference library | `GET /v1/references?type&q&cursor` · `GET /v1/references/{id}` · `GET /v1/references/{id}/file` → signed URL (10 min) |
| Calculators | `GET /v1/calculators` · `GET /v1/calculators/{slug}` (published version definition, sources, limitations) · `POST /v1/calculators/{id}/versions/{v}/evaluate` |
| Activity | `GET/PUT/DELETE /v1/favorites` · `GET/DELETE /v1/activity` |
| Billing | `GET /v1/plans` · `POST /v1/checkout` (requires VERIFIED) · `GET /v1/subscription` · `GET /v1/transactions` · provider webhooks (server-to-server) |
| Offline | `GET /v1/offline/manifest` |
| Analytics | `POST /v1/events` (batched) |
| Admin | `/admin/v1/*` — separate issuer; list endpoints `{filters, sort, cursor, savedViewId}` → `{rows, total, facets}`; every mutation requires `reason` and returns the audit entry id |

Versioned (`/v1`), client-agnostic, no endpoint shaped for one client's screen. Errors use one problem-details format with a catalogue key so every client can translate them.

## Client state (mobile)

| Domain | Client state | Source of truth |
|---|---|---|
| Session | tokens (secure storage), device id | backend |
| Access | cached AccessProfile (refreshed on launch, on resume, after purchase/verification events) | backend |
| Preferences | language, theme (applied instantly) | backend, cached |
| Search | query, recent searches (device), local index | backend index online; local index offline |
| Reference library | list pages, cached PDFs (entitled only) | backend + R2 |
| Calculators | installed published versions + test results, last inputs (device only) | backend |
| Favorites / activity | cached lists, queued writes | backend |
| Subscription | plan, status, period, transactions | backend |
| Offline | manifest, sync state, storage use | backend manifest |
| Analytics | buffered events | backend |

## Build order

Follow the 18 phases of the Architecture Audit §15.2: audit → backend/domain → auth + account model → entitlements → R2 storage → Reference Documents → calculator engine + governance → Flutter shell → mobile auth/onboarding → Home/Search/Library → PDF viewer → calculator UX → favorites/recents/profile → subscription + Demo → offline → Admin Web → analytics + finance + audit → security/accessibility/QA. Each phase has an exit criterion; do not start screens before phases 2–7 exist.

## Definition of done (per screen)

Matches its hi-fi card in both themes · all states in its section 08 row · locked states driven by the AccessProfile, never by professional type · accessibility checks (section 20) with TalkBack/VoiceOver on mobile · tokens only · FR and EN strings from the catalogue · analytics events per section 16 (no patient data, no free text) · offline behaviour per section 18 · reviewed against Design Lock v4.
