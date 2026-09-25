# Select
Choose one value from a known list. Two forms: a native select for short static lists (≤ 12 options) and a searchable combobox for long or remote lists (institutions, drugs, specialties).

## Anatomy
Label (`label`) · well (`dt-input`, 40px desktop / 48px mobile) · value or placeholder · trailing chevron (`ink-muted`) · helper/error line. Listbox (`dt-listbox`, `shadow-md`, max 320px tall) with optional group headers (`dt-optgroup`), options with right-aligned meta, a check on the selected option, and an optional escape row ("absent de la liste").

## Variants
`native` (OS picker, mobile default) · `combobox` (typeahead, highlights the matched prefix in bold, async results with a skeleton row) · `with-create` (last row adds a free value, used for institutions only).

## Sizes
40px desktop, 48px mobile; listbox rows 36px desktop, 44px touch.

## States
default · hover · focus (2px `focus` ring) · open · option active (`surface-raised`) · option selected (`brand-strong` + check) · option disabled (with reason in meta) · error (2px `critical` + message) · disabled (with reason in helper) · loading (skeleton options after 200ms) · empty ("Aucun résultat" + escape row).

## Interaction
Click or `Enter`/`Space`/`↓` opens. `↑↓` moves, `Home/End` jump, typing filters (combobox) or jumps (native), `Enter` selects and closes, `Esc` closes without change, `Tab` selects the active option and moves on.

## Accessibility
Native `<select>` whenever possible. Combobox follows the ARIA 1.2 combobox pattern: `role=combobox`, `aria-expanded`, `aria-controls`, `aria-activedescendant`; options `role=option` with `aria-selected`; disabled options `aria-disabled` and still announced. Error text linked by `aria-describedby`.

## Responsive
Mobile: combobox opens a full-height bottom sheet with its own search field; native selects use the OS picker. Desktop: popover under the field, same width, flips above near the viewport bottom.


## Tokens
`surface`, `border-strong`, `focus`, `critical`, `surface-raised`, `brand-strong`, `ink-muted`, `shadow-md`, `radius-md`, `radius-sm`, `size-control`, `size-control-lg`.

## Consumer provides
`label`, `options[{value, label, meta?, group?, disabled?, disabledReason?}]`, `value`, `onChange`, `required`, `error`, `helper`, `searchable`, `loadOptions?`, `allowCreate?`.

## Do not
Use a select for 2–4 options (use Segmented). Put actions inside a select (use Menu). Hide a disabled option without saying why.
