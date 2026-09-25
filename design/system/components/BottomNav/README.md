# BottomNav
The Flutter app's primary navigation: Accueil · Recherche (raised brand disc) · Bibliothèque · Profil on a Clinical Glass bar. There is no Documents or Outils tab in V1.

## Anatomy
64 dp bar, `glass` fill + `glass-border` top hairline + `BackdropFilter` (opaque `surface` fallback). Three labelled destinations and the raised 48 dp search disc in the second slot. Active destination: `brand` icon and label.

## Variants
`default` · `demo` (same bar; the demo bar sits under the top bar, not here) · `hidden` (while a bottom sheet is open or the keyboard is up).

## Sizes
64 dp high + safe area.

## States
default · active · focus · with attention dot on Profil (verification needs action).

## Interaction
Tap switches destination and keeps each tab's stack; re-tapping the active tab pops to its root; the disc opens the search overlay.

## Accessibility
Semantics: navigation with labelled items, selected state announced; labels always visible; 44 dp minimum targets.

## Platforms (v2.2)
Flutter only (mobile). Admin Web uses the console sidebar. The five-tab pre-V1 bar is retired.

## Tokens
`glass`, `glass-border`, `blur-glass`, `brand`, `on-brand`, `ink-secondary`, `size-bottomnav`, `z-bar`.

## Consumer provides
`current`, `attention?` (Profil).

## Don't
Add a fourth destination or a Documents tab; use the disc for anything but search; hide labels.
