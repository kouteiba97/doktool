// Phase 12: a published version is used only after its reference cases pass on the device.
import 'package:doktool/src/features/calculators/engine/definition.dart';
import 'package:doktool/src/features/calculators/engine/evaluate.dart';
import 'package:doktool/src/features/calculators/engine/formula_text.dart';
import 'package:doktool/src/features/calculators/engine/self_test.dart';
import 'package:flutter_test/flutter_test.dart';

/// Non-clinical fixture: the area of a square, with a centimetre conversion.
final _definition = CalculatorDefinition.parse({
  'schemaVersion': 1,
  'inputs': [
    {
      'kind': 'NUMBER',
      'key': 'side',
      'label': {'fr': 'Côté', 'en': 'Side'},
      'required': true,
      'quantity': 'LENGTH',
      'canonicalUnit': 'm',
      'units': [
        {'code': 'cm', 'factorToCanonical': 0.01, 'source': 'SI'},
      ],
      'validatedRange': {'min': 0.1, 'max': 100},
    },
  ],
  'formula': {
    'op': 'mul',
    'args': [
      {'input': 'side'},
      {'input': 'side'},
    ],
  },
  'result': {
    'unit': 'm²',
    'decimals': 2,
    'label': {'fr': 'Surface', 'en': 'Area'},
  },
  'limitations': {'fr': 'Fixture de test.', 'en': 'Test fixture.'},
});

void main() {
  test('applies the API schema defaults', () {
    expect(_definition.crossFieldRules, isEmpty);
    expect(_definition.interpretation, isEmpty);
    expect(_definition.inputs.single.decimals, 0);
    expect(_definition.inputs.single.unitCodes, ['m', 'cm']);
  });

  test('accepts a version whose reference cases pass', () {
    expect(
      passesReferenceCases(_definition, [
        ReferenceCase(
          inputs: inputsFromJson({
            'side': {'value': 200, 'unit': 'cm'},
          }),
          outcome: Outcome.result,
          value: 4,
        ),
        ReferenceCase(
          inputs: inputsFromJson({
            'side': {'value': 500},
          }),
          outcome: Outcome.outOfValidatedRange,
        ),
      ]),
      isTrue,
    );
  });

  test('refuses a version whose reference cases disagree with this engine', () {
    expect(
      passesReferenceCases(_definition, [
        ReferenceCase(
          inputs: inputsFromJson({
            'side': {'value': 2},
          }),
          outcome: Outcome.result,
          value: 5,
        ),
      ]),
      isFalse,
    );
    expect(
      passesReferenceCases(_definition, [
        ReferenceCase(
          inputs: inputsFromJson({
            'side': {'value': 2},
          }),
          outcome: Outcome.invalid,
        ),
      ]),
      isFalse,
    );
  });

  test('refuses definitions it does not understand', () {
    expect(() => CalculatorDefinition.parse({'schemaVersion': 2}), throwsA(isA<DefinitionFormatException>()));
    expect(() => Expr.parse({'op': 'cbrt', 'args': <Object>[]}, 'formula'), throwsA(isA<DefinitionFormatException>()));
  });

  test('writes the formula with the values substituted', () {
    expect(formulaText(_definition.formula, values: {'side': '1,5'}, labelOf: (key) => key), '(1,5 × 1,5)');
    expect(formulaText(_definition.formula, values: const {}, labelOf: (key) => 'Côté'), '(Côté × Côté)');
  });

  test('writes a chosen answer by its label, never by its internal code', () {
    final formula = Expr.parse({
      'op': 'if',
      'args': [
        {
          'op': 'eq',
          'args': [
            {'input': 'sexe'},
            {'str': 'o2'},
          ],
        },
        {'num': 1.04},
        {'num': 1.23},
      ],
    }, 'formula');
    String? labels(String key, String value) => key == 'sexe' && value == 'o2' ? 'Femme' : null;
    expect(
      formulaText(formula, values: const {}, labelOf: (key) => 'Sexe', choiceLabelOf: labels),
      'if((Sexe = « Femme »), 1.04, 1.23)',
    );
    // Without a label for the answer, the code is shown as before.
    expect(formulaText(formula, values: const {}, labelOf: (key) => 'Sexe'), 'if((Sexe = "o2"), 1.04, 1.23)');
  });

  test('never shows a number outside the validated range', () {
    final evaluation = evaluate(_definition, {'side': const InputValue(500)});
    expect(evaluation.outcome, Outcome.outOfValidatedRange);
    expect(evaluation.value, isNull);
  });
}
