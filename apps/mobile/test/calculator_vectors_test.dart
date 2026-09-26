// The Dart engine against the shared conformance vectors (packages/calculator-vectors). The
// TypeScript engine runs the same files; CI fails if either disagrees (ADR-003).
import 'dart:convert';
import 'dart:io';

import 'package:doktool/src/features/calculators/engine/definition.dart';
import 'package:doktool/src/features/calculators/engine/evaluate.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, InputValue?> _inputs(Map<String, Object?> raw) => {
  for (final entry in raw.entries)
    entry.key: entry.value == null
        ? null
        : InputValue((entry.value! as Map)['value'], unit: (entry.value! as Map)['unit'] as String?),
};

Outcome _outcome(String name) => switch (name) {
  'RESULT' => Outcome.result,
  'INVALID' => Outcome.invalid,
  _ => Outcome.outOfValidatedRange,
};

void main() {
  final directory = Directory('../../packages/calculator-vectors/vectors');
  final files = directory.listSync().whereType<File>().where((file) => file.path.endsWith('.json')).toList()
    ..sort((a, b) => a.path.compareTo(b.path));

  test('finds the vector suites', () {
    expect(files.length, 5);
  });

  for (final file in files) {
    final suite = jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
    group(suite['suite']! as String, () {
      for (final groupJson in (suite['groups']! as List).cast<Map<String, Object?>>()) {
        group(groupJson['name']! as String, () {
          final definition = CalculatorDefinition.parse(groupJson['definition']);
          for (final testCase in (groupJson['cases']! as List).cast<Map<String, Object?>>()) {
            test(testCase['name']! as String, () {
              final expected = testCase['expected']! as Map<String, Object?>;
              final evaluation = evaluate(definition, _inputs((testCase['inputs']! as Map).cast<String, Object?>()));
              expect(evaluation.outcome, _outcome(expected['outcome']! as String));

              if (evaluation.outcome == Outcome.result) {
                final tolerance = (expected['tolerance'] as num?)?.toDouble() ?? 0;
                expect((evaluation.value! - (expected['value']! as num)).abs(), lessThanOrEqualTo(tolerance));
                expect(evaluation.issues, isEmpty);
                if (expected.containsKey('band')) expect(evaluation.band?.code, expected['band']);
                if (expected['notes'] case final List<Object?> notes) {
                  expect(
                    evaluation.notes.map((note) => note.input).toList()..sort(),
                    notes.cast<String>().toList()..sort(),
                  );
                }
              } else if (expected['issues'] case final List<Object?> issues) {
                expect(
                  evaluation.issues.map((issue) => issue.key).toList()..sort(),
                  issues.cast<String>().toList()..sort(),
                );
              }

              if (expected['conversions'] case final List<Object?> conversions) {
                expect(evaluation.conversions.length, conversions.length);
                for (final (index, raw) in conversions.indexed) {
                  final conversion = raw! as Map<String, Object?>;
                  final actual = evaluation.conversions[index];
                  final from = conversion['from']! as Map<String, Object?>;
                  final to = conversion['to']! as Map<String, Object?>;
                  expect(actual.input, conversion['input']);
                  expect(actual.fromUnit, from['unit']);
                  expect(actual.toUnit, to['unit']);
                  expect((actual.fromValue - (from['value']! as num)).abs(), lessThanOrEqualTo(1e-12));
                  expect((actual.toValue - (to['value']! as num)).abs(), lessThanOrEqualTo(1e-12));
                }
              }
            });
          }
        });
      }
    });
  }
}
