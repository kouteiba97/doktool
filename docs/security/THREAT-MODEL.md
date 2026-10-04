# DokTool V1 — threat model review (Phases 18 and 21)

Reviewed 1 October 2026 against the code at the Phase 18 commit, and again on 5 October 2026 for Phase 21: payment gateways with Chargily Pay (ADR-021), SMS providers (ADR-022), contacts, security notices and account recovery (ADR-023). Scope: the NestJS API, Admin Web (Next.js), the Flutter app, PostgreSQL, Cloudflare R2, and the external payment and SMS providers.

## Assets

| Asset | Where | Why it matters |
|---|---|---|
| Verification documents (identity, professional proof) | R2 `doktool-private`, signed URLs only | Most sensitive personal data DokTool holds |
| Accounts and sessions (users, admins) | PostgreSQL; refresh tokens in Keychain/Keystore | Account takeover, privilege escalation |
| Admin grants and TOTP secrets | PostgreSQL (TOTP encrypted with `ADMIN_TOTP_ENCRYPTION_KEY`) | A grant controls content, money and verification decisions |
| Payment gateway secret key (Chargily) | API environment only | Creates checkouts and signs webhooks |
| SMS provider keys | API environment only | Sends texts billed to DokTool |
| Account recovery photos (identity, selfie) | R2 `doktool-private`, signed URLs only, deleted 30 days after the decision | Identity data; an approved recovery hands over an account |
| Reference PDFs and calculator definitions | R2 `doktool-content`, PostgreSQL | Clinical correctness; paid content |
| Transactions, adjustments, audit log | PostgreSQL | Financial integrity, accountability |
| Analytics events | PostgreSQL (pseudonymous) | Must never become personal or clinical data |

## Actors

Anonymous visitor · demo session · student / unpaid professional / professional user · admin with grants · Super Admin · an attacker with a stolen phone, a stolen token, network position, or a compromised admin browser.

## Threats and controls (STRIDE)

### Spoofing

| Threat | Control | Code |
|---|---|---|
| Password guessing on user accounts | Argon2id (19 MiB, t=2); per-IP limit (20 / 10 min) **and** per-account lockout | `infrastructure/crypto/password-hasher.ts`, `modules/auth/auth.policy.ts`, `auth.service.ts` |
| Password guessing on admin accounts | Per-IP limit (10 / 10 min), lockout 15 min, **mandatory TOTP** (5-minute challenge, limited attempts) | `modules/admin-auth/admin-auth.policy.ts`, `admin-auth.service.ts` |
| OTP brute force | 6 digits, 10 min TTL, 3 wrong codes then 10 min lock, HMAC-stored codes, resend 60 s cooldown, 5 sends | `modules/auth/auth.policy.ts` |
| Stolen access token | User access JWT 15 min, **accepted only while its session is live** (checked on every request, so a sign-out, password change, recovery, suspension or deletion ends it at once); refresh rotation with single-flight refresh; sessions device-bound, 180 days max, revocable by the person and from Admin Web | `infrastructure/security/user-tokens.ts`, `apps/mobile/lib/src/core/auth/` |
| Account takeover by changing contacts on a borrowed, unlocked phone | Adding, replacing or removing a contact and changing the password all need the **current password** (10 checks per hour per account); a new contact is proven by a code sent to it; the other contact is told at once | `modules/auth/account-security.service.ts`, ADR-023 |
| Account takeover through assisted recovery (social engineering) | The new contact is proven by a code; identity photo + selfie compared by a reviewer with the time-limited documents grant, audited; the account's current contacts are told on submission and on approval; **24-hour hold** after approval, cancelled if the owner signs in or taps « Ce n’est pas moi »; the applied recovery disables the password and signs every device out; rate limits per IP, lost contact and new contact | `modules/auth/account-recovery.service.ts`, ADR-023 |
| Forged payment notification | Webhooks verified over the raw body (HMAC-SHA256 with the secret key, constant-time compare); even an authentic notification only names an order, whose outcome is read back from the gateway | `modules/billing/payment-webhooks.controller.ts`, `payments/chargily.gateway.ts`, ADR-021 |
| Demo token reused against real endpoints | Separate audience, 1 h TTL, read endpoints + analytics only | `infrastructure/security/demo-tokens.ts`, `viewer-auth.guard.ts` |
| Weak secrets in production | Every signing / HMAC secret validated ≥ 32 characters at boot; TOTP key must be 32 bytes | `config/env.ts` |

### Tampering

| Threat | Control | Code |
|---|---|---|
| Mass assignment / unexpected fields | Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` | `app.setup.ts` |
| Editing the ledger or the audit log | PostgreSQL triggers refuse UPDATE/DELETE/TRUNCATE on `audit_log_entries`, `transactions`; adjustments append-only with a single approval update | `prisma/migrations/20260925141834_integrity_constraints`, `20260926200000_finance` |
| Paying less than the price, or paying for a deleted account | A payment is recorded as received but access is **withheld** when the amount is below the price or the account was deleted meanwhile (`metadata.accessWithheld`), with an error for the Super Admin; settlement is idempotent (conditional update from `PENDING`) whichever of return page, webhook or reconciliation job comes first | `modules/billing/checkout.service.ts`, ADR-021 |
| Test keys or the fake gateway in production | Boot refuses `fake` in production, and a Chargily key whose prefix does not match `CHARGILY_MODE`, which must be `live` | `config/env.ts` |
| Altering a published calculator | Versions immutable once published; author ≠ reviewer enforced; device self-tests each version before use | ADR-003, ADR-012 |
| Swapped or corrupted PDF | SHA-256 declared at upload, checked on the device before display and before offline storage | `apps/mobile/lib/src/features/reference/`, `offline_store.dart` |
| CSRF on Admin Web | `__Host-` cookie, `HttpOnly; Secure; SameSite=Strict`, **and** an Origin check on every state-changing admin request | `modules/admin-auth/admin-auth.controller.ts`, `admin-guards.ts` |

### Repudiation

Every admin mutation requires a reason and writes an append-only audit entry (actor, action, entity, IP, time); separation of duties: calculator author ≠ reviewer, adjustment requester ≠ approver, finance and content grants never on one account (`features/permissions/grants.ts`, API grant checks).

### Information disclosure

| Threat | Control | Code |
|---|---|---|
| Verification documents leaking | Private bucket; signed reads 60 s; viewing needs the time-limited `verification.documents.view` grant; Admin Web pages are `Cache-Control: no-store` | `modules/storage/storage.policy.ts`, ADR-013 |
| Reference PDFs shared outside the app | Signed reads 10 min; viewer has no export/print/share/selection (Lock L31) | `reference_viewer_screen.dart` |
| Patient or free-text data in analytics | API rejects unknown keys per event type (`CLIENT_EVENTS`, strict schemas); app mirrors the rules and never records query text or inputs; cells < 10 people suppressed | `modules/analytics/analytics.policy.ts`, `apps/mobile/lib/src/features/analytics/` |
| Device backup copying app data | Android: `allowBackup=false`, `dataExtractionRules` exclude every domain (cloud and device transfer); session keys in Keystore/Keychain | `android/app/src/main/AndroidManifest.xml`, `res/xml/data_extraction_rules.xml` |
| Cleartext traffic | Release Android builds refuse cleartext (`usesCleartextTraffic=false`; debug-only override); iOS ATS defaults; HSTS from the API (helmet) and Admin Web in production | `src/debug/AndroidManifest.xml`, `apps/admin/next.config.ts` |
| Admin Web injected or framed | CSP `default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`; `X-Frame-Options: DENY`; `no-referrer`; `Cache-Control: no-store` | `apps/admin/next.config.ts` |
| Personal data kept after a person leaves | In-app account deletion confirmed with the password: each module erases its data, documents deleted at once, the row becomes a tombstone with a DB constraint proving it holds no personal field; the device forgets the account too | ADR-018, `modules/auth/account-deletion.service.ts`, migration `20261001100000_account_deletion` |
| OTPs in logs | Messages are logged only in `development`; provider logs carry the provider, a masked number (`+21366•••••67`) and the message id, never the text | `infrastructure/messaging/message-delivery.ts` |
| Card data | Never seen by DokTool: the person pays on the gateway's page; only the gateway's ids, status and (masked) details are kept | `modules/billing/payments/` |
| Recovery photos | Private bucket, signed reads 60 s with watermark, viewing needs `verification.documents.view` and is audited; deleted 30 days after the decision and at once on account deletion; recovery tokens are kept in app memory only and stored hashed | ADR-023 |
| Internal API docs exposed | Swagger UI disabled when `NODE_ENV=production` | `app.setup.ts` |

### Denial of service and cost abuse

Rate limits on sign-up, sign-in, refresh, OTP, password reset, contact changes, account recovery, demo start/renew, search, uploads and analytics ingestion (60 batches/min per subject, 100 events per batch); upload sizes bounded (PDF 20 MB, photos 10 MB); webhook bodies capped at 64 kB; jobs on pg-boss with retries. **SMS pumping** (fraudulent texts to premium numbers): texts only to `SMS_ALLOWED_COUNTRY_CODES` (Algeria by default), at most 10 per number and `SMS_DAILY_LIMIT` per server per day (ADR-022). Volumetric protection is expected from Cloudflare in front of the API (operator action).

### Elevation of privilege

Access decided only by the API (`GET /v1/me/access`, `EntitlementGate`), re-checked on every endpoint; admin grants checked per route (`@RequireGrants`); an admin cannot edit their own grants (refused by the API, `admin-accounts.service.ts`); temporary document access expires on its own; the Super Admin role is the only one allowed exceptional adjustments, with a second approver.

## Dependency audit (1 October 2026)

- `npm audit`: **0 vulnerabilities**. Four high findings came from the Prisma CLI's transitive `deepmerge-ts` (< 8) and `mysql2` (≤ 3.23, unused — DokTool runs on PostgreSQL); both are pinned with npm `overrides` (`deepmerge-ts` 8.0.2, `mysql2` 3.24.5). `prisma validate`, `generate` and `migrate status` verified after the change. CI now fails on any high or critical advisory (`npm audit --audit-level=high`).
- Flutter: all direct dependencies on their latest compatible versions (`flutter pub upgrade`, 23 patch updates); `flutter analyze` clean, tests green.

## Residual risks and open items

| Item | Owner | Note |
|---|---|---|
| Chargily account and keys | Operator | Reviewed (webhook signature, idempotency, amount check, reconciliation, deleted accounts — ADR-021). Keep the live secret key in the host's secret store; rotate it in the Chargily dashboard on suspicion of leak (webhooks then fail until the API has the new key). |
| SMS providers | Operator | Reviewed (ADR-022). Until `SMS_GATEWAYS` is configured, phone numbers are refused in production and people use e-mail. Set `SMS_DAILY_LIMIT` to the budget and watch the providers' dashboards. |
| Recovery reviewers | Product Owner | Only trusted admins get `verification.review`; the review note must say what was compared. A support address for « contactez le support » in the notices is to be published with the legal pages. |
| Edge protection | Operator | Put the API and Admin Web behind Cloudflare (WAF, rate limiting at the edge, TLS 1.2+). `TRUST_PROXY_HOPS` must match the proxy chain so client IPs in limits and audit are real. |
| Secrets management | Operator | Generate every secret with 256 bits of randomness; store them in the host's secret store, never in the repository; rotate `USER_JWT_SECRET` and `OTP_HMAC_SECRET` on suspicion of leak (sessions re-authenticate). |
| R2 bucket CORS and keys | Operator | Follow `docs/operations/r2-setup.md`; separate keys per bucket; no public access on either bucket. |
| Screenshots of reference PDFs | Accepted | The OS can always capture the screen; the product rule is "no export / share / print control", which is met. |
| Rooted / jailbroken devices | Accepted | No root detection in V1; secrets stay in hardware-backed storage where available. |
