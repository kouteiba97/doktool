# 11 · Principal design critique, visual signature and design lock

The baseline (sections 00–10, tokens, components, screens) stands. This section records the audit of that baseline, the corrections that were applied to it, and the rules that lock it for implementation. Nothing here restarts anything.

## Audit findings (24 areas)

| # | Area | Verdict | Finding |
|---|---|---|---|
| 1 | Visual distinctiveness | Refine | The system is clean but its recognizability rested on the palette alone. Boxed `dt-section` panels on the drug page, six metric cards in a row and a shadowed centre disc in the bottom nav are the three places it drifted toward "template". Fixed by corrections C1, C2, C3. |
| 2 | Brand expression | Refine | The logo is placed correctly; nothing in the UI *derives* from it. The ECG trace in the mark is the one motif that can carry into the interface without decoration: it becomes the selected-section marker and the loading indicator (signature S2). |
| 3 | Color sophistication | Keep, one refinement | Palette is restrained and passes contrast. `teal` was doing two jobs — clinical result identity *and* "evidence strength" — which risks reading as a safety verdict in pregnancy/lactation. Evidence strength is now neutral (C4). No gradients, no new hues. |
| 4 | Clinical Glass | Keep | Usage list is already minimal and enforced by the `dt-glass` class. Verified: no glass on cards, tables or the paper preview. Do not add more. Slight refinement: the export bar under the paper preview is glass on `bg` with nothing behind it — allowed only because it floats over the scrolling paper on mobile; on desktop it is rendered as a plain `surface` row (C8). |
| 5 | Typography hierarchy | Refine | Inter alone can read generic. Distinctiveness comes from *numbers*: `result` and `numeric` styles carry the identity (tighter tracking, tabular figures, unit as a small suffix). Inter is self-hosted so offline devices render the same type (C6). No second display family. |
| 6 | Information density | Keep | Physician UI compact, admin dense; both measured in the renders. Desktop clinical reading column stays 760px inside a 1120px page. |
| 7 | Card overuse | Correct | Drug page: header, summary and each section were all boxed — three cards stacked. Now only *tables, lists and the result block* have frames; sections are separated by headings and hairlines (C1). Admin metrics: six cards become one ledger strip (C2). Home mobile recents/favorites stay as framed lists (a list frame is not a card). |
| 8 | Navigation hierarchy | Correct | Two selected-state treatments coexisted: a `brand-soft` pill in the sidebar and a coloured left border in the section nav — the left-border accent is a known template trope. Unified: pills for navigation, underline for tabs, the **trace marker** for in-page section position (C3, S3). |
| 9 | Search interaction | Keep | Grouped results, inline actions, keyboard map and the 150ms contract are the strongest part of the system. One refinement: the matched prefix is emphasised by weight and `brand` — keep, but never highlight-fill (already the rule). |
| 10 | Drug page hierarchy | Refine | Order is right (identity → quick summary → sections → evidence). With the boxes removed the quick summary reads as the first thing, which is the intent. The "Alerte majeure" line stays the only red on the page. |
| 11 | Pediatric dosing | Keep | Volume-per-dose first, max dose as its own labeled line, guard in words. Refinement: the mobile sticky result bar's warning word is now the same size as the label so it is never the smallest text on screen (C7). |
| 12 | Pregnancy / lactation | Correct | The evidence meter in `teal` could be read as "green = safe". Meter segments are now `ink-secondary` on `border`, the level word carries the meaning, and teal is reserved for results and trust (C4). |
| 13 | Prescription workflow | Keep | Inline row editing, pinned add-field, interaction bar, paper preview and "Copier le texte" everywhere. Refinement: row numbers in `mono` so they align with the paper (C9). |
| 14 | Admin visual language | Refine | Navy bar + dense tables is right. Metric cards were the one dashboard cliché; replaced by the ledger strip (C2). Charts stay bars/lines in the viz series only. |
| 15 | Revenue & Finance readability | Keep | Gross → refunds → fees → net revenue → expenses → net profit in one row, in that order, is the readability device. The ledger strip makes it read as an equation rather than six KPIs. *(v2.2: refunds removed from the chain — L40)* |
| 16 | Analytics visualization | Refine | Rules added: no pies/donuts, no dual axes, previous period always `viz-4` dashed, every chart titled with the product-activity term, never a real-world term (Lock L11). |
| 17 | Mobile ergonomics | Correct | The centre search disc at 52px with `shadow-md` read as a consumer-app FAB. Now 48px with `shadow-sm`; quick actions stay six on one glass strip; the greeting ("Bonsoir") is replaced by the practitioner line (name · specialty · status), which is what a doctor needs to confirm on open (C5). |
| 18 | Desktop density | Keep | 36–40px rows, split panes, shortcuts. Sidebar labels wrap ("Grossesse & allaitement") — shortened to "Grossesse · Allaitement" in the nav only (C10). |
| 19 | Language | Decided | DokTool is bilingual French/English via a centralized i18n catalogue (superseding decision, 23 Sept 2026); a doctor's uploaded reference PDF keeps its own language independently of the UI language. Still no Arabic and no RTL layout; logical CSS properties are kept for consistency and to leave the door open, unused, for a future RTL language. |
| 20 | Accessibility | Keep | All pairs ≥ 4.5:1 in both themes (re-verified after corrections), focus ring 2px `focus`, warnings icon + word. Added: `aria-live` on the sticky mobile result bar, `role="status"` on offline/data-version chips. |
| 21 | Motion | Keep | Three durations, no bounce. The loading indicator is the only new motion: a single ECG trace drawn once along a 1px line, ≤ 600ms, replaced by a static line under `prefers-reduced-motion` (S2). |
| 22 | Empty / loading / error | Refine | Empty state = one icon, one sentence, one action (kept). Loading: skeleton rows after 200ms (kept) plus the trace line for page-level loads instead of any spinner in content areas; spinners remain only inside buttons. |
| 23 | Offline states | Correct | Offline was a `warning` banner; being offline is a *mode*, not a fault. It is now a neutral `surface-sunken` bar with the wifi-off icon and the data version; `warning` is used only when the cached pack is older than 30 days, `critical` never (C11). |
| 24 | Cross-platform consistency | Keep | Same tokens, same component contracts; mobile sheets ↔ desktop popovers/modals share content components. Added the rule that any screen must be implementable from the same structured data on both platforms (Lock L15). |

## FINAL DESIGN CORRECTIONS

Applied to the baseline in this revision (tokens, `bundle.css`, previews):

- **C1 — Un-box the drug page.** Sections use headings and hairline dividers; frames stay only on tables, lists, the result block and the paper preview. Quick summary is a definition list directly under the header.
- **C2 — Metric ledger strip.** Admin metrics render as one framed row split by hairlines (`dt-metrics`); hero values (gross, net, profit) are emphasised by weight and a 2px `brand` top rule, not by separate cards.
- **C3 — One selected treatment per level.** Navigation = `brand-soft` pill; tabs = 2px `brand` underline; in-page section position = the trace marker (`dt-trace`, signature S3). The left-border accent is removed everywhere.
- **C4 — Evidence meter is neutral.** Segments `ink-secondary` on `border`; the level word carries the meaning; `teal` returns to results and trust only.
- **C5 — Mobile Home header.** Greeting removed; the practitioner line (name · specialty · verification badge) plus the mark. Search disc 48px, `shadow-sm`.
- **C6 — Self-hosted type.** `sans` = Inter (self-hosted woff2), system fallbacks; no Google Fonts request at runtime (offline-first).
- **C7 — Sticky mobile result bar.** Guard word at `label` size with its icon; value at 28px; `aria-live="polite"`.
- **C8 — Export bar.** Glass only when floating over scrolling content (mobile); a plain `surface` row on desktop.
- **C9 — Prescription row numbers in `mono`,** matching the rendered paper.
- **C10 — Sidebar labels never wrap:** "Grossesse · Allaitement".
- **C11 — Offline is a mode.** Neutral bar with version and date; `warning` only when the pack is older than 30 days.
- **C12 — Loading.** No spinner in content areas: skeleton rows after 200ms, the trace line for page-level loads; spinners only inside buttons.

Not changed, deliberately: palette hues, glass surfaces, spacing/radius scales, information architecture, all workflows.

## DOKTOOL VISUAL SIGNATURE

Five characteristics, each subtle, each derived from the product or the mark:

1. **S1 — The search field is the front door.** A single 48px Clinical Glass field (the `⌘K` key cap appears only on keyboard platforms — not in the V1 mobile app), always the first interactive element on Home and in the top bar, opening a grouped palette whose rows carry inline clinical actions (Pédiatrie · Grossesse · Allaitement · + Ordonnance). No other product places module actions on a search row; this is DokTool's "search → act" made visible.
2. **S2 — The trace.** A 1px hairline with one small ECG blip, drawn from the logo's line. It is used in exactly two places: as the loading indicator under the top bar (drawn once, ≤ 600ms, static line under reduced motion) and as the in-page section marker (S3). Never as decoration, never in illustrations, never animated on idle.
3. **S3 — Section position by trace, not by border.** In sticky section navs (drug page, calculator groups, admin review pages) the current section is marked by the trace blip beside the label with `brand` text — replacing the generic coloured left border.
4. **S4 — The result block.** One `teal-soft` block with no border, the value in `result` style (36/40, tabular, −0.02em) with the unit as a smaller suffix, the interpretation as an icon-and-word badge, and the max-dose or band line beneath in words. One per screen. It is the only place teal is a ground.
5. **S5 — Evidence footer on every clinical fact.** Sources · reviewer and date · version in `mono` · "Signaler une erreur", closed by a hairline, on every clinical section, with the neutral four-segment evidence meter above it where evidence strength matters. Trust as a repeated typographic pattern rather than a badge.

## DESIGN LOCK

Rules the implementing model must not violate. Any change to these requires a design decision recorded in this section, not a code comment.

- **L1 Tokens only.** No raw hex, px radius, shadow or blur in components; every value is a token from `tokens.json`. No new colors; no gradients anywhere (the logo file is the only gradient in the product).
- **L2 Glass surfaces are enumerated:** global search field and palette, top bar, mobile bottom nav, Home quick-actions strip, floating controls over scrolling content, bottom sheets and overlays, selected navigation pills. Nothing else may use `glass`, `backdrop-filter` or `glass-border`. Opaque `surface` fallback is mandatory.
- **L3 Frames are for tables, lists, the result block and the paper preview.** Sections, headers, summaries, metric groups and settings are separated by headings and hairlines, never boxed. No card grids of statistics anywhere.
- **L4 Brand blue is never a fill** except primary buttons, the app icon ground and the search disc. `brand-soft` is the only brand tint used as a ground.
- **L5 Warnings carry icon + word.** No color-only status; `critical` uses `role="alert"` and is never collapsible; pediatric max-dose and contraindications are never hidden behind a tap.
- **L6 Evidence is neutral and visible.** The evidence meter is never teal/green/red; pregnancy and lactation never show a safe/unsafe verdict; every clinical section ends with the evidence footer.
- **L7 One `result`-style number per screen,** on the `teal-soft` block; nothing else uses 36px or larger inside clinical workflows.
- **L8 Selected-state treatments:** pill for navigation, underline for tabs, trace for section position. No left-border accents, no filled tabs, no glowing states.
- **L9 Motion:** only `duration-fast/base/slow` with `ease-out`/`ease-in-out`; no bounce, spring, parallax or idle animation; the trace loader is the only drawn animation and it honours `prefers-reduced-motion`.
- **L10 Typography:** Inter (self-hosted), JetBrains Mono for IDs/versions/formulas; the wordmark is never used as text; `display` never appears inside a clinical workflow; numbers in columns always use tabular figures with the unit on the same line.
- **L11 Admin and analytics language:** product-activity terms only ("Consultations de modèles", "Calculs"); charts are bars and lines in the viz series order; no pies, donuts, dual axes or decorative sparklines; gross, net and profit are never one number.
- **L12 Sponsored content** *(future roadmap)* is rendered only with `SponsoredLabel` on `sponsored-soft`, below all clinical groups, never inside drug pages, results, prescriptions or evidence blocks; the `sponsored` hue is used nowhere else.
- **L13 Language (superseded 23 September 2026 — see L30 note below):** Bilingual French/English via a centralized catalogue (`messages.fr.ts` / `messages.en.ts`); no hardcoded strings inside components; a doctor's `preferredLanguage` drives every UI string, but an uploaded reference PDF's own content is never translated or re-rendered — the PDF's language is independent of the UI language. Numbers, dates and units follow the active UI language's format (French: decimal comma, narrow no-break space thousands separator; English: decimal point, comma thousands separator) — see `19-language-formats.md`. Still no Arabic, no RTL, no third language in V1.
- **L14 Accessibility floor:** 4.5:1 text, 3:1 marks and borders, visible 2px `focus` ring, 44px touch targets, full keyboard operation of search/tabs/tables/editors, `aria-live` on results and guards, `role="status"` on offline and version chips.
- **L15 Cross-platform** *(web half superseded by L33/L35 — V1 is mobile + Admin Web)*: every screen is built from the same structured data on web and mobile; components accept structured props, never pre-formatted strings for doses, units, statuses or severities; sheets on mobile and popovers/modals on desktop share the same content component.
- **L16 Offline is a mode** *(export clause retired; amended by L44)*: neutral bar with data version and date; cached entities show the version chip; `warning` only for packs older than 30 days; exports queue, never fail silently.
- **L17 Privacy** *(replaced by L42)*: patient fields are optional and not persisted by default; identity documents never render outside the restricted viewer; analytics are aggregate.
- **L18 No consumer patterns:** no greetings, streaks, confetti, badges of achievement, avatars larger than 32px, emoji, illustrations in empty states, or marketing typography inside the app.

## DESIGN LOCK v2 — additions (22 September 2026)

v1.1 rules L1–L18 remain in force (L13 is superseded by the bilingual FR/EN decision below — see L30). v2 adds:

- **L19 Fonts are self-hosted.** Inter and JetBrains Mono ship in the app (`fonts/`); no runtime request to a font CDN.
- **L20 Finance order is fixed** *(SUPERSEDED by L40 — no refund stage)*. Revenu brut → Remboursements → Frais → **Revenu net** → Charges d'exploitation → **Résultat net**; every number drills to ledger rows; ledger rows are immutable (corrections and refunds are new rows).
- **L21 Analytics vocabulary is fixed** (section 16). The words "prescription", "vente", "délivrance", "patients traités" never describe activity metrics.
- **L22 Commercial firewall** *(future roadmap)*. Sponsored content renders only through `SponsoredLabel` in the allowed placements (section 25, Appendix A); commercial roles never hold clinical grants; nothing commercial influences search ranking, synonyms, alternatives or evidence.
- **L23 No extrapolated doses.** Pediatric rules and calculators never compute outside validated input ranges; they show "Calcul non disponible" with the reason. No partial or stale result is ever displayed.
- **L24 Clinical overrides are explicit** *(RETIRED — V1 has no export)*. Blocking validation findings (contraindication, dose above maximum, allergy) require a reason to export; the reason is stored in the document history only.
- **L25 Evidence footer is never omitted** on clinical content; when a reference is being updated the footer says so.
- **L26 Admin is desktop-only** *(replaced by L36)* (≥ 1024 px) and visually distinct: navy console bar, dense tables, drawers; it never reuses the physician Home or glass search.
- **L27 Patient data is minimal** *(replaced by L42)*. Patient name and birth date are optional, not retained by default, never indexed, never in analytics.
- **L28 The logo files are the only gradients** and are used from the vector masters (`assets/Logos/*.svg`); the small mark is used at 16–32 px.
- **L29 Every screen implements its state list** from section 08 using the patterns of section 22. A screen without its loading, empty, error and offline states is not done.

## DESIGN LOCK v3 — product-scope correction (23 September 2026)

v1.1 and v2 rules L1–L29 remain in force except where this section explicitly supersedes them (L13, superseded by L30). v3 adds:

- **L30 Bilingual FR/EN supersedes L13.** DokTool ships French and English as first-class UI languages via one centralized catalogue per language; no screen, component or admin surface hardcodes a French (or English) string. A user's `preferredLanguage` drives the UI; an uploaded reference PDF's own content is never translated and is shown exactly as uploaded regardless of the viewer's UI language — the two are independent axes. Still no Arabic, no RTL, in this version.
- **L31 Ordonnances and Certificates are reference libraries, never generators.** Neither module ever renders a prescription/certificate editor, a medication-row builder, a patient field, a document-validation step, or an export/print/generate control — in any language, on any platform. The only doctor-facing workflow is `SEARCH → FIND REFERENCE MODEL → VIEW PDF → USE AS CLINICAL REFERENCE`; `SEARCH → EDIT → EXPORT` does not exist in this product. Every reference model view carries the non-dismissible reference notice (section 13). Content is created and changed only through Super Admin CRUD (section 13); there is no doctor-facing authoring surface and no floating action button in either module.
- **L32 The Drug Database is future-roadmap, not an active V1 module.** No screen, nav entry, search result, or empty "coming soon" placeholder for the Drug Database, Drug Profiles, Posology, Pediatric dosing, Pregnancy/Lactation, Interactions, Contraindications, Alternatives or Local products ships in V1. Global search never returns a drug result. The architecture keeps a `type` facet and a modular boundary (`25-future-roadmap.md`) so these can be added later without a redesign, but nothing in this list is built, wired into navigation, or exposed to a doctor in this version.

## DESIGN LOCK v4 — platform, access and business correction (25 September 2026)

L1–L32 stay in force except where superseded here.

- **L33 Mobile-only end-user platform.** DokTool V1's user application is one Flutter app for iOS and Android. No user-facing web app, web route or empty placeholder route ships in V1. *(Supersedes the web half of L15.)*
- **L34 Backend is authoritative.** Access, subscriptions, reference availability, calculator definitions and provenance, verification, analytics, audit and finance are decided by the backend. Clients render decisions; they never re-implement rules.
- **L35 One visual language, platform-neutral tokens.** `tokens.json` is the only source; Admin Web consumes CSS/Tailwind output, Flutter consumes the generated Dart theme. No platform may add colours, radii, blur or motion values of its own; no second visual system.
- **L36 Admin Web is a Next.js desktop application** (≥ 1024 px), separate from the mobile app, with separate authentication, mandatory 2FA and API-only data access. It is never built in Flutter; there is no admin mobile app. *(Replaces L26.)*
- **L37 Demo is an access context, never a professional type.** Demo uses the real product with real sample content, never writes to real user data, and never misrepresents the paid plan.
- **L38 Entitlements are centralised and visible.** Items an access context cannot open are shown locked with a reason and a path; nothing is hidden to create false simplicity; deferred modules are never shown at all. No UI component branches on professional type.
- **L39 Subscription UI is calm.** Neutral and info tones only, no red, no countdowns, no aggressive upsell. Before payment the user sees includes, not-included, duration, price, payment method, access level and that the payment is non-refundable.
- **L40 Finance has no refund stage.** Gross revenue → Payment fees → **Net revenue**; Operating expenses → **Net profit** in a separate block. Exceptional adjustments are an isolated, dual-approved administrative operation. *(Replaces L20.)*
- **L41 Calculator safety.** Typed inputs with explicit units; no result while validation fails or outside the validated range; every formula sourced, versioned, tested, reviewed by someone other than its author, and never generated or altered by AI; offline uses exactly the published version.
- **L42 No patient data.** DokTool collects no patient identifiers, no patient fields, no free text in analytics, and never syncs calculator inputs. *(Replaces L17 and L27.)*
- **L43 Storage.** Files live in Cloudflare R2 behind `StorageService`; PostgreSQL holds metadata and keys; no permanent public URL for any protected object; verification documents live in a separate private bucket readable only through the restricted viewer.
- **L44 Offline covers V1 content for every real account** (students included), always shows data version, cached/live state and update availability, and never includes deferred modules. *(Amends L16; the export clause is retired.)*
- **Retired:** L24 (export overrides — no export exists). **Scoped to Future Roadmap:** the pediatric/pregnancy clauses of L5 and L6, L12 and L22 (sponsored content).

---

## Appendix · Design QA record (former section 24)

Final systematic audit of DokTool Design System v2.0 (22 September 2026). Automated checks run on every file of the system (`tokens.json`, `bundle.css`, 95 previews, all READMEs); visual checks on 190 renders (every card in light and dark). **This audit predates the 23 September 2026 v2.1 product-scope correction and the 25 September 2026 v2.2 platform correction (mobile-only Flutter app, Admin Web, Demo, entitlements, no-refund finance, R2, calculator governance — sections 26–28)** (bilingual FR/EN, Reference Library replacing document generation, Drug Database deferred — see `01-product-architecture.md`, `25-future-roadmap.md`); it is kept as the historical record of what passed at the time. The automated suite re-ran after each correction — see `qa_result.json`; v2.2 adds checks that V1 cards use the V1 navigation, that no V1 card shows refund or drug-module vocabulary, and that the Dart token output matches `tokens.json`.

### Automated checks — all passing

| Check | Result |
|---|---|
| Token names unique across families | Pass |
| Colour aliases resolve (`trace`, `chart-grid`, `chart-axis`, `selection`) | Pass |
| Font files referenced by tokens exist (Inter 400/500/600, JetBrains Mono 400) | Pass |
| Contrast: 43 documented pairs × 2 themes (text 4.5:1, marks/borders/focus 3:1) | Pass — lowest `ink-muted`/`bg` light 4.57:1 |
| Text on Clinical Glass composited over `bg` and `surface`, both themes | Pass |
| Admin console bar separable from `bg` in dark | Pass (1.23:1 fill + hairline edge; was 1.02:1 in v1.1) |
| Stylesheet: no raw hex, no gradients, no `color-mix`, no physical left/right | Pass |
| `backdrop-filter` only inside the Glass primitive, with opaque fallback | Pass |
| Every preview has its card marker; every component has a README | Pass (95 cards) |
| Previews: no raw hex (outside the brand card), no gradients, no left-border accents | Pass |
| No Arabic script / RTL content (superseded — platform is now bilingual FR/EN, not French-only; still no Arabic or RTL) | Pass |
| Finance metric order identical in docs, cards and screens | Pass |
| Analytics vocabulary: no "prescriptions/ventes" as activity metrics | Pass |

### Issues found during v2 and fixed (not just listed)

| # | Issue | Fix |
|---|---|---|
| 1 | Dark console bar merged with page (v1.1 D1) | `navy` dark `#16293c` + `border` bottom edge |
| 2 | Teal described as module colour (v1.1 D2) | Teal reserved for results and trust; module icons in `brand` |
| 3 | Warning notes mentioned the offline banner (v1.1 D3) | Offline is neutral; warning only for packs > 30 days |
| 4 | Contradictory `opacity-placeholder` (v1.1 D5) | Removed |
| 5 | Glass on a non-floating desktop field (v1.1 D4) | Plain field on desktop; bulk bar documented as sticky floating |
| 6 | Logo only raster (v1.1 R1) | Vector master set + small optical mark + PNG exports |
| 7 | Trace colour hard-coded (v1.1 R2) | CSS mask + `trace` token; SVG with `currentColor` |
| 8 | Fonts from Google Fonts (v1.1 R3) | Self-hosted woff2 |
| 9 | Paper preview turned dark in dark theme | `paper`, `paper-ink`, `paper-rule` tokens identical in both themes |
| 10 | Watermark selector never applied | Fixed (`.dt-paper.wm`) |
| 11 | Finance order differed between screen and docs (charges before net revenue) | One order everywhere: brut → remboursements → frais → net → charges → résultat |
| 12 | Clinical example values: capped ibuprofen case used a wrong adult cap; 2nd-trimester conduct too permissive | Corrected to 400 mg/prise cap (9 ans, 48 kg) and "Éviter après 20 SA" |
| 13 | Access level shown in the teal result block (teal misuse) | Neutral well with mono value |
| 14 | Settings/Profile/Plans highlighted "Accueil" in the sidebar | No destination highlighted for account pages |
| 15 | Combobox/multi-select matched prefix split from the word by flex gap | Label wrapped in one span |
| 16 | Segmented controls stretched full width inside fields | `align-self:flex-start` unless `block` |
| 17 | Select values and table numbers wrapping | `nowrap` + ellipsis on select values; numeric/mono cells never wrap |
| 18 | Search header "Annuler" clipped on 390px | Field `min-width:0`, compact cancel |
| 19 | Role rows lacked an explicit selection indicator | Radio indicator added (selection not by colour alone) |
| 20 | Language scope (Arabic/RTL introduced in draft v2) | Removed: French-only decision (section 19, lock L13) — **since superseded**: the 23 September 2026 correction made the platform bilingual FR/EN while keeping this Arabic/RTL exclusion (section 19, lock L30) |

### Consistency review

| Area | Verdict |
|---|---|
| Selected states | One per level: pill (navigation), underline (tabs), trace (section position), raised pill (segmented) |
| Warning states | Icon + word everywhere; critical `role="alert"`; precedence defined (section 22) |
| Spacing | `space-*` scale only; card paddings 16/20; section rhythm 16 with hairlines |
| Typography | 10 styles; one `result` number per screen; `display` only on public/pricing/admin headers |
| Glass | Top bar, bottom nav, search field/palette, Home quick actions, floating bars over scrolling content, sheets, bulk bar |
| Mobile behaviour | Sheets for pickers/actions/confirmations; sticky glass result bars; 48px inputs |
| Permissions | Admin nav rendered from grants (sub-admin render in ScreenClinicalReview); separation-of-duties table (section 03) |
| Missing states | Every screen in section 08 carries its state list; patterns in section 22 |
| Navigation paths | Search → any entity in ≤ 2 taps; every screen reachable from the sidebar/bottom nav or a named entry point (section 08) |

### Known limitations (deliberate, documented)

- Screens marked "pattern of …" in section 08 (sign-in, OTP, checkout, template editors, security) are specified by components and a reference screen rather than drawn one by one.
- The vector logo is a faithful redraw of the supplied artwork; approve it against the original before store submission.
- Clinical values in renders are realistic examples for layout; the clinical team must validate all content before publication (calculator governance, section 28).
