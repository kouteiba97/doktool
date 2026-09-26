# DokTool mobile (Flutter · iOS + Android)

One app for Doctor, Resident, Medical student and the Demo (CLAUDE.md). Its stack: Riverpod · go_router · dio with the generated OpenAPI client · drift · flutter_secure_storage · gen-l10n. Visual values come only from the generated tokens.

## Generated sources

| What | From | Command | Committed |
|---|---|---|---|
| `lib/src/theme/doktool_tokens.dart` | `design/system/tokens.json` | `npm run generate:dart -w @doktool/design-tokens` | yes (CI checks it is current) |
| `lib/src/l10n/arb/app_{fr,en}.arb` | `packages/i18n/messages.*.json` | `npm run build:arb -w @doktool/i18n` | yes (CI checks it is current) |
| `lib/src/l10n/generated/` | the ARB files | `flutter gen-l10n` (also run by `flutter pub get`) | no |
| `lib/src/core/api/generated/` | `packages/api-contract/openapi.json` | `dart run swagger_parser` | no |
| `*.g.dart` | drift, json_serializable, retrofit | `dart run build_runner build --delete-conflicting-outputs` | no |

After a fresh clone, or after the API contract changes, run:

```bash
flutter pub get
dart run swagger_parser
dart run build_runner build --delete-conflicting-outputs
```

The client only includes the user API tags listed in `swagger_parser.yaml`, never the admin API.

## Run

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
```

`10.0.2.2` is how the Android emulator reaches the host; on a real phone use the machine's LAN address.

## Check

```bash
flutter analyze
flutter test
```

## What is where

| Area | Code | Notes |
|---|---|---|
| Session | `lib/src/core/auth/` | Refresh and demo renewal tokens in Keychain/Keystore; access tokens in memory; single-flight refresh after a 401 |
| Router | `lib/src/router/app_router.dart` | Guards follow the session and the account; locked content is rendered, never hidden |
| Onboarding | `lib/src/features/onboarding/` | Welcome, « Qui êtes-vous ? », sign-up with OTP, sign-in, password reset, demo start |
| Verification | `lib/src/features/verification/` | Camera capture with guides; on-device ML Kit check of legibility and name (nothing it reads leaves the phone); signed uploads to the private bucket |
| Library and search | `lib/src/features/library/`, `search/` | Server search; locked rows keep their place with the reason word |
| Reference viewer | `lib/src/features/reference/` | pdfrx, read-only, text selection off, SHA-256 checked before display |
| Calculators | `lib/src/features/calculators/` | Dart engine (runs `packages/calculator-vectors` in `test/`), self-test of each published version before use; inputs never leave the device |
| Activity | `lib/src/features/activity/` | Favorites, and the person's own history synced in batches |
| Subscription | `lib/src/features/subscription/` | Plans, review with the no-refund acknowledgement, SATIM page in the browser, result confirmed by the API |

## Permissions

- **Camera** (verification documents only). The microphone permission added by the camera plugin is removed; audio is never recorded.
- iOS 15.5 minimum (ML Kit).
- `android/gradle.properties` turns off incremental Kotlin compilation, because of a Windows cache bug when the project and the pub cache are on different drives.

## Rules the code follows

- Widgets never use a raw colour, radius, blur or duration; they read `context.colors`, `DtSpace` and the other token classes (Lock L35).
- Access comes from the backend's AccessProfile; the professional type only orders the Home quick actions.
- No export, print, share or download package is ever added (Lock L31).
