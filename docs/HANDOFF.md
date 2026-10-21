# Handoff — continuing DokTool on another machine (21 October 2026)

For the next Claude Code session, and for the owner. Read this after `CLAUDE.md`, then follow the « Read first » list there.

## Where the project stands

All 18 build phases of `docs/ARCHITECTURE-AUDIT.md` §15.2 are done, plus:
- **Phase 19:** Grossesse · Allaitement (ADR-019).
- **Phase 20:** glass design refresh (ADR-020).
- **Phase 21:**
  - Chargily Pay and pluggable payment gateways (ADR-021);
  - SMS providers with fallback (ADR-022);
  - account recovery (ADR-023).
- **Optional engineering items, all done on 5 October 2026:**

| Item | Commit | Notes |
|---|---|---|
| Pregnancy profiles offline, as favorites and in history | `cf79436` | Offline manifest `substances`, drift schema 4 |
| Double sign-off for clinical content | `574b216` | ADR-024, module `clinical-review` (20th module) |
| Demonstration dataset | `abf9de8`, `70b493f` | `npm run demo:seed -w @doktool/api`, `docs/operations/demo-data.md` |
| TalkBack audit and fixes | `02baf27` | `docs/qa/talkback-audit-2026-10-05.md` |
| Timestamps stored in UTC whatever the DB time zone | `5ad1c30` | Prisma sessions run `TimeZone=UTC` |
| Favorite pregnancy profiles counted in analytics | `7b637d3` | |

`npm run ci` was green at the last commit (536 API tests, admin, i18n). `flutter analyze` was clean and `flutter test` passed (158 tests).

**The engineering backlog is empty.** Do not start new features unless the owner asks. When something is unspecified, ask (CLAUDE.md: do not redesign, do not invent).

## What remains (the owner's side)

- **Accounts and keys:**
  - Chargily (`docs/operations/chargily-setup.md`);
  - SMS provider (`docs/operations/sms-setup.md`);
  - SMTP;
  - Cloudflare R2 (`docs/operations/r2-setup.md`);
  - hosting;
  - Google Play and App Store accounts.
- **Clinical content:** a doctor authors it in Admin Web:
  - calculators (inputs, formula from a cited source, bands, test cases);
  - pregnancy · lactation profiles;
  - the real ordonnance and certificate PDFs.

  A different admin reviews and publishes, optionally two (ADR-024). **Never generate or alter clinical content with AI**: no formulas, no profiles, no prescriptions, not even for demos.
- **Real-device tests:**
  - TalkBack on an Android phone;
  - VoiceOver on an iPhone;
  - the iOS build, which needs a Mac.
- **Release:** the release checklist is `docs/RELEASE-CHECKLIST.md`.

### Offered help, not yet requested

- A one-page checklist for the doctor: what to prepare per calculator and per profile.
- A list of candidate calculators and substances. Names only, the doctor chooses.
- A French walkthrough of entering the first calculator in Admin Web.

## Set up the new machine

Requirements:
- Node ≥ 24 (`.nvmrc`);
- PostgreSQL ≥ 15;
- Flutter stable (3.47 at handoff);
- Android SDK and an emulator, for the mobile app;
- Git and the GitHub CLI.

1. Clone and install:

   ```bash
   gh repo clone kouteiba97/doktool
   cd doktool
   npm install
   ```

2. **Environment.** The `.env` files are **not** in git:
   - copy `apps/api/.env.example` to `apps/api/.env` and `apps/admin/.env.example` to `apps/admin/.env`;
   - generate fresh 32+ character secrets;
   - point `DATABASE_URL` at a local database, for example `postgresql://postgres@127.0.0.1:5432/doktool`.

3. Database and API:

   ```bash
   npm run prisma:migrate:deploy -w @doktool/api
   npm run admin:create -w @doktool/api -- --email you@example.dz --name "Your Name"
   npm run start:dev -w @doktool/api
   ```

4. Admin Web:

   ```bash
   npm run dev -w @doktool/admin
   ```

   It runs on port 3001. `next dev` writes `apps/admin/AGENTS.md` and `apps/admin/CLAUDE.md`. Do not commit them.

5. Mobile:

   ```bash
   cd apps/mobile
   flutter pub get
   dart run build_runner build --delete-conflicting-outputs
   flutter gen-l10n
   adb reverse tcp:3000 tcp:3000
   flutter run --dart-define=API_BASE_URL=http://localhost:3000
   ```

6. Optional sample data:
   - create an empty database whose name ends in `_demo` and migrate it;
   - run `DATABASE_URL=…/doktool_demo npm run demo:seed -w @doktool/api`;
   - keep the printed passwords: they are shown once.

On the first machine the local database was a PostgreSQL 18 cluster on port 55432. Its data did **not** travel: only test and demo data was there.

## How to work in this repo

- **Full check before every commit:**

  ```bash
  DATABASE_URL=<test db> npm run ci
  ```

  Then in `apps/mobile`, run `flutter analyze` and `flutter test`.

  Integration tests do **not** roll back: use a dedicated test database. A test that changes platform-wide state (for example the clinical review policy) must reset it, as `clinical-review.e2e.spec.ts` does.

- **API contract changed** (DTOs, endpoints):

  ```bash
  npm run openapi:generate -w @doktool/api
  npm run generate:api -w @doktool/admin
  cd apps/mobile
  dart run swagger_parser
  dart run build_runner build --delete-conflicting-outputs
  ```

- **Messages (FR/EN, one catalogue):**
  1. Write a JSON file `{ "fr": {…}, "en": {…}, "remove": [] }`.
  2. Run `npm run add-keys -w @doktool/i18n -- file.json`.
  3. Run `npm run build:arb -w @doktool/i18n`.
  4. Run `flutter gen-l10n` in `apps/mobile`.

  ICU `#` in plurals is fine: the ARB build converts it for Flutter.

- **Migrations** are hand-written SQL in `apps/api/prisma/migrations/<timestamp>_<name>/`.
  - Enum `ADD VALUE` goes in its own migration, before any migration that uses the value.
  - Each model lives under the `// ── [module] ──` section of the module that owns it; a unit test checks this.

- **Never format the generated tokens file.** Do not run `dart format` on `apps/mobile/lib/src/theme/doktool_tokens.dart`; restore it with `git checkout` if it happens.

- **Riverpod retry.** The app uses `providerRetry` (`lib/src/core/api/provider_retry.dart`): no silent retries when offline.

- **Accessibility.** `test/support/semantics_guidelines.dart` makes sure buttons have a tap action and fields have a label.
  - A control wrapped in `Semantics(excludeSemantics: true)` must pass `onTap` itself.
  - The touch floor is 44 px (design system section 20).

- **Commits:** one per phase or item, with a clear message, ending with the co-author line.

## Documents for the owner

- Arabic guide to every feature, app and Admin Web: `docs/guide/guide-ar.html`. Export it to PDF with Chrome (print to PDF).
- Decisions: `docs/adr/` (ADR-001 to ADR-024).
- Operations: `docs/operations/` (Chargily, SATIM, SMS, R2, demo data).
