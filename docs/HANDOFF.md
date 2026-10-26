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

- **Work of 23–25 October 2026** (branch `feature/medicalcul-and-pregnancy-import`, not yet merged):

| Item | Commit | Notes |
|---|---|---|
| Medicalcul calculation formats → calculator drafts | `a90abc9` | `npm run medicalcul:extract` / `medicalcul:import`, `docs/medicalcul-integration/`; reuse permission from the publisher not confirmed |
| Pregnancy & lactation spreadsheet import, server search | `e3d2fa1` | ADR-025, `docs/operations/pregnancy-import.md`, migration `20261024090000` (needs `pg_trgm`) |
| Calculator answers shown whole (choice rows) | `a111026` | ADR-026 |
| Merging duplicate substances | `17d3d3a` | ADR-027, migration `20261025090000` |

`npm run ci` was green at the last commit (604 API tests, 29 admin, 28 package tests, i18n, OpenAPI). `flutter analyze` was clean and `flutter test` passed (165 tests). The migration drift check of CI and the Admin Web production build pass.

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
- **From the October work:**
  - review and merge the branch `feature/medicalcul-and-pregnancy-import`;
  - written permission from Medicalcul's author (philippe.mignard@free.fr) before any imported calculator is published;
  - the 147 imported calculator drafts each need a primary source, test cases, limitations, English texts and band severities, then a second admin's review;
  - a second admin account (Calculator editor preset) so imports can be reviewed by someone else;
  - for each pregnancy spreadsheet: map the status words, then complete evidence levels and explanations before review.
- **Decisions not yet taken:** calculator engine extensions (several results per calculator, `Math.round`-compatible rounding, value tables), which would unlock more of the 155 Medicalcul calculators kept out of the import (`docs/medicalcul-integration/integration.md`).

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

- **Prisma and raw SQL.** Indexes written in SQL (trigram, partial) are also declared in `schema.prisma`; otherwise `prisma migrate diff` proposes to drop them. Check a new migration with `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` on a freshly migrated database, as CI does.

- **Dart formatting** uses 120 columns: `dart format --page-width 120 <files>`. The default (80) reflows whole files.

- **Never format the generated tokens file.** Do not run `dart format` on `apps/mobile/lib/src/theme/doktool_tokens.dart`; restore it with `git checkout` if it happens.

- **Riverpod retry.** The app uses `providerRetry` (`lib/src/core/api/provider_retry.dart`): no silent retries when offline.

- **Accessibility.** `test/support/semantics_guidelines.dart` makes sure buttons have a tap action and fields have a label.
  - A control wrapped in `Semantics(excludeSemantics: true)` must pass `onTap` itself.
  - The touch floor is 44 px (design system section 20).

- **Commits:** one per phase or item, with a clear message, ending with the co-author line.

## Documents for the owner

- Arabic guide to every feature, app and Admin Web: `docs/guide/guide-ar.html`. Export it to PDF with Chrome (print to PDF).
- Code audit of 26 October 2026 (defects fixed, recommendations, repository layout): `docs/CODE-AUDIT-2026-10.md`.
- Learning book on the whole code base, in English and Arabic: `docs/learning-book/` (PDFs and `build.py` to rebuild them after code changes).
- Decisions: `docs/adr/` (ADR-001 to ADR-027).
- Operations: `docs/operations/` (Chargily, SATIM, SMS, R2, demo data, pregnancy spreadsheet import).
- Medicalcul extraction report and catalogue: `docs/medicalcul-integration/`.
