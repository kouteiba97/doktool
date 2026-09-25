# 20 · Accessibility and motion rules

Target: WCAG 2.2 AA on the Flutter app (iOS VoiceOver, Android TalkBack) and Admin Web; AA+ for clinical results and warnings.

## Contrast (verified by script on every token change)

All text tokens ≥ 4.5:1 on the grounds their usage note names, in both themes; large text, focus ring, control borders and meaningful icons ≥ 3:1. Current results: every documented text pair passes in light and dark (lowest: `ink-muted` on `bg`, light, 4.57:1 — do not lighten `ink-muted` or `bg`). The v1.1 dark-theme console bar defect is fixed (`navy` dark `#16293c` + hairline edge).

## Colour-independent meaning

Warnings, errors, severities, evidence levels, verification states, subscription states and financial statuses always carry an icon **and** a word. Charts pair colour with legend order, labels and a hidden data table. Diff views tag added/removed rows in text.

## Keyboard (Admin Web; external keyboards on mobile)

- Everything operable by keyboard; visible 2px `focus` ring with 2px offset on every focusable element; no focus traps except modal dialogs/sheets (which trap and restore).
- Admin Web global: `/` admin search, `⌘1…9` sidebar, `[` collapse sidebar, `?` shortcut sheet, `Esc` close drawer/dialog; tables: arrows, `Enter` open drawer, `Space` select row.
- Search, menus, selects, tabs, date picker and tables follow the ARIA Authoring Practices patterns (see each component).
- Skip link "Aller au contenu" on every page.

## Screen readers

- **Flutter:** every interactive widget has a `Semantics` label; numeric fields announce value **and unit**; the calculator result is a live region (`SemanticsService.announce` on change); locked items announce "verrouillé" / "locked" and the reason; the reference notice is read before the PDF; PDF pages announce "page n sur N". Text scaling to 200 % without truncating clinical values.
- **Admin Web:**

- Landmarks: `banner` (top bar), `navigation` (sidebar/bottom nav), `main`, `complementary` (side panels), `contentinfo` (none in app).
- One `h1` per page; sections `h2`; tab panels labelled.
- Live regions: calculator results `aria-live="polite"`; critical validation `role="alert"`; offline/sync/version chips `role="status"` announced once per change.
- Icon-only buttons have `aria-label`; tooltips never replace labels; disabled controls use `aria-disabled` with the reason reachable.
- Numbers read with units ("7,7 millilitres") via `aria-label` on result values.

## Touch and motor

Targets ≥ 44×44 px on touch (`size-touch-min`); 8 px minimum spacing between adjacent targets; no gesture is the only way (sheets have a close button; swipe actions duplicated in `⋯`); long-press has a visible `⋯` alternative.

## Text and zoom

Supports 200 % zoom and OS text scaling up to 1.5× without loss (layouts wrap; tables scroll horizontally with the first column sticky); line length ≤ 72 characters for clinical prose; no text in images (the logo excepted).

## Motion and time

Respects `prefers-reduced-motion` (all transitions off, trace static). No time limits except OTP (with resend) and temporary document access (admin, visible countdown). Toasts pause on hover/focus and never carry the only path to an action.

## Forms

Labels always visible (no placeholder-only fields); required marked with `*` and announced; errors inline, linked with `aria-describedby`, summarised at the top on submit with links to fields; expected ranges stated.

## Motion rules (former section 21)

Motion communicates a change of state. Speed beats entertainment: nothing waits on an animation.

| Moment | Motion | Duration / easing | Reduced motion |
|---|---|---|---|
| Screen transition (mobile push) | Platform push (iOS slide / Android fade-through) at `duration-base`; the trace draws under the top bar only if loading takes > 200 ms | trace ≤ 600 ms, `ease-out` | Static line |
| Page transition (mobile push) | Platform native push | native | Native reduced |
| Loading trace | One ECG blip travels the 1 px line once | 600 ms `ease-out` | Static blip at 40 % |
| Skeleton → content | Content fades in | `duration-fast` 120 ms | Instant |
| Result reveal (calculator, dose) | Value fades in; no counting animation | 120 ms | Instant |
| Guard appears (max dose, contraindication) | Appears instantly (never animated in, never delayed) | 0 | 0 |
| Drawer | Slides from inline-end | `duration-slow` 260 ms `ease-out`; closes 180 ms | Instant |
| Bottom sheet | Rises from bottom; drag follows finger | `duration-base` 180 ms `ease-out` | Instant |
| Modal / dialog | Fade + 4 px rise | 180 ms `ease-out` | Instant |
| Command palette | Fade + scale 0.98 → 1 | 120 ms | Instant |
| Toast | Fade + 8 px rise; exit fade | 180 ms / 120 ms | Instant |
| Tab indicator | Slides between tabs | 180 ms `ease-in-out` | Instant |
| Sidebar collapse | Width change | 180 ms `ease-in-out` | Instant |
| Sync | Spinner inside the OfflineBar only | continuous while syncing | Static icon |
| Success (save, copy, favorite) | Toast + inline check for 1.5 s | 120 ms | Instant |
| Error | Field border and message appear; no shake | 0 | 0 |
| Favourite | Star fills | 120 ms | Instant |

Never: bounce, spring overshoot, parallax, idle or looping decorative animation, animated numbers, skeleton shimmer, confetti, animated logo.
