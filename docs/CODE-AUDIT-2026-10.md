# Code audit — 26 October 2026

A line-by-line walk through the three applications on the branch `feature/medicalcul-and-pregnancy-import`. The aims were:

- find and fix what is broken;
- explain every function and button in the code;
- describe how the repository is organised.

The two learning books (`docs/learning-book/`) build on this audit.

| Commit | Scope |
|---|---|
| `44329e9` | API: six defects fixed, every function explained |
| `9ac6a83` | Admin Web: six defects fixed, every screen and button explained |
| `47e0cf7` | Mobile app: four defects fixed, every function and button explained |

No clinical content, formula, band or profile was written or changed (CLAUDE.md, section 28). Generated code was left untouched: the OpenAPI clients, `schema.d.ts` and `doktool_tokens.dart`.

## 1. How the repository is separated

The web application and the mobile application are already in separate folders. They share no source code, only generated contracts. The folders stay where they are; this section explains the layout.

```
doktool/
├── apps/
│   ├── api/        NestJS + Prisma + PostgreSQL — the server; the only part that touches the database
│   ├── admin/      Next.js — Admin Web, the browser console for the team (desktop ≥ 1024 px)
│   └── mobile/     Flutter — the app for doctors, residents, students and the demo (iOS + Android)
├── packages/
│   ├── api-contract/        openapi.json → the TypeScript client (admin) and the Dart client (mobile)
│   ├── design-tokens/       tokens.json → CSS, Tailwind preset, tokens.ts, doktool_tokens.dart
│   ├── i18n/                messages.fr.json / messages.en.json → ARB (mobile) + TS (admin)
│   └── calculator-vectors/  shared test cases: the TS and Dart calculator engines must agree
├── design/         the design system (visual and UX source of truth)
└── docs/           ADRs, architecture audit, handoff, operations, this audit, the learning books
```

The apps depend on each other in only one direction:

```
 mobile (Flutter) ──HTTPS /v1/*──────┐
                                      ├──► api (NestJS) ──► PostgreSQL, R2, SMS, e-mail, payment gateways
 admin (Next.js) ──HTTPS /admin/v1/*─┘
```

- **`apps/mobile`** is the app on the phone. It calls only the `/v1/*` endpoints, through the generated Dart client (`lib/src/core/api/generated/`, never edited by hand).
- **`apps/admin`** is the web console. It calls only `/admin/v1/*`, through `openapi-fetch` typed by `src/api/schema.d.ts`. It has no database connection and no Prisma import (CLAUDE.md).
- **`apps/api`** decides every rule: access, verification, payments, publication. Each module under `src/modules/` owns its tables.
- When an endpoint changes, the contract is regenerated:
  - `npm run openapi:generate -w @doktool/api`;
  - then the Dart and TS clients.

  CI fails if `openapi.json` or the admin client drift from the code.

The npm workspace holds `apps/api`, `apps/admin` and `packages/*`. Flutter has its own toolchain (`flutter pub`, `flutter test`) inside `apps/mobile`.

## 2. Method

1. **Reading.** Every source file of the three apps was read top to bottom, with the design system and ADRs for intent. Each suspicion was written down with the file and the scenario that would trigger it.
2. **Reproduction before fixing.** A finding was fixed only once a test reproduced it or the code path was traced end to end. Every fix has a test that fails without it.
3. **Performance.** The offline manifest and the favorites were measured on a database of 5,000 published pregnancy profiles (`doktool_perf`), before and after.
4. **Comments.** Comments are short, plain and in the code's own style:
   - `/** */` in TypeScript, `///` in Dart, for every function, class and component that lacked one;
   - `//` or `{/* */}` above every button, menu entry and tap handler, saying what it does.

   They were added only where missing, and no code line changed. In total:

   | App | Comments added |
   |---|---|
   | API | ≈ 870 |
   | Admin Web | ≈ 560 |
   | Mobile | ≈ 580 |

## 3. Defects found and fixed

### API (`44329e9`)

| # | Severity | Defect | Fix and test |
|---|---|---|---|
| 1 | **High** | **Re-verification dropped a paying doctor's access.** Renewing a verification (or a resident becoming a doctor) opens a new case of the same type. The access snapshot took only the latest case, so a verified, subscribed doctor fell to PROFESSIONAL_UNPAID the moment they tapped « Renouveler », and a verified student to RESTRICTED. Section 27 says re-verification never interrupts access. | `VerificationStatusService.accessSnapshot()`: while the newer case is undecided, the earlier VERIFIED (unexpired) case still counts; for a professional status, a lapsed one counts too with a live subscription. Checkout shows « vérification en cours » (`renewalPending`). Tests: `verification.e2e` › re-verification (3). |
| 2 | **High** | **Race in account recovery.** The contacts were replaced *before* the request was marked APPLIED. An owner who cancelled at that moment still lost their contacts (takeover), and their sessions were not revoked. | `apply()` first claims APPROVED → APPLIED, then replaces the contacts. A clash cancels the request; any other error puts it back to APPROVED. Test: `account-recovery.e2e` race. |
| 3 | Medium | **RESTRICTED accounts could write.** Favorites and history are read-only for that tier in the policy, but `addFavorite` and `record` never checked. | `ActivityService.writable()`: adding a favorite answers FEATURE_LOCKED; history entries are dropped silently, so the phone's queue cannot get stuck. Test: `activity.e2e` restricted. |
| 4 | Medium | **Favorites were slow and lost merged substances.** Every favorites call loaded every reference, calculator (with test cases) and 5,000 substances. A favorite of a substance merged into another (ADR-027) showed « n'est plus disponible ». | Light lookups restricted to the favorite ids: `references.byIds`, `calculators.summariesByIds`, `pregnancy.itemsByIds`; the last one resolves merges. Measured 120 ms → 15–27 ms. Test: `pregnancy-merge.e2e`. |
| 5 | Medium | **Offline manifest took 2.1 s.** `pregnancy.openable` ran about 6 queries per substance. | One bulk read, one access decision and one name index: 2,095 ms → 218 ms on 5,000 profiles. |
| 6 | Medium | **Demo conversions never counted.** A demo device that created an account was never marked CONVERTED, so the demo funnel's « converted » figure was always 0. | `DemoService.markConverted(deviceId, userId)`, called when sign-up is confirmed. Test: `analytics.e2e`. |
| 7 | Low | **CSV formula injection.** Exported cells starting with `= + - @` could run as formulas in Excel. | `common/text/csv.ts` `csvCell()` neutralises them in the finance and audit exports. Unit test. |
| 8 | Low | **SATIM status without an amount.** A missing amount became NaN, and activation treated NaN as a full payment. | The gateway throws when the amount is absent (same as Chargily). Unit test `satim-gateway.spec.ts`. |
| — | Docs | Three doc comments sat on the wrong function: `otp.service`, `users.service` and `reference-documents.service`. | Moved. |

### Admin Web (`9ac6a83`)

| # | Severity | Defect | Fix and test |
|---|---|---|---|
| A1 | Medium | **Stored XSS between admins.** A calculator source URL accepted any string, so a `javascript:` link was rendered to reviewers and sent to the app. | API: `@IsUrl({ protocols: ['http','https'], require_protocol: true })`. Test: `calculators.e2e`. Existing data checked: none bad. |
| A2 | Medium | **A button in a clickable row also opened the row.** Clicking a button inside a table row (e.g. « Traiter » on a pregnancy report) opened its dialog and also navigated away. | `DataTable` ignores clicks and Enter coming from controls inside a row. Test: `data-table.test.tsx`. |
| A3 | Low | **One request per keystroke.** The users, transactions and pregnancy searches sent a request on every key (the pregnancy list has 5,000 rows). | `useDebounced` (300 ms). |
| A4 | Low | **Approved recoveries could not be stopped.** An APPROVED recovery (in its 24 h hold) could not be rejected from the console, although the API allows it. | « Rejeter » is shown while APPROVED. |
| A5 | Low | **Silent sign-in reset.** An expired or locked TOTP challenge silently sent the sign-in form back to step 1. | The form now says why (`admin.errors.challengeInvalid`). |
| A6 | Low | **Wrong overview link.** A failed certificate file linked to the ordonnances list. | Links to its own type. |

### Mobile (`47e0cf7`)

| # | Severity | Defect | Fix and test |
|---|---|---|---|
| M1 | Medium | **Two installation ids from a race.** Concurrent first calls to `installationId()` could create two ids. A session bound to one and renewed from the other was revoked (DEVICE_MISMATCH). | Single-flight future in `SecureStore`. Test: `core_test` « gives concurrent first calls one id ». |
| M2 | Medium | **Personal data left on a shared phone.** Sign-out kept the last calculator inputs (patient values), the unsent research history and the recent searches. The next account sent the previous person's history as its own. | `AppDatabase.forgetPersonalSettings()` on sign-out and when the server ends the session. Test: « personal data on a shared phone ». |
| M3 | Medium | **Another person's account as offline fallback.** The cached account summary stayed after sign-out. If `/v1/me` failed right after the next person signed in, the app showed the previous person's name and used their profession for the redirects. | `account.summary` is now a personal setting, forgotten with the session. Same test. |
| M4 | Low | **One refused batch blocked the history queue.** A batch the API refused (4xx) was retried forever, blocking every entry queued after it. | Non-retryable 4xx batches are dropped (as analytics already did). |

## 4. Not fixed — recommendations

These need a decision or a test environment that is not available here. None of them blocks a release.

1. **R2 overwrite after confirmation.** A presigned PUT has no `If-None-Match: *`, so a signed upload URL (15 min) can still overwrite an object after it was confirmed. The local storage adapter already refuses this. Recommendation:
   - add the condition to `getSignedUploadUrl`;
   - send the header from the admin and mobile uploads;
   - test against a real R2 bucket.
2. **Verified resident after erasing documents.** Once the documents are erased or purged, the declared details are empty, and a verified RESIDENT is shown « Commencer » for a doctor case. Their access is not affected since fix 1. A small display fix: keep the target type in a column instead of in the details.
3. **Bands are matched on the unrounded value.** A result of 3.996 shown as « 4,0 » (one decimal) still falls in a band `< 4`. Both engines behave the same way and the vectors agree. Whether bands should use the displayed value is a clinical decision for the Product Owner (section 28). Do not change it without one.
4. **Admin calculators list: one query per calculator.** About 385 queries with the 384 Medicalcul drafts. Fine today; fetch the versions in one `findMany` if the list gets slow.
5. **Grants that exist but guard nothing:** `analytics.export`, `system.notifications.send` and `system.demo.configure`. Remove them, or build the screens they were meant for.
6. **DTO classes.** About 310 request/response classes in `apps/api/src/**/dto` have field comments but no class comment. They are data shapes, not functions, so they were left as they are.

## 5. Verification at the end of the audit

| Check | Result |
|---|---|
| `npm run ci` (format, lint, typecheck, i18n, tokens, OpenAPI drift, admin API check, all tests) | green: 613 API tests passed (1 skipped), 30 Admin Web tests, package tests |
| `flutter analyze` | no issues |
| `flutter test` | 167 tests passed |
| Admin Web `npm run build` | passes (run after commit `9ac6a83`) |

## 6. Where to start reading the code

- **The request path of one feature:**
  - mobile screen (`apps/mobile/lib/src/features/<feature>/…_screen.dart`);
  - its controller or provider;
  - the generated client;
  - the API controller (`apps/api/src/modules/<module>/*.controller.ts`);
  - the service;
  - Prisma.
- **Who may do what:** `apps/api/src/modules/access/access-policy.ts` holds the whole entitlement table. The app only renders its answer: `AccessController` fetches it, and `LockLabel` and `showLockSheet` in `lib/src/ui/locks.dart` draw the locks.
- **Calculators:**
  - `apps/api/src/modules/calculators/engine/` (TS, authoritative);
  - `apps/mobile/lib/src/features/calculators/engine/` (Dart, offline);
  - both checked against `packages/calculator-vectors`.
- **Admin permissions:**
  - `apps/api/src/modules/admin-auth/grants.ts` (the grants);
  - `@RequireGrants(...)` on each admin endpoint;
  - `useGrants().has(...)` (`apps/admin/src/session/session.ts`) in Admin Web, which only hides buttons. The API re-checks every call.
