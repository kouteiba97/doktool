import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/generated/models/access_state.dart';
import '../../core/api/generated/models/calculator_detail_dto.dart';
import '../../core/api/generated/models/published_test_case_dto_expected_outcome.dart';
import '../../core/database/app_database.dart';
import 'engine/definition.dart';
import 'engine/evaluate.dart';
import 'engine/self_test.dart';

enum RuntimeState { ready, locked, unsupported, selfTestFailed }

/// A calculator ready for the device engine: the published version, parsed and self-tested.
/// Inputs are computed on the device only; they never leave it (Lock L42).
class CalculatorRuntime {
  const CalculatorRuntime({required this.detail, required this.state, this.definition});

  final CalculatorDetailDto detail;
  final RuntimeState state;
  final CalculatorDefinition? definition;
}

final calculatorRuntimeProvider = FutureProvider.autoDispose.family<CalculatorRuntime, String>((ref, slug) async {
  final detail = await ref.watch(apiProvider).calculators.calculatorsControllerGet(slug: slug);
  final published = detail.published;
  if (detail.access.state == AccessState.locked || published == null) {
    return CalculatorRuntime(detail: detail, state: RuntimeState.locked);
  }
  final CalculatorDefinition definition;
  try {
    definition = CalculatorDefinition.parse(published.definition);
  } on DefinitionFormatException {
    return CalculatorRuntime(detail: detail, state: RuntimeState.unsupported);
  }
  final cases = [
    for (final testCase in detail.testCases)
      ReferenceCase(
        inputs: inputsFromJson(testCase.inputs),
        outcome: switch (testCase.expectedOutcome) {
          PublishedTestCaseDtoExpectedOutcome.result => Outcome.result,
          PublishedTestCaseDtoExpectedOutcome.invalid => Outcome.invalid,
          _ => Outcome.outOfValidatedRange,
        },
        value: testCase.expectedValue?.toDouble(),
        tolerance: testCase.tolerance?.toDouble(),
        band: testCase.expectedBand,
      ),
  ];
  return CalculatorRuntime(
    detail: detail,
    state: passesReferenceCases(definition, cases) ? RuntimeState.ready : RuntimeState.selfTestFailed,
    definition: definition,
  );
});

/// The last inputs of a calculator, remembered on this device only (ScreenCalculatorMobile).
class LastInputs {
  LastInputs(this._database);

  final AppDatabase _database;

  static String _key(String slug) => 'calculator.inputs.$slug';

  Future<Map<String, InputValue?>> read(String slug) async {
    final raw = await _database.readSetting(_key(slug));
    return raw == null ? const {} : inputsFromJson(jsonDecode(raw));
  }

  Future<void> write(String slug, Map<String, InputValue?> inputs) => _database.writeSetting(
    _key(slug),
    jsonEncode({
      for (final entry in inputs.entries)
        if (entry.value != null) entry.key: {'value': entry.value!.value, 'unit': ?entry.value!.unit},
    }),
  );
}

final lastInputsProvider = Provider<LastInputs>((ref) => LastInputs(ref.watch(appDatabaseProvider)));
