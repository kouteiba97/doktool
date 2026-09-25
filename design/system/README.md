DokTool is a mobile clinical utility for doctors, residents and medical students — first in Algeria, then Francophone North Africa. It helps healthcare professionals quickly find and use practical clinical resources: read-only reference PDF models for Ordonnances and Certificates, and sourced, versioned clinical calculators. Everything in this system serves one loop: **Search → Find → Use → Done.** For references: **Search → Find reference model → View PDF → Use as clinical reference** — never Search → Edit → Export. For calculators: **Select tool → Enter validated inputs → Calculate → Review result + source → Done.** For prospective subscribers: **Demo → Explore → Understand → Subscribe.** Build DokTool as a clinical instrument, not a SaaS dashboard. **This is DokTool Design System v2.2 (25 September 2026 platform correction):** the end-user product is **one Flutter app for iOS and Android** (no user web app in V1), operated through a separate **Next.js Admin Web** console, over a NestJS backend that is the source of truth for every rule, with files in Cloudflare R2 (sections 26–28). The visual language below is unchanged and platform-neutral: `tokens.json` feeds both the Admin Web CSS and the Flutter theme (`doktool_tokens.dart`). Design Lock v4 (section 11) records the corrections; the Drug Database, document generation, the user web app and partnerships are future roadmap (section 25). The HTML/CSS previews in this system are visual references for both platforms and code references for Admin Web only.

Tagline: *Essential clinical tools. One place.* / *Les outils essentiels du médecin, au même endroit.*

## Design principles

1. **Search first.** Every mobile screen reaches global search in one action (the raised Search tab; the glass field on Home). Never require category browsing to reach a known reference model or calculator.
2. **Clinical clarity over decoration.** When beauty and clarity conflict, clarity wins. When motion and speed conflict, speed wins.
3. **One visual priority per screen.** A calculator screen is about the RESULT; a reference viewer about the PDF; a library about the LIST. Everything else is quieter.
4. **Warnings are never color-only.** Every warning carries an icon and a word (`Hors plage validée`, `Valeur invalide`). Critical warnings are never collapsed by default.
5. **Sources are visible.** Every calculator result shows its formula, source, version and review in place, never in a hidden footer.
6. **Progressive disclosure.** Quick summary first, tabs second, references last. Density grows with the user's intent, not with the screen size alone.
7. **Repeated workflows are one tap shorter each time.** Recents and favorites are first-class; the last-used calculator inputs are remembered on the device; search rows open their destination directly.
8. **Trust through transparency.** Verification status, data version, cached-vs-live, available-vs-locked, demo-vs-real: always labeled, never implied.
9. **Reuse patterns.** One list row, one detail header, one tab bar, one status badge, one evidence block — across every module.
10. **Frames are for tables, lists, the result block and the paper preview.** Sections, summaries and metric groups are separated by headings and hairlines, never boxed.
11. **Density with structure.** The mobile app is compact and calm; Admin Web is dense and tabular. Neither is cluttered.
12. **Every screen has a purpose it can state in one line.** If it cannot, it is a section of another screen.

## Voice and content

- DokTool is **bilingual — French and English** (superseding the earlier French-only decision): interface, navigation, notifications and the admin console all read from one centralized catalogue per language (section 19); a user's `preferredLanguage` drives every UI string. There is still no right-to-left layout in this version. **A reference model's uploaded PDF keeps its own language independently of the UI language** — DokTool never translates or re-renders a PDF's content, only the chrome around it (section 13, section 19). Write in Algerian medical French / clear medical English, actions in the infinitive (FR) or imperative (EN) (`Voir le modèle` / `View model`, `Ajouter aux favoris` / `Add to favorites`), sentence case everywhere. No exclamation marks. No emoji anywhere in the product.
- Units are always explicit and never separated from their number by a line break: `12,5 mg/kg/j`, `2,5 mL`, `88 mL/min`. Decimal comma, narrow no-break space as thousands separator (`2 500 DZD`); the token `numeric` style enables tabular figures for any column of numbers.
- Clinical hedging is precise, not vague: `Données limitées (n=42)` rather than `Probablement sûr`. Never use `SAFE / UNSAFE` as a primary label anywhere.
- Product activity is described as activity: `Recherches dans la bibliothèque`, `Consultations de modèles` — never as real-world prescribing or sales (section 16).
- Sponsored material always carries the literal word `Sponsorisé` with the `SponsoredLabel` component; clinical content never does. In V1 there is no sponsored content to label — this rule is preserved for when partnerships return (`25-future-roadmap.md`).

## Color

Light is the primary clinical environment; dark is a night-shift environment, not an inversion.

- Page ground is `bg`; content sits on `surface`; a raised panel or drawer on `surface-raised`; an inset well (input wells, table headers) on `surface-sunken`. Never use pure white for the page ground.
- Text: `ink` for primary text, `ink-secondary` for labels and supporting copy, `ink-muted` only for metadata, placeholders and timestamps. All three meet 4.5:1 on `bg`, `surface` and `surface-raised` in both themes.
- `brand` (deep medical blue) is spent on: primary buttons, selected navigation, links, focus rings, the search caret, key data series. It is never a card background. `brand-soft` is the only tint allowed as a fill (selected rows, active quick actions, the current tab pill); text on it is `brand-strong`.
- `teal` is the secondary clinical accent: calculator results and "verified" trust marks only. `teal-soft` is its tint.
- `navy` is reserved for the admin console top bar and the dark-theme grounds; never as text on light.
- Semantic colors are paired: `success`/`success-soft`, `warning`/`warning-soft`, `critical`/`critical-soft`, `info`/`info-soft`. The strong value is text or icon on the soft value, or on `surface`. Each state also has an icon and a word.
- Borders: `border` for hairlines and dividers, `border-strong` for input outlines and table frames. Shadows are `shadow-sm` for raised surfaces and `shadow-md` for overlays only; nothing else casts a shadow.
- Data visualization: series order is `brand`, `teal`, `viz-3`, `viz-4`, `viz-5`; sequential scales run `brand-soft → brand`; never rainbow scales, never semantic colors for non-semantic series.

## Typography

Inter at 400/500/600 for UI (self-hosted: `fonts/`, no third-party font request at runtime), with `font-feature-settings: "tnum", "cv11"` wherever numbers align; JetBrains Mono for transaction IDs, versions, formulas and codes.

- `display` (28/34, 600) only on Welcome, Pricing and admin overview headers. Never inside a clinical workflow.
- `title` (20/28, 600) for page titles and sheet titles; `heading` (16/24, 600) for section and tab headings; `body` (15/22, 400) for reading text; `body-strong` (15/22, 600) for row primaries (model titles, calculator names); `label` (13/18, 500) for field labels, badges, tab labels; `caption` (12/16, 400) for metadata; `numeric` (15/22, 500, tabular) for any number column; `result` (36/40, 600, tabular) for the single calculator result; `mono` (13/18) for IDs and formulas.
- Line length ≤ 72 characters for clinical prose; sections, not walls of text.

## Spacing, radius, layout

- 4px base: `space-1` 4, `space-2` 8, `space-3` 12, `space-4` 16, `space-5` 20, `space-6` 24, `space-8` 32, `space-10` 40, `space-12` 48, `space-16` 64. Rows are 48 on mobile, 36 in Admin Web tables; inputs are 48 on mobile, 36–40 in Admin Web.
- Radii: `radius-sm` 6 (badges, chips, inline inputs), `radius-md` 10 (buttons, inputs, list rows, cards), `radius-lg` 14 (glass panels, sheets, drawers), `radius-xl` 20 (bottom-sheet top corners, mobile search overlay), `radius-full` for pills and avatars.
- Mobile shell (Flutter): glass top bar, 64 px glass bottom navigation with the raised search, content edge padding `space-4`, tablets use the same layout in a centred 640 column. Admin Web shell: navy console bar, 240 px sidebar, full-width content (section 09).

## Clinical Glass

Glass is a hierarchy device, used on exactly these surfaces: the global search field and search overlay, the top bar, the mobile bottom navigation, the quick-actions strip on Home, contextual floating controls (the sticky calculator result bar), bottom sheets and important overlays, and selected-state pills in navigation. In Flutter, glass is a `BackdropFilter` (sigma = blur ÷ 2) over the `glass` fill with the `glass-border` hairline, switched to the opaque `surface` fallback on low-capability devices. Nothing else is translucent.

- Fill `glass` (light `rgba(255,255,255,0.78)`, dark `rgba(18,32,46,0.74)`); `backdrop-filter: blur(var(--blur-glass)) saturate(1.2)` with `blur-glass` 16px (overlays may use `blur-strong` 24px); a 1px border in `glass-border`; shadow `shadow-glass`; radius `radius-lg`. Always provide the opaque fallback `surface` for `@supports not (backdrop-filter)`.
- Text on glass is `ink`/`ink-secondary` and must be checked against the busiest ground it can float over; the grounds in this system (`bg`, `surface`) keep every pair ≥ 4.5:1.
- Never: blurred color blobs behind glass, gradients, glow, transparency below 0.7, glass on a card, glass on a table.

## Brand mark

The DokTool logo exists as a vector master set (`assets/Logos/*.svg`, redrawn from the supplied artwork): horizontal and vertical lockups (light/dark), symbol, a 16–32px optical small mark, single-ink versions, wordmark, app icon, favicon and the trace. Use the horizontal lockup on sign-in and in the Admin Web sidebar, the symbol alone in the mobile header and console bar, the vertical lockup on Welcome and pricing, `-dark` files on dark grounds, the small mark below 32px. Never recolour, stretch, animate or set UI text in the logotype. The interface borrows from the mark: its deep blue is `brand`, its frosted bar is the model for Clinical Glass, its ECG line is the trace.

## Selected states and the trace

One treatment per level: navigation destinations use a `brand-soft` pill with `brand-strong` text; tabs use a 2px `brand` underline; in-page section position uses the **trace** — a small ECG blip (from the mark) beside the current label in `brand` (`dt-secnav`). No coloured left borders anywhere. The trace is also the page-level loading indicator (`dt-traceload`). It appears nowhere else.

## Iconography

Lucide icons, 1.75px stroke, 20px in navigation and rows, 16px inline with `label` text, 24px only in empty states. One family only; no filled variants mixed with outlined. Module marks: `search`, `file-text` (ordonnance), `badge-check` (certificat), `calculator`, `book` (bibliothèque), `star` (favoris), `history` (activité), `shield-check` (vérification), `lock` (verrouillé). Flutter uses the Lucide icon set through a Lucide Flutter package or the same SVG paths. Icons never replace a word on a warning or a status.

## Motion

Durations `duration-fast` 120ms (hover, toggles), `duration-base` 180ms (tabs, sheets, search expansion), `duration-slow` 260ms (page-level drawer). Easing `ease-out` for entrances, `ease-in-out` for movement; no bounce, no spring. Result values appear with a 120ms fade; copy/save/favorite confirmations are a toast plus an inline checkmark for 1.5s. Respect `prefers-reduced-motion`: cut all transitions to 0.

## States

Every interactive component defines default, hover, focus-visible (2px solid `focus` ring, 2px offset), active, disabled (opacity 0.5, no pointer), loading (inline spinner replacing the leading icon; skeleton `skeleton` for content areas) and error/success (semantic border + message with icon). Empty states are one icon, one sentence, one action. Offline is a mode, not a fault: a neutral `surface-sunken` bar with the wifi-off icon, the data version and the word `Hors ligne`; `warning` only when the cached pack is older than 30 days. Page-level loading is the trace (a single ECG blip drawn once along a hairline, ≤ 600ms); spinners exist only inside buttons.

## Accessibility

WCAG 2.2 AA minimum on both platforms: text ≥ 4.5:1, large text and meaningful marks ≥ 3:1, focus always visible, touch targets ≥ 44×44, VoiceOver/TalkBack labels on every control (value **and unit** on numeric fields), full keyboard operation of Admin Web, live announcement of calculator results, `role="alert"` on critical warnings, semantic tables with sticky headers, and never color as the only carrier of a clinical meaning.
