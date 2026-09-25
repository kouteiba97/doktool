# @doktool/calculator-vectors

Conformance vectors for the two calculator engines (ADR-003, ADR-012):

- the TypeScript engine in `apps/api`, which is authoritative;
- the Dart engine in `apps/mobile`, which runs offline.

CI fails when either engine disagrees with a vector.

**These are not clinical calculators.** The formulas are abstract on purpose (`a + b`, a length in centimetres), so that no one mistakes a test fixture for medical content. Real calculators are data entered by an admin from a cited source, reviewed by someone else, and tested with their own cases (section 28).

## File format

Each `vectors/*.json` file is a suite:

```json
{
  "suite": "operators",
  "groups": [
    {
      "name": "arithmetic",
      "description": "What the group proves",
      "definition": { "schemaVersion": 1, "inputs": [], "formula": {} },
      "cases": [
        {
          "name": "positive operands",
          "inputs": { "a": { "value": 6 }, "b": { "value": 3 } },
          "expected": {
            "outcome": "RESULT",
            "value": 32,
            "tolerance": 0,
            "band": "CODE",
            "issues": ["CODE:inputOrRuleId"],
            "notes": ["inputKey"],
            "conversions": [{ "input": "x", "from": { "value": 150, "unit": "cm" }, "to": { "value": 1.5, "unit": "m" } }]
          }
        }
      ]
    }
  ]
}
```

- **`definition`** follows the calculator definition schema, version 1 (ADR-012).
- **`expected.outcome`** is `RESULT`, `INVALID` or `OUT_OF_VALIDATED_RANGE`.
- **`value` and `tolerance`** apply to `RESULT` only. A missing tolerance means an exact match.
- **`issues`** are compared as a set of `CODE` or `CODE:subject`. The subject is the input key, or the rule id for `CROSS_FIELD`.
- **`notes`** are the input keys that carry a plausibility note.
- **`conversions`** are compared with tolerance `1e-12`.
- **Missing fields** (`band`, `issues`, `notes`, `conversions`) are not checked, except that `issues` are always empty for `RESULT`.

## Semantics both engines must share

- **Numbers:** IEEE-754 doubles.
- **Rounding (`round`):** rounds half away from zero, applied to the shortest round-trip decimal representation. So `1.005` at 2 digits gives `1.01`, and `-2.5` at 0 digits gives `-3`.
- **Order of checks:** presence and type → unit conversion → hard range → cross-field rules → validated range → plausibility notes → formula. The first failing stage decides the outcome, and every issue of that stage is reported.
- **Bands:** a band covers `from ≤ value < to`, and the first matching band wins.
- **Non-finite results:** a result of `NaN` or `±∞` is `INVALID` with `NON_FINITE_RESULT`.
