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

## Generated Flutter theme

`npm run generate:dart` writes `apps/mobile/lib/src/theme/doktool_tokens.dart` from `tokens.json`, and `npm run check` fails if the committed file is stale.

The handoff's `design/tokens/doktool_tokens.dart` did not compile: its spacing members were written as `static const double 1`. The generated file replaces it. Spacing members are named `DtSpace.s1 … s16` after their tokens, and shadows are added as the `DtElevation` theme extension. The handoff file is kept for reference only; its values are still checked, except its invalid `DtSpace` block.

## Admin Web outputs (Phase 16)

`tailwind.preset.js` is CommonJS (`module.exports`), but the repository root is ESM (`"type": "module"`). `npm run generate:web` therefore writes this package's Admin Web outputs:

- `web/tailwind-preset.mjs` — the same preset as an ES module, exported as `@doktool/design-tokens/tailwind-preset`;
- `web/tokens.css` — the token stylesheet with its font URLs pointing at `design/system/fonts`, exported as `@doktool/design-tokens/tokens.css`.

`npm run check` fails if either file is stale. The drift check still evaluates the handoff preset in an isolated CommonJS context.
