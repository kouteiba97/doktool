# BottomSheet
Mobile overlay for row actions, pickers (units, specialties), confirmations and locked explanations.

## Anatomy
Glass-strong sheet (`radius-xl` top corners), grab handle, header (title, caption, close), content (list or form), stacked actions at the bottom; `scrim` behind.

## Variants
`actions` · `picker` · `confirm` · `locked` (reason + one calm action).

## Sizes
—

## States
opening · open · dragging · dismissing.

## Interaction
Swipe down or tap the scrim to close (not for destructive confirms). Focus is trapped and restored.

## Accessibility
Modal dialog semantics; title announced; 44 dp rows.

## Platforms (v2.2)
Flutter `showModalBottomSheet` with `BackdropFilter`; Admin Web uses popovers/dialogs instead.

## Tokens
`glass`, `glass-border`, `blur-strong`, `scrim`, `radius-xl`, `duration-base`, `z-drawer`.

## Consumer provides
`title`, `caption?`, `children`, `actions?`, `dismissible`.

## Don't
Stack sheets; put a full form longer than one screen in a sheet (push a screen).
