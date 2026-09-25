# Tooltip
A one-line explanation for an icon, a truncated value, a disabled control or an evidence level. Never the only place a clinical fact lives.

## Anatomy
`navy` bubble, `on-navy` 12/16 text, 6×10 padding, `radius-sm`, 5px arrow toward the anchor. Optional key cap.

## Variants
label (icon buttons) · description (meters, abbreviations) · disabled-reason.

## Sizes
One size.

## States
hidden · shown (after 400ms hover or immediately on focus) · dismissed (`Esc`).

## Interaction
Shows on hover (400ms delay) and on keyboard focus; hides on blur, `Esc` or pointer leave (100ms grace). On touch, long-press shows it; tap never does.

## Accessibility
`role=tooltip`, anchor has `aria-describedby`. Icon-only buttons still carry `aria-label`; the tooltip does not replace it. Disabled controls use `aria-disabled` (not `disabled`) so they stay focusable and the reason is announced.

## Responsive
Max width 240px; on mobile, prefer inline helper text over tooltips.


## Tokens
`navy`, `on-navy`, `shadow-sm`, `radius-sm`, `z-overlay`.

## Consumer provides
`content`, `placement`, `shortcut?`.

## Do not
Put dose values, warnings or links in a tooltip. Show a tooltip on a control that already has a visible label that says the same thing.
