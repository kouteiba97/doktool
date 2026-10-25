# ADR-026 · Calculator answers shown whole: choice rows

**Status:** Accepted · 25 October 2026 (Product Owner)

**Context:** Section 28 put finite choices in a segmented control (up to 4 options) or a picker (more than 4). The segmented control shows each answer on one line and cuts it with « … ». That is fine for « Oui / Non », but clinical scores phrase their answers as sentences: « 1 - Supérieur ou égal à 60 ans. » Shown side by side on a phone, they became « 1 - Supéri… », so a person could not read what they were choosing. Of the 147 calculators prepared from Medicalcul, 118 are made of such questions. The picker for longer lists hid the answers behind an extra tap.

## Decision

1. **Short answers stay a segmented control.** A choice keeps the segmented control only when it has at most four answers and each one fits on one line. Fitting is measured on the device with the person's text size (`segmentsFit`), never guessed from a character count.
2. **Everything else is a list of rows.** Long answers, or more than four, use `DtChoiceList`:
   - full-width rows, the whole answer visible (wrapping, never ellipsised);
   - one tap to choose, a 44 px minimum height;
   - the choice shown by an icon and bold text as well as its colour;
   - a radio group for screen readers (each row checked or not).
3. **No picker for calculator choices.** Rows replace it: a score's answers are read and compared at a glance.
4. **Yes/No questions are unchanged.** They keep the two-option segmented control.

## Consequences

- `apps/mobile/lib/src/ui/choice_list.dart` holds `DtChoiceList` and `segmentsFit`, and `calculator_screen.dart` chooses between the two controls.
- Section 28 and `ScreenCalculatorMobile/README.md` were updated.
- Tests in `test/choice_list_test.dart` check:
  - whole text and one-tap choice;
  - the switch at 200 % text size;
  - radio-group semantics;
  - touch and contrast guidelines in light and dark.
- A long questionnaire takes more vertical space. Accepted: reading every answer matters more than scrolling.
