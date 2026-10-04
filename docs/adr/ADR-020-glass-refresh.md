# ADR-020 · Glass visual refresh of the app (Phase 20)

**Status:** Accepted · 4 October 2026
**Context:** Product Owner decision of 4 October 2026 with a reference image: keep DokTool's colours and design, take the reference's colour shades and, above all, its glassier effects. The design system already defines Clinical Glass (`glass`, `glass-border`, `blur-glass`, `blur-strong`, `shadow-glass`); this refresh extends it. Section 20 (accessibility) and Lock L35 (tokens only) still apply.

## Decision

1. **Tokens first.** New tokens in `design/system/tokens.json`, generated to Flutter, CSS, Tailwind and TS like every other token; no colour, radius, blur or duration literal in code (CI gate):
   - hero gradient `hero-start` → `hero-mid` → `hero-end`: the brand at its deepest, lightened, then the page ground (light `#0a5c78 → #2b7a96 → #f4f7f9`);
   - `on-hero`, `on-hero-muted`: text on the deep part of the hero only — the middle stop keeps white text at ≥ 4.5:1;
   - `glass-on-hero`, `glass-on-hero-border`: white frost on the hero (icon buttons, the identity disc, the demo bar);
   - `glass-tint`, `glass-highlight`: brand-tinted frosted tracks and the light catching a glass edge;
   - `radius-xxl` (28 px) and `shadow-float` (soft, brand-tinted, never a glow) for floating glass.

2. **Where it shows (app).**
   - **Home:** the hero gradient behind the status bar with the frosted demo bar, the identity in a frosted disc, a frosted bell and the frosted search field; the four shortcuts in a white card lifted over the hero's pale end; « Commencer », recents and favorites in lifted white cards.
   - **Bottom navigation:** a floating pill of frosted glass (`blur-strong`, `shadow-float`); the active tab sits in a tinted disc; the search disc keeps its brand fill.
   - **Library:** the four sections become a scrolling row of pill chips with icons (the selected one filled) — the segmented control could not show four labels whole; the rows of a section sit in one lifted card.
   - **Controls and cards:** segmented controls on a tinted glass track with a white lifted pill; selected search filters are filled pills; settings and profile sections are lifted white cards (`radius-xl`, `shadow-glass`).

3. **Every screen, not just Home** (extension, 5 October 2026: the Product Owner noticed screens left in the old style).
   - **Flow pages (`DtPage`, 21 screens):**
     - The status bar and toolbar sit on the deep hero.
     - The back button is frosted (`DtGlassIconButton`), and trailing actions such as « Plus tard » are white.
     - The eyebrow, title and intro are white on the hero and scroll under the toolbar, fading into the page.
     - `DtSection` blocks are lifted white cards.
   - **Screens with their own top bar** use `DtHeroAppBar`, with the same hero, a white title (two lines or a badge allowed) and white actions; the favourite star has an `onHero` variant. These are: Settings, Library, Activity and favourites, Notifications, calculator, reference viewer, pregnancy profile.
   - **Search:** the field is a white pill on the hero (`DtHeroBand`).
   - **Welcome:** a full hero with the light lockup, and the three choices in a lifted card.
   - **Profile:** the identity sits on the hero (frosted avatar ring, glass « Modifier »), and the menu is in lifted cards.
   - **Lists** (search results, favourites, history by day, notifications) are grouped in lifted cards (`DtCardGroup`), like the library sections. The verification, plan, subscription and calculator information cards are lifted white cards too.
   - **Bottom sheets** open on the root navigator, so they cover the floating tab bar instead of sliding under it.
   - **Accessibility:** the checks (44 pt targets, labels, contrast in both themes, 200 % text) pass on every screen they cover.

4. **Unchanged.** The palette (brand, teal, semantic colours), typography, spacing, iconography, the clinical rules (no colour-only meaning, neutral evidence, calm subscription UI), touch targets (44 pt) and contrast (WCAG 2.2 AA, checked by `accessibility_test.dart` in both themes). Admin Web keeps its dense console look; the new tokens are available to it but not applied.

## Consequences

- Hero text must stay on the deep part of the gradient; content placed lower uses white cards.
- Glass needs something behind it to read as glass: the floating bar and frosted controls sit over content or the hero, never over a flat white area.
