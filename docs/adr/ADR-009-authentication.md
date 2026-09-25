# ADR-009 · Authentication (users and admins)

**Status:** Accepted · 25 September 2026
**Context:** audit Appendix D; design system sections 03, 06, 26; `ScreenAccountCreate`; audit §13 ("locked after 5 tries, resend timer")

Values marked *(spec)* come from the design system. The others are engineering defaults chosen here; each is one constant in `apps/api/src/modules/*/…policy.ts` and can change without a migration.

## Users (Flutter app) — issuer `doktool-api`, audience `doktool-user`

| Topic | Decision |
|---|---|
| Identifier | E-mail (stored lower-case) **or** phone (stored E.164). Algerian local formats (`0550 12 34 56`) are normalised to `+213…`. |
| Sign-up fields | Identifier, password, first and last name, wilaya, consent to the terms (version + timestamp stored) *(spec)*. |
| Wilaya | Stored on `User`, not on `ProfessionalProfile`: sign-up collects it before the role is chosen *(spec 06)*. The 58 wilayas (2019 law) are seeded by migration. |
| Password | Argon2id (`m = 19 MiB, t = 2, p = 1`, OWASP minimum) *(spec: Argon2id)*. Length 8–128. Must not equal the identifier. Unknown identifiers still run one Argon2 verification, so response time does not reveal whether an account exists. |
| OTP | 6 digits *(spec)*, valid 10 min. Stored as HMAC-SHA-256, never in clear. After 3 wrong codes it locks for 10 min *(spec)*. Resend after 60 s *(spec)*, at most 5 sends per challenge; each resend is a new code. |
| Confirmation | The account exists before confirmation *(spec)*. Signing in requires the identifier used to be confirmed. Re-signing up with an unconfirmed identifier restarts the confirmation; a confirmed one answers `ACCOUNT_EXISTS` *(spec: "Ce compte existe déjà")*. Accounts never confirmed are purged after 7 days. |
| Sign-in lockout | 5 wrong passwords → locked for 15 min *(spec: 5 tries)*. The counter resets on success. |
| Access token | JWT HS256, 15 min *(spec)*. Claims: `sub` (user), `sid` (session), `aud`, `iss`, `jti`. Stateless; revocation takes effect at the next refresh (≤ 15 min). |
| Refresh token | 256-bit random, stored as SHA-256 *(spec: hashed)*. Bound to the session's device id *(spec: device-bound)*. Rotated on every use *(spec)*. Sliding lifetime 30 days; session absolute lifetime 180 days. |
| Reuse detection | Presenting an already-used refresh token, or a token from another device, revokes the whole session. The app must therefore serialise refresh calls (single-flight). |
| Sessions | One row per device sign-in. Listable and revocable by the user. A password reset revokes all sessions. |
| Password reset | `request` always answers 202 with a challenge id, whether or not the account exists. `confirm` verifies the OTP, sets the password, clears the lockout and revokes every session. |
| 2FA for users | Optional in the spec — not in V1. |

## Admins (Admin Web) — separate trust boundary

| Topic | Decision |
|---|---|
| Accounts | `AdminAccount`, never a `User` *(spec)*. The first Super Admin is created with `npm run admin:create -w @doktool/api`. |
| Login | E-mail + password (Argon2id), then TOTP **at every login** *(spec)*. No session exists until the TOTP step succeeds. At first login the admin enrols TOTP (RFC 6238, SHA-1, 6 digits, 30 s — authenticator-app compatible) and must prove one code. |
| TOTP storage | Secret encrypted with AES-256-GCM (`ADMIN_TOTP_ENCRYPTION_KEY`). A code is accepted within ±1 step and only once (last used step stored). |
| Login challenge | Password step → challenge token (5 min, 5 attempts) → TOTP step. |
| Lockout | 5 wrong passwords → 15 min. |
| Session | Opaque 256-bit token in cookie `__Host-doktool_admin` (`HttpOnly; Secure; SameSite=Strict; Path=/`) *(spec: httpOnly cookie)*, stored hashed. Idle timeout 30 min *(spec)*; absolute 12 h. |
| CSRF | SameSite=Strict, plus every non-GET admin request must carry `Origin` = `ADMIN_WEB_ORIGIN`. |
| Token separation | Admin routes ignore bearer tokens, and a request to them carrying `Authorization` is refused. User routes never accept the admin cookie *(spec)*. |
| Grants | The V1 grant catalogue and presets of section 03 live in code. The Super Admin holds every grant. `@RequireGrants()` checks non-expired grants on each request. |
| Audit | Sign-in success and failure, TOTP enrolment and sign-out write `audit_log_entries`. |

## Rate limiting (ADR-007)

Fixed-window counters in PostgreSQL (`rate_limit_counters`, one row per key, atomic upsert), applied per IP and per identifier:

| Action | Limit |
|---|---|
| Sign-up | 10 per IP per hour |
| Sign-in | 20 per IP per 10 min, plus the account lockout |
| OTP resend | 5 per identifier per hour, plus the 60 s rule |
| Password-reset request | 5 per identifier and 20 per IP per hour |
| Admin sign-in | 10 per IP per 10 min, plus the account lockout |

Expired counters, challenges, tokens and sessions are purged hourly by a pg-boss job.

## OTP delivery

- **E-mail** goes through SMTP (`SMTP_URL`); production refuses to boot without it.
- **SMS** needs a provider contract that does not exist yet. Until one is configured, phone sign-up and phone password reset answer `CHANNEL_UNAVAILABLE` in production.
- In development the code is printed to the API log; in tests it is captured in memory. The message text comes from the `server.*` keys of `packages/i18n`, in the language the client sends (FR by default).
