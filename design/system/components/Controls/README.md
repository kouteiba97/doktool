# Controls (Checkbox · Radio · Switch)
Binary and exclusive choices. Checkbox for independent options in forms, radio for 2–5 exclusive options that need description, switch for settings that apply immediately.

## Anatomy
18px box (`radius` 4px checkbox, round radio) with a 1.5px `border-strong` outline; label to the inline-end, 14/20. Switch: 36×20 track, 16px knob.

## Variants
checkbox (checked · unchecked · mixed) · radio · switch. Description line under the label uses `caption`.

## Sizes
18px control; 44px row on touch, 32px on desktop.

## States
default · hover · focus-visible · checked · mixed · disabled (with reason) · error (group-level message).

## Interaction
Click on the whole row toggles. `Space` toggles; arrow keys move within a radio group. Switches save immediately and show a toast only if the save fails.

## Accessibility
Native inputs. Groups use `fieldset`/`legend`. Switch uses `role=switch` + `aria-checked`. Hit area ≥ 44px tall on touch.

## Responsive
Same on all breakpoints; row height 44px on touch.


## Tokens
`brand`, `on-brand`, `border-strong`, `surface`, `focus`, `critical`.

## Consumer provides
`checked`, `onChange`, `label`, `description?`, `disabled?`, `disabledReason?`.

## Do not
Use a switch inside a form that has a Save button. Use a checkbox for a destructive confirmation (use a typed confirmation or a Dialog).
