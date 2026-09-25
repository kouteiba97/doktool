# Fonts

The design system's fonts (`design/system/fonts/*.woff2`, Latin subsets), converted to TrueType because Flutter cannot load WOFF2. Only the container format changed; the glyphs and metrics are untouched:

```bash
python -c "from fontTools.ttLib import TTFont; f = TTFont('in.woff2'); f.flavor = None; f.save('out.ttf')"
```

| File | Family · weight | Licence |
|---|---|---|
| `Inter-Regular.ttf`, `Inter-Medium.ttf`, `Inter-SemiBold.ttf` | Inter 400 · 500 · 600 | SIL Open Font License 1.1 (rsms.me/inter) |
| `JetBrainsMono-Regular.ttf` | JetBrains Mono 400 | SIL Open Font License 1.1 (jetbrains.com/lp/mono) |

The Latin subset covers French, including œ and typographic quotes. Other characters fall back to the system font.
