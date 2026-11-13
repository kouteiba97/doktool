# DokTool V1 — release checklist (Phase 18)

Phase 18's exit criterion is this checklist, signed. **Engineering** items are done and verified in the repository. **Operator** items need the Product Owner's accounts, data or decisions. Tick them and sign at the end.

## 1. Engineering gates (done)

| Gate | Evidence |
|---|---|
| Root CI green: format, lint, types, i18n parity (FR/EN), token drift, **raw colour / radius / blur / duration literals** (Flutter + Admin Web), OpenAPI contract, Admin Web client freshness, tests | `npm run ci` — API 636 tests, Admin Web 32 (13 November 2026) |
| Database migrations apply and match the schema | CI steps "Prisma schema is valid…" and "Migrations match the schema" |
| No known high/critical npm advisory | `npm audit --audit-level=high` in CI — 0 vulnerabilities |
| Flutter analyze clean, tests green (including WCAG checks) | `flutter analyze`, `flutter test` — 178 tests |
| Android release build | `flutter build apk --release` succeeds (R8 rules for ML Kit in `android/app/proguard-rules.pro`) |
| Admin Web production build | `npm run build -w @doktool/admin` |
| Threat model reviewed | [`docs/security/THREAT-MODEL.md`](security/THREAT-MODEL.md) |
| In-app account deletion (App Store 5.1.1(v), Google Play) | Settings › Compte › « Supprimer mon compte »; [ADR-018](adr/ADR-018-account-deletion.md); `account-deletion.e2e.spec.ts`, `delete_account_test.dart` |
| Payments through pluggable gateways (Chargily Pay) | [ADR-021](adr/ADR-021-payment-gateways.md); `billing.e2e.spec.ts`, `chargily-gateway.spec.ts` |
| SMS providers with fallback and fraud guards | [ADR-022](adr/ADR-022-sms-providers.md); `sms-delivery.spec.ts` |
| One account open on one device at a time | [ADR-029](adr/ADR-029-one-device-per-account.md); `auth.e2e.spec.ts`, `opened_elsewhere_test.dart` |
| Contacts, security notices, assisted account recovery, immediate session end | [ADR-023](adr/ADR-023-account-recovery.md); `account-recovery.e2e.spec.ts`, `recovery_test.dart` |

## 2. Accessibility record (WCAG 2.2 AA)

**Automated — done**

- Mobile (`apps/mobile/test/accessibility_test.dart`): Welcome, Demo start, Sign-in, Sign-up, Role, Password reset, Settings, Delete account, Access help, Account recovery, Change password — light and dark — meet 44 × 44 touch targets (the design system's floor, above WCAG 2.5.8), labelled tap targets and text contrast; every screen renders at 200 % text without overflow. Locked rows, segmented controls and sheets are covered by `locks_test.dart` and `settings_test.dart`.
- Fixed in this phase: segmented-control segments were tappable over 38 px only (now the full 44 px).
- Admin Web, axe-core 4 (WCAG 2.0/2.1/2.2 A + AA rules) on Overview, Users (and the user drawer), Verification, Library, Calculators, Subscriptions, Transactions, Finance, Analytics, Audit, Permissions, Settings: **0 violations**. Fixed in this phase: chart SVGs were focusable inside `aria-hidden` (Recharts accessibility layer off; each chart keeps its screen-reader data table), and a muted count inside a pressed filter chip was 4.2:1 (now inherits the chip's text colour).

**Manual — operator, on real devices**

- [ ] TalkBack (Android) pass: onboarding, search, library, PDF viewer, calculator (inputs, result, band), favourites, subscription screens, offline settings. Emulator audit done on 5 October 2026 (docs/qa/talkback-audit-2026-10-05.md); still to do on a real phone by a TalkBack user, with calculators and Grossesse content.
- [ ] VoiceOver (iOS) pass on the same journeys.
- [ ] Admin Web keyboard-only pass: sign-in with TOTP, verification decision, PDF upload, calculator review, permissions.

## 3. Store readiness

**Done in the repository**

- Android `applicationId` / iOS bundle id `dz.doktool`; display name « DokTool » on both platforms.
- Launcher icons generated from the design system icon (`npm run generate:app-icons -w @doktool/design-tokens`): Android legacy + adaptive (5 densities), iOS 19 sizes, opaque 1024 px marketing icon.
- Android: app data excluded from backup and device transfer; cleartext refused in release builds; microphone permission removed; release signing read from `android/key.properties` (never committed).
- Camera usage string present (`NSCameraUsageDescription`); no tracking, no advertising SDK, no third-party analytics SDK.

**Operator**

- [ ] Create the Play upload keystore and `apps/mobile/android/key.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`); enrol in Play App Signing.
- [ ] Build the bundles with the production API and the version:
      `flutter build appbundle --dart-define=API_BASE_URL=https://<api> --dart-define=APP_VERSION=<x.y.z+n>` and `flutter build ipa` with the same defines (on a Mac, with the Apple team selected in Xcode).
- [ ] iOS: in Xcode, add an English localisation of the camera usage text (InfoPlist.strings) and the app privacy manifest (`PrivacyInfo.xcprivacy`, "no tracking").
- [ ] Publish the privacy policy and terms pages and set `PRIVACY_URL` / `TERMS_URL`.
- [ ] Play "Data safety" and App Store "App privacy" answers — the facts: account data (name, e-mail or phone, professional type, specialty, wilaya); verification photos (identity and professional proof, shared only with the verification team, deleted on the retention schedule); account-recovery photos (identity document and selfie, only when the person asks for an assisted recovery, seen only by the verification team, deleted 30 days after the decision); app activity (searches, models viewed, calculators used — history for the user; pseudonymous aggregated analytics without query text or calculator inputs); purchase history (subscriptions). No location, no contacts, no health records, no data sold or shared for advertising. Data encrypted in transit; users delete their account in the app (Settings › Compte), which erases their data except payments kept for accounting (ADR-018).
- [ ] Store listings in French and English, screenshots, content rating, target audience (health professionals and students, 18+).

## 4. Operations (operator)

- [ ] PostgreSQL 18 (as in CI) in production with daily backups; run `npm run prisma:migrate:deploy -w @doktool/api`.
- [ ] The production database allows `CREATE EXTENSION pg_trgm` (migration `20261024090000_pregnancy_import`, ADR-025); ask the host to enable it first if the migration role cannot.
- [ ] Every admin has replaced the one-time password they were handed (account menu › « Changer le mot de passe »); a forgotten one is re-issued from « Permissions ».
- [ ] API environment (`apps/api/.env.example` lists every variable): `DATABASE_URL`, `NODE_ENV=production`, `TRUST_PROXY_HOPS`, `USER_JWT_SECRET`, `OTP_HMAC_SECRET`, `ANALYTICS_SUBJECT_SECRET` (set once — changing it splits analytics history), `ADMIN_TOTP_ENCRYPTION_KEY`, `ADMIN_WEB_ORIGIN`, `TERMS_VERSION`, `TERMS_URL`, `PRIVACY_URL`, `SMTP_URL`, `MAIL_FROM`, `STORAGE_DRIVER=r2` and the `R2_*` keys, `PAYMENT_GATEWAYS` and `CHARGILY_*`, `PUBLIC_API_URL`, `JOBS_ENABLED`.
- [ ] Admin Web environment: `DOKTOOL_API_ORIGIN`, `DOKTOOL_STORAGE_ORIGINS` (the R2 endpoints), `NEXT_PUBLIC_DOKTOOL_ENVIRONMENT=production`.
- [ ] Cloudflare R2: both buckets private, CORS for Admin Web — [`docs/operations/r2-setup.md`](operations/r2-setup.md).
- [ ] Cloudflare (or equivalent) in front of the API and Admin Web: TLS, WAF, edge rate limiting.
- [ ] SMTP provider for OTP e-mails.
- [ ] SMS provider(s) ([`docs/operations/sms-setup.md`](operations/sms-setup.md), ADR-022): `SMS_GATEWAYS` (Infobip first, Twilio as backup recommended), « DokTool » registered as sender for Algeria, `SMS_DAILY_LIMIT` set to the budget; the guide's checks pass (code by SMS, reset, fallback).
- [ ] Store screenshots and demos from a separate `…_demo` database filled by `npm run demo:seed -w @doktool/api` (docs/operations/demo-data.md), plus the doctor's published clinical content — never from the test database.
- [ ] First Super Admin: `npm run admin:create -w @doktool/api`, then TOTP enrolment at first sign-in; create the other admins from Permissions with presets that respect separation of duties.
- [ ] Content: reference PDFs (ordonnances, certificates, `demoSample` flags), calculator definitions authored and reviewed by a second admin, search synonyms.
- [ ] Reference lists (specialties, wilayas, institutions) in Settings.
- [ ] Plan prices (Pro Monthly, Pro Annual) and payment fee rates in Finance.
- [ ] **Payments — Chargily Pay** ([`docs/operations/chargily-setup.md`](operations/chargily-setup.md), ADR-021): account verified by Chargily, `PAYMENT_GATEWAYS=chargily`, `CHARGILY_MODE=live`, live secret key; the test-mode checks of the guide pass; fee rates entered for « Chargily · CIB » and « Chargily · Edahabia ».

## Sign-off

| Role | Name | Date | Signature |
|---|---|---|---|
| Product Owner | | | |
| Engineering | | | |
