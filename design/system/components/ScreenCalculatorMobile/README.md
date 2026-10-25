# ScreenCalculatorMobile
The calculator loop: **select tool → enter validated inputs → calculate → review result + source → done** (section 28).

- Inputs are typed: numeric fields use the decimal keypad and accept `,` or `.`; every number sits beside its unit, and quantities with several units carry a unit selector **inside** the field (`[ 70 ] [ kg ▾ ]`) — never a free-text unit. Finite choices are segmented controls when short (≤ 4, each on one line); long answers or more than four are full-width rows with the whole text (ADR-026). Each label says *requis* or *optionnel* in words.
- Validation runs on field commit (next/done, focus change, or 400 ms idle), never on each keystroke. The result appears only when every required input is valid and inside the validated range; it is the largest element on screen (`result` style on `teal-soft`).
- Below the result: the formula in mono with the entered values substituted, the source citation, the reviewer and date, and a link to the source sheet with limitations and validated ranges. The version chip (`v2`) names the exact published version used — offline too.
- Sticky glass result bar: value + unit, *Copier* (copies value, unit, calculator name and version), *Réinitialiser*. Last inputs are remembered on the device only.

Other states: ScreenCalculatorStates.
