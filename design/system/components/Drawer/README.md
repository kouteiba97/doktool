# Drawer
Admin Web side panel for inspecting or acting on one record without leaving a list: user access, verification case, reference model upload/edit, transaction.

## Anatomy
480 px (560 at ≥ 1440) at the inline-end, `surface`, `shadow-md`. Header: title (IDs in mono), caption, status badge, close. Optional tabs. Scrolling body. Sticky footer: secondary at start, primary at end.

## Variants
`inspect` · `review` (decision + reason) · `edit` (form, unsaved-changes guard).

## Sizes
—

## States
loading · loaded · error · restricted tab · submitting · dirty.

## Interaction
Opens from a row; `Esc` closes; ↑↓ on the table moves to the previous/next record. Layout: the list column is `minmax(0, 1fr)` so wide tables never push the drawer off-screen.

## Accessibility
Dialog semantics (non-modal for inspect, modal for edit/review); focus to title, back to row on close.

## Platforms (v2.2)
Admin Web only. The mobile app uses bottom sheets.

## Tokens
`surface`, `border`, `shadow-md`, `scrim`, `size-drawer`, `duration-slow`, `z-drawer`.

## Consumer provides
`title`, `id?`, `status?`, `tabs?`, `children`, `footer`, `mode`, `dirty?`.

## Don't
Nest drawers; put a full editor in a drawer; a refund button (exceptional adjustments live in the overflow menu, Super Admin only).
