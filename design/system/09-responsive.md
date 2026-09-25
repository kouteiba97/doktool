# 09 · Layout system — mobile and Admin Web

**v2.2:** V1 has two layout contexts, not a responsive continuum across one app. The Flutter app is mobile-only (phones, and tablets using the phone layout in a centred column); Admin Web is desktop-only. The v2.1 tablet rail and desktop physician layouts are Future Web reference (section 25). Offline rules: section 18.

## Mobile (Flutter)

| Aspect | Rule |
|---|---|
| Width classes | compact < 600 (phones) · medium ≥ 600 (tablets): same layout, content column max 640 dp, centred; bottom nav stays |
| Grid | 4 columns, 16 dp gutters and side margins; spacing only from the `space-*` scale |
| Density | rows 48 dp (list rows 56–64 with two lines), inputs 48 dp, touch targets ≥ 44 dp, one visible action per row |
| Navigation | glass bottom nav (Accueil · Recherche · Bibliothèque · Profil); push for destinations; back always available |
| Search | full-screen overlay; row actions in a bottom sheet |
| Reference viewer | full screen; fit width, pinch zoom, page indicator; notice pinned under the top bar |
| Calculator | one column; sticky glass result bar at the bottom; full result block below the inputs |
| Pickers, menus, filters, confirmations | bottom sheets with stacked actions |
| Text scaling | layouts hold up to 200 % text scale; rows grow, never truncate clinical values |
| Orientation | portrait-first; landscape supported for the PDF viewer only |
| Safe areas | respected on every edge; the bottom nav sits above the home indicator |

## Admin Web (Next.js)

| Token | Range | Shell | Density |
|---|---|---|---|
| — | < 1024 | not supported: "Console disponible sur ordinateur" with pending counts | — |
| `bp-desktop` | 1024–1439 | console bar + 240 px sidebar + full-width content | rows 36, inputs 36–40, drawers 480 |
| `bp-wide` | ≥ 1440 | same | drawers 560, wider tables |

Admin grid: 12 columns inside the content area, 24 px gutters. Pointer rule: `pointer: coarse` still gets 44 px targets.

## Per workflow

| Workflow | Mobile | Admin Web |
|---|---|---|
| Navigation | Bottom nav + push | Sidebar + console bar |
| Search | Overlay, grouped results | Admin search (users, transactions, content by ID) |
| Lists | Stacked rows (2 lines + `⋯`) | Full `DataTable` with bulk bar |
| Forms | One column, 48 dp inputs, keyboard-appropriate | Drawers, 2 columns when ≥ 800 px wide |
| Detail | Push screen | Right drawer or full-width detail page |
| Confirmations | Bottom sheet | Dialog |
| Charts | None in the mobile app | Bars and lines only |
