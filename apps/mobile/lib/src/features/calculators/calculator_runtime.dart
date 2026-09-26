import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/models/access_state.dart';
import '../../core/api/generated/models/calculator_detail_dto.dart';
import '../../core/api/generated/models/published_test_case_dto.dart';
import '../../core/api/generated/models/published_test_case_dto_expected_outcome.dart';
import '../../core/database/app_database.dart';
import '../offline/offline_store.dart';
import 'engine/definition.dart';
import 'engine/evaluate.dart';
import 'engine/self_test.dart';

enum RuntimeState { ready, locked, unsupported, selfTestFailed }

/// A calculator ready for the device engine: the published version, parsed and self-tested.
/// Inputs are computed on the device only; they never leave it (Lock L42).
class CalculatorRuntime {
  const CalculatorRuntime({required this.detail, required this.state, this.definition, this.offline = false});

  final CalculatorDetailDto detail;
  final RuntimeState state;
  final CalculatorDefinition? definition;

  /// Opened from the installed offline version (« hors ligne »).
  final bool offline;
}

/// The API's test cases as the device self-test reads them.
List<ReferenceCase> referenceCasesOf(List<PublishedTestCaseDto> testCases) => [
  for (final testCase in testCases)
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

/// Parses and self-tests a published version.
CalculatorRuntime runtimeOf(CalculatorDetailDto detail, {bool offline = false}) {
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
  return CalculatorRuntime(
    detail: detail,
    state: passesReferenceCases(definition, referenceCasesOf(detail.testCases))
        ? RuntimeState.ready
        : RuntimeState.selfTestFailed,
    definition: definition,
    offline: offline,
  );
}

/// Online: the current published version. Without a connection: the version installed by the
/// offline sync, computed on the device (section 18).
final calculatorRuntimeProvider = FutureProvider.autoDispose.family<CalculatorRuntime, String>((ref, slug) async {
  try {
    return runtimeOf(await ref.watch(apiProvider).calculators.calculatorsControllerGet(slug: slug));
  } catch (error) {
    if (!ApiError.from(error).isNetwork) rethrow;
    final installed = await ref.read(offlineStoreProvider).calculatorBySlug(slug);
    if (installed == null) rethrow;
    return runtimeOf(ref.read(offlineStoreProvider).detailOf(installed), offline: true);
  }
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
