# Engineering audit — 11 November 2026

An independent inspection of the whole platform on the branch `feature/medicalcul-and-pregnancy-import` (commit `20e3039`), followed by fixes. It builds on, and does not repeat, the code audit of 26 October (`docs/CODE-AUDIT-2026-10.md`) and the threat model (`docs/security/THREAT-MODEL.md`).

This file has two parts:

- **Part 1 — Audit:** what was inspected, how, and every finding with its evidence.
- **Part 2 — Remediation report:** what was changed, how it was verified, and what remains. It is filled in as the fixes land.

Wording used throughout: **Confirmed** means reproduced by a test, a measurement or a traced code path. **Potential** means a plausible risk that was not reproduced, or that depends on a condition outside the repository.

No clinical content, formula, threshold or band was written or changed.

---

# Part 1 — Audit

## 1. Architecture as it actually is

```
 mobile (Flutter) ──HTTPS /v1/*──────┐
                                      ├──► api (NestJS 12, Express 5) ──► PostgreSQL 18 (Prisma 7, pg-boss)
 admin (Next.js 16) ─ /admin/v1/* ───┘        │
        (same-origin rewrite)                  ├──► Cloudflare R2 (or local files in development)
                                               ├──► payment gateways: Chargily · SATIM · fake
                                               └──► SMTP · SMS (Twilio, Infobip)
```

| Part | Size (hand-written) | What it is |
|---|---|---|
| `apps/api` | 34,300 lines, 20 modules, 21 migrations, 1,557-line schema | Modular monolith; each module owns its tables; the only part that touches the database |
| `apps/admin` | 30,800 lines, 16 feature folders | Next.js App Router, TanStack Query and Table, generated `openapi-fetch` client, no database access |
| `apps/mobile` | 23,800 lines, 19 feature folders | Flutter, Riverpod, go_router, dio with a generated client, drift (SQLite), secure storage, pdfrx |
| `packages/*` | 4 packages | OpenAPI contract, design tokens, one FR/EN message catalogue, shared calculator test vectors |

The repository matches its documentation closely. Three differences were found:

- `docs/RELEASE-CHECKLIST.md` says the API refuses to start in production with `ADMIN_DEV_ACCEPT_ANY_TOTP`. No code reads that variable (finding L2).
- `docs/HANDOFF.md` says `npm run ci` is green. It is not any more (findings H1 and H2).
- The mission brief asks for a provider-independent payment architecture. It already exists (ADR-021): `PaymentGateway` is the contract, with Chargily, SATIM and fake adapters, a signed webhook that only names an order, server-to-server confirmation, idempotent settlement and a reconciliation job. Section 6 of this audit reviews it instead of rebuilding it.

## 2. Method

1. **Reading.** The security-critical paths of the API were read in full: bootstrap, environment checks, both auth systems, guards, tokens, rate limiter, OTP, sessions, billing and gateways, storage and uploads, the access policy, the calculator engine. A script mapped all 205 routes to their guards. The other modules were swept with targeted searches (raw SQL, outbound requests, batch limits, upload handling, ownership checks).
2. **Running.** `npm audit`, migrations and the full `npm run ci` on a dedicated database (`doktool_test`). The API was then started on `doktool_perf` (6,000 substances) and on `doktool_demo` to measure endpoints and to walk Admin Web and the app as a user.
3. **External facts.** Chargily's official documentation (dev.chargily.com/pay-v2) was read on 11 November 2026 for everything the Chargily adapter assumes.
4. **Scans.** Tracked files were searched for secrets and key files: none found (only test fixtures such as `live_sk_0123`).

**Limits of this audit.** Not every line of all three apps was re-read; the October audit did that two weeks earlier and its six open recommendations are carried over in section 9. No real R2 bucket, Chargily account, SMS provider or physical phone was available. The privacy policy and terms of use are not in the repository (`TERMS_URL` and `PRIVACY_URL` point outside it), so they could not be compared with the data flows.

## 3. Baseline (before any change)

| Check | Result |
|---|---|
| `npm audit` | **24 advisories: 1 critical, 8 high, 15 moderate** |
| `npm run ci` | **Fails**: 612 API tests pass, **1 fails** (`billing.e2e` › grace period), 1 skipped; Admin Web 30 pass |
| Route guards | 205 routes mapped; every non-public route has a guard; the 26 public routes are meant to be public (sign-up, sign-in, refresh, password reset, account recovery, demo start, health, legal and reference data, payment return, webhook, and the development-only fake payment page and local file store) |
| Secrets in git | None |

Measured on `doktool_perf` (6,000 substances), demo viewer, median of 5, local machine:

| Endpoint | Time | Payload |
|---|---|---|
| `GET /v1/pregnancy/substances` | 145 ms | **1,373 kB** |
| `GET /v1/pregnancy/substances/search?q=a&limit=20` | 18 ms | 5.8 kB |
| `GET /v1/search?q=para` | 66 ms | 0.8 kB |
| `GET /v1/me/access` | 1 ms | 1.4 kB |

Measured on `doktool_demo` (147 calculators), through Admin Web, median of 3:

| Endpoint | Time | Payload |
|---|---|---|
| `GET /admin/v1/calculators` | 50 ms | **641 kB** |
| `GET /admin/v1/users` | 17 ms | 24 kB |
| `GET /admin/v1/transactions`, `/audit`, `/subscriptions`, `/overview` | 5–8 ms | 6–24 kB |

No response is compressed by the API itself (no `Content-Encoding`).

## 4. Findings

Severity reflects impact on correctness of clinical information, money, security and availability, in that order. There is **no confirmed critical vulnerability**: no way was found to read another person's data, bypass an entitlement, activate a subscription without a confirmed payment, or reach admin functions without a session and grant.

### High

**H1 — Known vulnerabilities in dependencies; the CI security gate now fails.** *Confirmed.*
- Where: `package-lock.json`; `apps/admin/package.json` (`next` 16.3.6); `apps/api/package.json` (`zod` 4.6.5, `sharp`, `@nestjs/platform-express` 12.1.0, `nodemailer` 10.0.10).
- Evidence: `npm audit` on 11 November. Critical: Next.js (cache poisoning; draft-mode leak). High, in code that runs in production: `body-parser` and `multer` (denial of service on request bodies and uploads), `undici`, `zod` (memory exhaustion on oversized collections), `sharp` (librsvg). The rest are build and test tools.
- Cause: advisories published after the 1 October dependency review; versions are pinned exactly.
- Impact: the API parses untrusted bodies with `body-parser`, uploads with `multer` and photos with `sharp`. CI's own step `npm audit --audit-level=high` fails, so no pull request can pass.
- Fix: move to the patched versions; re-run the whole suite.

**H2 — Renewal and verification-expiry reminders stop after 200 people.** *Confirmed by the failing test.*
- Where: `apps/api/src/modules/billing/subscription-lifecycle.service.ts` (`remind`, `advance`); `apps/api/src/modules/verification/verification-maintenance.service.ts` (`sendExpiryReminders`, `expireCases`).
- Evidence: `billing.e2e` › « keeps access in grace for 7 days… » fails with 0 reminders instead of 1. The test database holds 332 active subscriptions ending within 14 days; the job reads `take: 200` with no ordering.
- Cause: each run reads one batch of 200. People already reminded are skipped only *after* being read, so they fill the batch on every run and the others are never reached. `advance` and `expireCases` do drain, but only 200 per day.
- Impact: once more than 200 subscriptions end within 14 days (or more than 200 verifications within 60 days), the remaining people get no renewal or expiry reminder, ever. Access itself is not affected (it is computed from dates).
- Fix: page through every due row by id until none is left.

**H3 — Opening Home downloads every pregnancy substance.** *Confirmed by measurement.*
- Where: `apps/mobile/lib/src/features/activity/activity_data.dart` (`contentIndexProvider`), `apps/mobile/lib/src/features/library/library_data.dart` (`substanceListProvider`); `GET /v1/pregnancy/substances` in `apps/api/src/modules/pregnancy/pregnancy.service.ts` (`list`).
- Evidence: 1,373 kB and 145 ms for 6,000 substances, uncompressed. « Récents » on Home needs at most 5 titles; to resolve them the app loads the full lists of ordonnances, certificates, calculators and substances.
- Cause: history entries carry only ids, so the app joins them with complete lists on the device. Favorites were given server-side lookups in October; history was not.
- Impact: about 1.4 MB of mobile data and a slow Home at every sign-in or app start once the spreadsheets are imported, on the networks DokTool's users have.
- Fix: return each history entry with its item (title, access), as favorites already do, and stop loading the substance list for the index.

### Medium

**M1 — The app and Admin Web can show a different last digit for the same result.** *Confirmed by measurement.*
- Where: `apps/mobile/lib/src/features/calculators/calculator_screen.dart` (`_number`) against `apps/admin/src/i18n/format.ts` (`formatNumber`) and the engine's `roundHalfAwayFromZero`.
- Evidence (same value, same decimals):

  | Value | Decimals | App (Dart `intl`) | Admin preview (`Intl.NumberFormat`) | Engine `round` |
  |---|---|---|---|---|
  | 2.675 | 2 | 2,67 | 2.68 | 2.68 |
  | 1.005 | 2 | 1,00 | 1.01 | 1.01 |
  | 0.285 | 2 | 0,28 | 0.29 | 0.29 |
  | 9.995 | 2 | 9,99 | 10.00 | 10.00 |

- Cause: ADR-012 says display decimals are « returned, not applied », so each client rounds for display in its own way. Dart's `intl` rounds the binary value; the browser and the engine round the decimal value, halves away from zero.
- Impact: the reviewer who validates a calculator in Admin Web can see 10.00 where the doctor's phone shows 9.99. The underlying value and the band are identical; only the displayed last digit differs, on values that sit exactly on a half.
- Fix: the app rounds for display with the engine's own `roundHalfAwayFromZero` before formatting. No formula, value or band changes.

**M2 — An unrecognised Chargily status closes the payment as failed, for good.** *Confirmed by code; checked against Chargily's documentation.*
- Where: `apps/api/src/modules/billing/payments/chargily.gateway.ts` (`status`).
- Evidence: any status other than `pending`, `processing` or `paid` — including a missing or new one — is mapped to `FAILED`. A failed transaction is final (database trigger `transactions_guard`). Chargily documents `pending`, `processing`, `paid`, `failed`, `canceled`.
- Impact: if Chargily ever answers with a status this code does not know, a payment still in progress is closed as failed; a later success can no longer be recorded.
- Also: the paid amount is trusted without checking the checkout's `currency`; and a « paid » notification for a transaction already cancelled is ignored without a trace. Chargily checkouts expire after 30 minutes and DokTool cancels after 60, so this cannot happen with Chargily today, but nothing would show it if it did with another gateway.
- Fix: only the documented final statuses mean failed; anything else leaves the transaction pending and is logged. Check the currency. Log an error when a cancelled transaction turns out to be paid.

**M3 — Admin TOTP codes can be guessed without locking the account.** *Confirmed by code.*
- Where: `apps/api/src/modules/admin-auth/admin-auth.service.ts` (`signIn`, `completeTotp`).
- Evidence: wrong codes are counted per challenge (5) and per IP (20 in 10 minutes). The password step resets the account's failure counter, and wrong TOTP codes never touch it.
- Impact: someone who already has an admin's password can keep opening challenges from many addresses; the second factor is then limited only per address.
- Fix: wrong TOTP codes count toward the same account lock (5 in a row, 15 minutes), and the counter is cleared only by a complete sign-in.

**M4 — An admin's « one-time » password is permanent.** *Confirmed by code.*
- Where: `apps/api/src/modules/admin-auth/` (no route changes `passwordHash`); `admin-accounts.controller.ts` returns `oneTimePassword`.
- Impact: the Super Admin who creates an account knows its password for as long as the account exists, and a leaked or forgotten admin password cannot be replaced without editing the database.
- Fix: let a signed-in admin change their password (current password required, other sessions ended, audited), and let an admin with `system.roles.write` issue a new one-time password to another admin.

**M5 — Error reports on pregnancy profiles are unlimited, and demo sessions can send them.** *Confirmed by code.*
- Where: `POST /v1/pregnancy/substances/:id/reports`, `pregnancy.service.ts` (`report`).
- Evidence: no rate limit; the route accepts demo tokens, which need no sign-up. CLAUDE.md says demo tokens reach « read endpoints + analytics only ».
- Impact: the review queue in Admin Web can be flooded with 500-character comments by anyone.
- Fix: a per-person and per-demo-session limit. Whether demo sessions should report at all is a product decision (section 9).

**M6 — The admin calculators list runs one query per calculator and has no search.** *Confirmed by measurement and code.*
- Where: `calculators-admin.service.ts` (`list`); `apps/admin/src/features/calculators/calculators-page.tsx`.
- Evidence: 148 queries and 641 kB for 147 calculators (every version with its full definition). Users, transactions and pregnancy lists have a search box; this list of 147 rows (384 after the full import) has none.
- Fix: load all versions in one query; add the same search box the other lists have. The payload size is left as is (section 9).

**M7 — A failure cannot be traced from a report to a log line.** *Confirmed by code.*
- Where: `apps/api/src/app.setup.ts`, `apps/api/src/common/errors/error.filter.ts`.
- Evidence: no request id; a 500 logs a stack trace without the route or method; the client receives nothing to quote.
- Fix: accept or create an `X-Request-Id`, return it, and log it with the method and path of every 5xx.

**M8 — Two checkouts started at the same instant can both be created.** *Confirmed by a test (six simultaneous requests opened several payments).*
- Where: `apps/api/src/modules/billing/checkout.service.ts` (`start`).
- Evidence: « is a payment already in progress? » and the creation are separate steps with no lock and no unique constraint. If both were paid, the second activation would break the one-live-subscription index and its transaction would stay pending.
- Fix: take a per-person advisory lock around the check and the creation.

**M9 — A token refresh whose answer is lost signs the person out.** *Potential; a design trade-off of ADR-009.*
- Where: `apps/api/src/modules/auth/sessions.service.ts` (`refresh`), `apps/mobile/lib/src/core/auth/session_vault.dart` (`_renew`).
- Evidence: the server rotates the refresh token before answering. If the answer never arrives (timeout, app killed), the app retries with the old token, which is now « reused », and the session is revoked.
- Impact: occasional unexpected sign-outs on weak networks, each one also clearing what the person left on the device.
- Not changed: a short reuse window for the same device would fix it but relaxes reuse detection. It needs the owner's decision (section 9).

### Low

| # | Finding | Status |
|---|---|---|
| L1 | Admin Web's production CSP allows inline scripts (`script-src 'unsafe-inline'`), which weakens it against injected markup. Next.js needs a nonce to remove it. | Potential |
| L2 | `docs/RELEASE-CHECKLIST.md` describes a protection for `ADMIN_DEV_ACCEPT_ANY_TOTP` that does not exist; the variable is in the local `.env` and read by nothing. | Confirmed |
| L3 | `GET /v1/subscription/checkout/return?transactionId=DT-…` is public and ids are sequential: anyone can learn whether a given payment succeeded, and make the API ask the gateway about pending ones. No personal data is shown. | Confirmed |
| L4 | A demo token is not checked against its demo session on each request (a user token is). Demo tokens last one hour and read only sample content. | Potential |
| L5 | The calculator screen restores the last values typed, so reopening a calculator shows a result computed from the previous patient's values. This is specified by the design system; it is flagged here only as a risk of misreading. | By design |
| L6 | On Apple Silicon Macs the iOS simulator build fails to link: Google ML Kit ships no arm64 simulator slice. Real iPhones are not affected. | Confirmed |

## 5. Security review by area

| Area | Result |
|---|---|
| User authentication | Argon2id; decoy hashing for unknown accounts; lockout; refresh rotation with reuse and device checks inside one locked transaction; access tokens accepted only while their session is live. Sound. See M9. |
| Admin authentication | Password, then mandatory TOTP with replay protection; opaque `__Host-` cookie, `HttpOnly; Secure; SameSite=Strict`; idle and absolute timeouts; Origin check on every state-changing request; bearer tokens refused. Sound. See M3, M4. |
| Authorisation | Every admin route names its grants; ownership is checked in the service for every `:id` a user can pass (verification cases, sessions, notifications, transactions, uploads); entitlements are decided by the API and re-checked per item. No IDOR found. |
| Input handling | Global whitelist validation refusing unknown fields; raw SQL only through tagged templates; `LIKE` wildcards escaped; no dynamic code execution; outbound requests only to configured provider hosts (no SSRF). |
| Files | Server-allocated keys; signed PUT fixing type and exact size; magic-number check on confirmation; private bucket with its own credentials; 60-second signed reads for identity documents. The open item is the R2 overwrite window from October (section 9). |
| Payments | See section 6. |
| Secrets and configuration | Every secret length-checked at boot; production refuses the fake gateway, test keys and local storage. No secret in git. |
| Privacy | Analytics reject unknown keys; calculator inputs never leave the device; account deletion leaves a constrained tombstone. Not verifiable here: the published privacy policy and terms (not in the repository). |
| Dependencies | H1. |

## 6. Payment architecture review

The provider-independent design the brief asks for is already in place and was verified:

| Requirement | Where it is met |
|---|---|
| Provider contract | `payments/payment-provider.ts`: `register`, `status`, optional `verifyWebhook` |
| Adapters | `chargily.gateway.ts`, `satim.gateway.ts`, `fake.gateway.ts`; routing by method and priority in `payment-gateways.ts` |
| Subscription logic separate from providers | `checkout.service.ts` never names a provider |
| Webhook signature | HMAC-SHA256 of the raw body with the secret key, constant-time compare — matches Chargily's documentation |
| Replay and forgery | A notification only names an order; the outcome is read back from the gateway |
| Idempotency | Settlement is a conditional update from `PENDING`; return page, webhook and reconciliation can all arrive |
| Amount validation | A short payment is recorded and access is withheld |
| Never trust the client | The return page and the app only trigger a server-side confirmation |
| Card data | Never reaches DokTool |
| Refunds | None, by decision (ADR-005); Chargily documents no refund endpoint either |

Checked against Chargily's documentation on 11 November 2026: API roots, bearer authentication, `signature` header, checkout fields used (`id`, `status`, `amount`, `fees`, `fees_on_merchant`, `updated_at`, `checkout_url`, `currency`), method names (`cib`, `edahabia`), 30-minute automatic expiry.

Not stated by the documentation, and therefore to confirm in test mode before going live: that `amount` is in whole dinars (its examples suggest so), the minimum amount (the code assumes 50 DZD), and whether notifications are retried.

Weaknesses found: M2 (unknown status, currency, paid after cancellation), M8 (concurrent starts), L3 (public return page).

## 7. Information accuracy review

| Stage | Result |
|---|---|
| Definition | Typed inputs, three ranges, closed operator set, statically type-checked; immutable once published; author ≠ reviewer |
| Engines | The TypeScript and Dart engines were compared operator by operator: same order of checks, same `pow`, `log10` and rounding edge cases; both run the shared vectors |
| Input | Numeric keypad; `,` and `.` both accepted; anything unreadable is flagged and gives no result; validation on commit, not per keystroke |
| No result when invalid | Confirmed in both engines: invalid or out-of-validated-range inputs never produce a value |
| Device self-test | Each published version runs its reference cases on the phone before first use |
| Display | **M1**: last-digit difference between the app and Admin Web |
| Carried over from October | Bands are matched on the unrounded value (a clinical decision, not changed) |

## 8. UX review

**Admin Web** (walked on the demo data: overview, users, calculators, transactions, finance; code read for the others). Consistent with the design system: one table component, one dialog pattern with a mandatory reason, grants hide what the admin cannot do, loading and error states everywhere. Gap: the calculators list has no search (M6).

**Mobile app.** The walk-through of the running app is recorded in Part 2, section E.

## 9. Not changed — decisions and outside conditions

| Item | Why it is not changed here | Who decides |
|---|---|---|
| Refresh-token reuse window (M9) | Relaxes a security rule of ADR-009 | Owner |
| Demo sessions sending error reports (M5) | Product rule; only the rate limit is added | Product Owner |
| Restoring the last inputs (L5) | Specified by the design system | Product Owner |
| Bands on the unrounded value | Clinical decision (October audit, item 3) | Product Owner, a doctor |
| R2 overwrite window (`If-None-Match`) | Needs a real R2 bucket to test (October audit, item 1) | Operator |
| CSP without inline scripts (L1) | Needs nonces through the Next.js proxy and a production build to verify | Engineering, later |
| Slimmer admin calculators list | Changes the admin API contract; the query count is fixed now | Engineering, later |
| Privacy policy and terms against data flows | Documents are not in the repository | Legal review |
| Chargily amount unit, minimum, retries | Not in Chargily's documentation | Operator, in test mode |
| Unused grants; verified-resident display | October audit, items 2 and 5 | Owner |

---

# Part 2 — Remediation report

Everything below is committed on `feature/medicalcul-and-pregnancy-import` (commits `4c1b784` to `df148ab`, 12 November 2026), not pushed. No migration was added by these fixes and no database was changed outside local test and demo databases.

## A. What was fixed

| Finding | Change | Files | Verified by |
|---|---|---|---|
| H1 dependencies | Next.js 16.4.6; NestJS 12.4.2; zod 4.6.7; nodemailer 10.5.0; sharp 0.35.5; vitest 5.1.0; eslint and typescript-eslint current; transitive fixes in the lockfile | `apps/*/package.json`, `packages/design-tokens/package.json`, `package-lock.json` | `npm audit`: 0 critical, 0 high (9 moderate remain, all in lint tooling); full CI |
| H2 reminders | Recurring jobs page through every due row by id (`everyPage`) | `infrastructure/database/every-page.ts`, `subscription-lifecycle.service.ts`, `verification-maintenance.service.ts` | `every-page.spec.ts` (3); the failing `billing.e2e` test passes on the same database |
| H3 Home download | History entries come with their item (title, access), as favorites do; Home, the history screen and favorites use it; the full substance list is no longer requested | API `activity.*`; app `activity_data.dart`, `activity_screen.dart`, `home_screen.dart`, `library_data.dart`; OpenAPI and both generated clients | `activity.e2e`; `activity_data_test.dart` (a list read fails the test) |
| M1 display rounding | The app rounds for display with the engine's rule before formatting | `engine/display_number.dart`, `calculator_screen.dart` | `display_number_test.dart` (4): 2.675 → 2,68; 9.995 → 10,00 |
| M2 Chargily | Only `failed`, `canceled`, `expired` close a payment as failed; any other status leaves it pending and is logged; a paid checkout in another currency is refused; a payment reported after cancellation is logged for review | `chargily.gateway.ts`, `checkout.service.ts` | `chargily-gateway.spec.ts` (16) |
| M3 admin TOTP | Wrong codes count toward the account lock; only a complete sign-in clears the counter | `admin-auth.service.ts` | `admin-auth.e2e` › « locks the account after five wrong codes, whatever the challenge » |
| M4 admin passwords | `POST /admin/v1/auth/password` (current password, 12 characters, other sessions ended, audited, 5 checks an hour); `POST /admin/v1/admins/:id/reset-password` (new one-time password, sessions ended, authenticator kept). Admin Web: account menu › « Changer le mot de passe »; « Permissions » › « Émettre un nouveau mot de passe » | `admin-accounts.*`, `admin-auth.*`; `change-password-dialog.tsx`, `console-shell.tsx`, `admin-drawer.tsx`, `permissions-page.tsx`; 17 messages | `admin-auth.e2e` › admin passwords (4); change tried in the browser (wrong then right current password) |
| M5 error reports | 10 reports an hour per person or demo session | `pregnancy.service.ts` | `pregnancy.e2e` › « limits how many error reports… » |
| M6 calculators list | Versions loaded in one query; search box (name, slug, category; accents ignored) | `calculators-admin.service.ts`, `calculators-page.tsx` | Measured; searched « creatinine » in the browser (4 rows) |
| M7 tracing | `X-Request-Id` on every response (a plain id from the proxy is kept); unexpected errors are logged with method, path and id | `common/http/request-id.ts`, `error.filter.ts`, `app.setup.ts` | `health.e2e` |
| M8 checkout race | The pending check and the creation run under a per-person advisory lock | `checkout.service.ts` | `billing.e2e` › « opens one checkout when « Payer » is sent several times… » (fails on the old code) |
| L2 stale checklist line | Replaced by the password step | `docs/RELEASE-CHECKLIST.md` | — |

One existing test was rewritten because the rule it described changed on purpose (M3): « invalidates the challenge after five wrong codes » is now « locks the account after five wrong codes ». No expected clinical value was touched.

## B. Verification

| Check | Before | After |
|---|---|---|
| `npm audit` | 1 critical, 8 high, 15 moderate | 0 critical, 0 high, 9 moderate (lint tooling) |
| `npm run ci` | fails | passes |
| API tests | 612 pass, 1 fails, 1 skipped | 627 pass, 1 skipped |
| Admin Web tests | 30 | 32 |
| `flutter analyze` | not run at baseline | no issues |
| `flutter test` | 167 (October figure) | 174 pass |
| Migration drift check | — | no drift |

Not run: the Admin Web production build, the iOS build, tests on a real phone, anything against real R2, Chargily or SMS accounts.

## C. Performance

| Measure | Before | After |
|---|---|---|
| Substance list downloaded when Home opens (6,000 profiles) | 1,373 kB, 145 ms | not requested |
| `GET /admin/v1/calculators` (147 calculators) | 148 queries, 50 ms | 2 queries, 38 ms |
| Same, payload | 641 kB | 641 kB (unchanged, section 9) |

Other endpoints measured in section 3 were already fast and were not changed. The API still does not compress responses; behind Cloudflare the edge does.

## D. Security after the fixes

Closed: H1, M3, M4, M5, M8, and the payment robustness part of M2. Open by decision or outside condition: M9, L1, L3, L4, the R2 overwrite window. The SATIM adapter has the same « unknown status means failed » shape as Chargily had; it was left alone because SATIM is not the configured gateway and its documentation is not available here.

## E. UX walk-through of the app

Run on the Android emulator against the demo data, in English: Welcome, « Explore the demo », Home, the four library sections.

- Home puts search first, then the pregnancy shortcut and the four sections: any content is two taps away.
- Locked models stay in place with a lock and « Pro »; open ones say « View model ». Nothing is hidden.
- Empty sections say so plainly (« No calculator published yet »).
- Calculators, walked after the publication of the Medicalcul formats (ADR-028): Body Mass Index (175 cm, 70 kg → 22.86), Cockcroft (60 years, 70 kg, woman, 80 µmol/l → 72.80 ml/mn) and BISAP (yes, no, yes, yes, no → 3). The formula card showed an answer's internal code; fixed on 13 November (`7554130`).
- Not walked: a pregnancy profile on screen.
- Not walked: sign-up, verification with the camera, payment, offline use.

No change was made to the app's layout or visual identity.

## F. Payments

No payment code path was activated and no live call was made. The architecture was already provider-independent (section 6). Changed: the Chargily status mapping, the currency check, the report of a payment after cancellation, and the lock on checkout start. Before going live, in Chargily's test mode: confirm that amounts are whole dinars, the minimum amount, and that a webhook reaches `PUBLIC_API_URL`.

## G. After the audit — 13 November 2026

| Change | Commit | Verified by |
|---|---|---|
| One account, one device at a time (ADR-029, Product Owner): a sign-in ends the sessions elsewhere; the other phone says why | `4b8ea92` | `auth.e2e` (3 tests), `onboarding_test.dart`, `opened_elsewhere_test.dart` |
| A double « Payer » gets the same payment page instead of a 409 (a race left by M8) | `205cc15` | `billing.e2e` › « opens one checkout… », which failed about one run in two |
| API tests no longer fail at random on a loaded machine (one listening server per file) | `c1c8c45` | 8 full runs in a row |
| Formula card shows the chosen answer, not its code | `7554130` | `calculator_runtime_test.dart` |

State on 13 November: `npm run ci` passes (API 636 tests, 1 skipped; Admin Web 32); `flutter analyze` clean; `flutter test` 178; `npm audit` 0 high, 0 critical; no migration drift; Admin Web production build passes.

