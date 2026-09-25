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

## Rules the code follows

- Widgets never use a raw colour, radius, blur or duration; they read `context.colors`, `DtSpace` and the other token classes (Lock L35).
- No widget branches on professional type. Access comes from the backend's AccessProfile (Phase 10).
- No export, print, share or download package is ever added (Lock L31).
