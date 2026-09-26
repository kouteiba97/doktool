import 'definition.dart';
import 'evaluate.dart';

/// One published reference case, as the API sends it.
class ReferenceCase {
  const ReferenceCase({required this.inputs, required this.outcome, this.value, this.tolerance, this.band});

  final Map<String, InputValue?> inputs;
  final Outcome outcome;
  final double? value;
  final double? tolerance;
  final String? band;
}

/// Reads the `{ key: { value, unit } }` map of a test case.
Map<String, InputValue?> inputsFromJson(Object? raw) {
  if (raw is! Map) return const {};
  return {
    for (final entry in raw.entries)
      '${entry.key}': entry.value is Map
          ? InputValue((entry.value as Map)['value'], unit: (entry.value as Map)['unit'] as String?)
          : null,
  };
}

/// Runs the published version's reference cases on this device before first use (section 28).
/// A version that fails any case is not used: the device engine would not be trustworthy for it.
bool passesReferenceCases(CalculatorDefinition definition, List<ReferenceCase> cases) {
  for (final reference in cases) {
    final Evaluation evaluation;
    try {
      evaluation = evaluate(definition, reference.inputs);
    } catch (_) {
      return false;
    }
    if (evaluation.outcome != reference.outcome) return false;
    if (reference.outcome == Outcome.result) {
      final expected = reference.value;
      if (expected == null) return false;
      if ((evaluation.value! - expected).abs() > (reference.tolerance ?? 0)) return false;
      if (reference.band != null && evaluation.band?.code != reference.band) return false;
    }
  }
  return true;
}
