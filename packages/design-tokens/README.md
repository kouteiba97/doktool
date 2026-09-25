# @doktool/design-tokens

`design/system/tokens.json` is the only source of visual values (Lock L35). Its generated outputs live in `design/tokens/`:

| Output | Consumer |
|---|---|
| `tokens.css` | Admin Web |
| `tailwind.preset.js` | Admin Web |
| `tokens.ts` | Admin Web |
| `doktool_tokens.dart` | Flutter |

`npm run check` fails when an output disagrees with `tokens.json`. It checks:

- every colour and shadow token, light and dark;
- every scalar token (spacing, radius, blur, opacity, border, duration, easing, breakpoint, z-index, size);
- that the Tailwind preset maps every colour to its CSS variable;
- the Dart colours, radii, blur, opacity, border, size and motion durations.

## Known issues — fixed in Phase 8 (Flutter shell) and Phase 16 (Admin Web)

- `doktool_tokens.dart` declares the spacing scale as `static const double 1 = 4.0;`. That is not a valid Dart identifier, so the file does not compile. Its generator (`gen_dart.py`) is not part of the handoff. Phase 8 replaces it with a generator in this package that emits valid names. Until then the drift check skips `DtSpace`; the CSS and TS spacing values are still checked.
- `tailwind.preset.js` is CommonJS (`module.exports`), but the repository root is ESM (`"type": "module"`). Admin Web must not import it from `design/tokens/` directly. Phase 16 generates an ESM preset into this package. The drift check evaluates the file in an isolated CommonJS context.
