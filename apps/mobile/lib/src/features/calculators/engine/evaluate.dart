// The on-device calculator engine (ADR-003, ADR-012 §4): the Dart twin of the authoritative
// TypeScript engine. Same contract, same order of checks, same rounding; both run
// packages/calculator-vectors in CI.
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import 'definition.dart';

const engineVersion = 'dart-1.0.0';

/// What an evaluation gives: a result, invalid inputs, or values outside the validated range.
enum Outcome { result, invalid, outOfValidatedRange }

/// A value typed by the person; [unit] defaults to the input's canonical unit.
@immutable
class InputValue {
  const InputValue(this.value, {this.unit});

  /// num, String (choice) or bool; null means « not given ».
  final Object? value;
  final String? unit;
}

/// Why there is no result, with the input, rule or range concerned.
@immutable
class Issue {
  const Issue(this.code, {this.input, this.ruleId, this.range, this.rangeUnit, this.message});

  /// UNKNOWN_INPUT, REQUIRED, WRONG_TYPE, NOT_AN_INTEGER, UNKNOWN_UNIT, UNKNOWN_CHOICE, HARD_RANGE,
  /// CROSS_FIELD, VALIDATED_RANGE, MISSING_INPUT or NON_FINITE_RESULT.
  final String code;
  final String? input;
  final String? ruleId;

  /// The range that was not met, in [rangeUnit] (the input's canonical unit).
  final Range? range;
  final String? rangeUnit;
  final LocalizedText? message;

  /// `CODE` or `CODE:subject`, as the vectors compare them.
  String get key => [code, ?(ruleId ?? input)].join(':');
}

/// A unit conversion applied to an input, shown to the person.
@immutable
class Conversion {
  const Conversion({
    required this.input,
    required this.fromValue,
    required this.fromUnit,
    required this.toValue,
    required this.toUnit,
  });

  final String input;
  final double fromValue;
  final String fromUnit;
  final double toValue;
  final String toUnit;
}

/// An input outside its plausible range: the result is shown with « vérifiez la valeur ».
@immutable
class PlausibilityNote {
  const PlausibilityNote({required this.input, required this.range, required this.unit});

  final String input;
  final Range range;
  final String unit;
}

/// The engine's answer: a result (value, band, notes, conversions) or the issues.
@immutable
class Evaluation {
  const Evaluation.result({
    required double this.value,
    required this.unit,
    required this.decimals,
    required this.band,
    required this.notes,
    required this.conversions,
  }) : outcome = Outcome.result,
       issues = const [];

  const Evaluation.failed({required this.outcome, required this.issues, required this.conversions})
    : value = null,
      unit = null,
      decimals = null,
      band = null,
      notes = const [];

  final Outcome outcome;
  final double? value;
  final String? unit;
  final int? decimals;
  final InterpretationBand? band;
  final List<PlausibilityNote> notes;
  final List<Issue> issues;
  final List<Conversion> conversions;
}

/// A formula reached an optional input that was not given.
class _MissingInput implements Exception {
  const _MissingInput(this.input);
  final String input;
}

/// Evaluates [definition] on [raw] inputs. Pure and deterministic.
Evaluation evaluate(CalculatorDefinition definition, Map<String, InputValue?> raw) {
  final declared = {for (final input in definition.inputs) input.key: input};
  final invalid = <Issue>[];
  final conversions = <Conversion>[];
  final values = <String, Object>{};

  for (final entry in raw.entries) {
    if (!declared.containsKey(entry.key) && entry.value != null) invalid.add(Issue('UNKNOWN_INPUT', input: entry.key));
  }

  // 1. Presence, type and unit conversion to canonical units.
  for (final input in definition.inputs) {
    final given = raw[input.key];
    if (given == null || given.value == null) {
      if (input.required) invalid.add(Issue('REQUIRED', input: input.key));
      continue;
    }
    final accepted = _accept(input, given, conversions);
    if (accepted is Issue) {
      invalid.add(accepted);
    } else {
      values[input.key] = accepted;
    }
  }
  if (invalid.isNotEmpty) return Evaluation.failed(outcome: Outcome.invalid, issues: invalid, conversions: conversions);

  final numeric = definition.inputs.where((input) => input.isNumeric);

  // 2. Hard ranges: physiologically impossible values block.
  for (final input in numeric) {
    final value = values[input.key];
    if (value is double && input.hardRange != null && !input.hardRange!.contains(value)) {
      invalid.add(Issue('HARD_RANGE', input: input.key, range: input.hardRange, rangeUnit: input.canonicalUnit));
    }
  }
  if (invalid.isNotEmpty) return Evaluation.failed(outcome: Outcome.invalid, issues: invalid, conversions: conversions);

  // 3. Cross-field rules.
  final outOfRange = <Issue>[];
  for (final rule in definition.crossFieldRules) {
    Object holds;
    try {
      holds = _run(rule.when, values, definition);
    } on _MissingInput catch (missing) {
      invalid.add(Issue('MISSING_INPUT', input: missing.input, ruleId: rule.id));
      continue;
    }
    if (holds != true) {
      final issue = Issue('CROSS_FIELD', ruleId: rule.id, message: rule.message);
      (rule.outcome == RuleOutcome.invalid ? invalid : outOfRange).add(issue);
    }
  }
  if (invalid.isNotEmpty) return Evaluation.failed(outcome: Outcome.invalid, issues: invalid, conversions: conversions);

  // 4. Validated ranges: outside the population the formula was validated on → not computed.
  for (final input in numeric) {
    final value = values[input.key];
    if (value is double && input.validatedRange != null && !input.validatedRange!.contains(value)) {
      outOfRange.add(
        Issue('VALIDATED_RANGE', input: input.key, range: input.validatedRange, rangeUnit: input.canonicalUnit),
      );
    }
  }
  if (outOfRange.isNotEmpty) {
    return Evaluation.failed(outcome: Outcome.outOfValidatedRange, issues: outOfRange, conversions: conversions);
  }

  // 5. Plausibility notes (never block).
  final notes = <PlausibilityNote>[
    for (final input in numeric)
      if (values[input.key] case final double value
          when input.plausibleRange != null && !input.plausibleRange!.contains(value))
        PlausibilityNote(input: input.key, range: input.plausibleRange!, unit: input.canonicalUnit),
  ];

  // 6. The formula.
  Object value;
  try {
    value = _run(definition.formula, values, definition);
  } on _MissingInput catch (missing) {
    return Evaluation.failed(
      outcome: Outcome.invalid,
      issues: [Issue('MISSING_INPUT', input: missing.input)],
      conversions: conversions,
    );
  }
  if (value is! double || !value.isFinite) {
    return Evaluation.failed(
      outcome: Outcome.invalid,
      issues: const [Issue('NON_FINITE_RESULT')],
      conversions: conversions,
    );
  }
  final result = value;
  final band = definition.interpretation
      .where(
        (candidate) =>
            (candidate.from == null || result >= candidate.from!) && (candidate.to == null || result < candidate.to!),
      )
      .firstOrNull;
  return Evaluation.result(
    value: result,
    unit: definition.resultUnit,
    decimals: definition.resultDecimals,
    band: band,
    notes: notes,
    conversions: conversions,
  );
}

/// The accepted canonical value (double, String or bool), or the [Issue] refusing it.
Object _accept(CalculatorInput input, InputValue given, List<Conversion> conversions) {
  final wrongType = Issue('WRONG_TYPE', input: input.key);
  final raw = given.value;
  switch (input.kind) {
    case InputKind.boolean:
      return raw is bool ? raw : wrongType;
    case InputKind.choice:
      if (raw is! String) return wrongType;
      return input.choices.any((choice) => choice.value == raw) ? raw : Issue('UNKNOWN_CHOICE', input: input.key);
    case InputKind.number:
    case InputKind.integer:
      if (raw is! num || !raw.isFinite) return wrongType;
      final number = raw.toDouble();
      if (input.kind == InputKind.integer && number != number.truncateToDouble()) {
        return Issue('NOT_AN_INTEGER', input: input.key);
      }
      final unit = given.unit ?? input.canonicalUnit;
      if (unit == input.canonicalUnit) return number;
      final conversion = input.units.where((candidate) => candidate.code == unit).firstOrNull;
      if (conversion == null) return Issue('UNKNOWN_UNIT', input: input.key);
      final canonical = number * conversion.factorToCanonical;
      conversions.add(
        Conversion(
          input: input.key,
          fromValue: number,
          fromUnit: unit,
          toValue: canonical,
          toUnit: input.canonicalUnit,
        ),
      );
      return canonical;
  }
}

/// Computes one formula node (a number or a boolean) from the converted input values.
Object _run(Expr node, Map<String, Object> values, CalculatorDefinition definition) {
  // Helpers: a child node's value as a number or a boolean.
  double numOf(Expr expr) => _run(expr, values, definition) as double;
  bool boolOf(Expr expr) => _run(expr, values, definition) as bool;

  switch (node) {
    case NumExpr(:final value):
      return value;
    case BoolExpr(:final value):
      return value;
    case StrExpr(:final value):
      return value;
    case PresentExpr(:final key):
      return values.containsKey(key);
    case InputExpr(:final key):
      return values[key] ?? (throw _MissingInput(key));
    case PointsExpr(:final key):
      final selected = values[key] ?? (throw _MissingInput(key));
      final input = definition.inputs.where((candidate) => candidate.key == key).firstOrNull;
      final choice = input?.kind == InputKind.choice
          ? input!.choices.where((candidate) => candidate.value == selected).firstOrNull
          : null;
      return choice?.points ?? double.nan;
    case RoundExpr(:final digits, :final arg):
      return roundHalfAwayFromZero(numOf(arg), digits);
    case PiecewiseExpr(:final cases, :final otherwise):
      final match = cases.where((entry) => boolOf(entry.when)).firstOrNull;
      return _run(match?.then ?? otherwise, values, definition);
    case OpExpr(:final op, :final args):
      switch (op) {
        case 'add':
          return numOf(args[0]) + numOf(args[1]);
        case 'sub':
          return numOf(args[0]) - numOf(args[1]);
        case 'mul':
          return numOf(args[0]) * numOf(args[1]);
        case 'div':
          return numOf(args[0]) / numOf(args[1]);
        case 'pow':
          return jsPow(numOf(args[0]), numOf(args[1]));
        case 'lt':
          return numOf(args[0]) < numOf(args[1]);
        case 'le':
          return numOf(args[0]) <= numOf(args[1]);
        case 'gt':
          return numOf(args[0]) > numOf(args[1]);
        case 'ge':
          return numOf(args[0]) >= numOf(args[1]);
        case 'eq':
          return _run(args[0], values, definition) == _run(args[1], values, definition);
        case 'ne':
          return _run(args[0], values, definition) != _run(args[1], values, definition);
        case 'sqrt':
          return math.sqrt(numOf(args[0]));
        case 'ln':
          return math.log(numOf(args[0]));
        case 'log10':
          return log10(numOf(args[0]));
        case 'exp':
          return math.exp(numOf(args[0]));
        case 'not':
          return !boolOf(args[0]);
        case 'min':
          return args.map(numOf).reduce(math.min);
        case 'max':
          return args.map(numOf).reduce(math.max);
        case 'sum':
          return args.fold<double>(0, (total, arg) => total + numOf(arg));
        case 'and':
          return args.every(boolOf);
        case 'or':
          return args.any(boolOf);
        case 'if':
          return boolOf(args[0]) ? _run(args[1], values, definition) : _run(args[2], values, definition);
      }
      throw StateError('Unknown operator $op');
  }
}

/// JavaScript `Math.pow` semantics (IEEE pow differs for a NaN exponent and |base| = 1 with an
/// infinite exponent, where JavaScript answers NaN).
double jsPow(double base, double exponent) {
  if (exponent.isNaN) return double.nan;
  if (base.abs() == 1 && exponent.isInfinite) return double.nan;
  return math.pow(base, exponent).toDouble();
}

/// Base-10 logarithm, exact on powers of ten like JavaScript's `Math.log10`.
double log10(double value) {
  final result = math.log(value) / math.ln10;
  if (!result.isFinite) return result;
  final rounded = result.roundToDouble();
  if ((result - rounded).abs() < 1e-9 && math.pow(10, rounded) == value) return rounded;
  return result;
}

/// Rounds to [digits] decimals, halves away from zero, on the shortest decimal representation
/// (1.005 → 1.01), as the TypeScript engine does.
double roundHalfAwayFromZero(double value, int digits) {
  if (!value.isFinite) return value;
  final sign = value < 0 ? -1.0 : 1.0;
  final shifted = _shiftDecimal(value.abs(), digits).roundToDouble();
  return sign * _shiftDecimal(shifted, -digits);
}

/// Multiplies by a power of ten exactly (through the decimal text), for correct rounding.
double _shiftDecimal(double value, int places) {
  final text = _shortest(value);
  final parts = text.split('e');
  final exponent = parts.length > 1 ? int.parse(parts[1]) : 0;
  return double.parse('${parts[0]}e${exponent + places}');
}

/// The shortest round-trip decimal text, like JavaScript's `String(number)` for finite values.
String _shortest(double value) {
  final text = value.toString();
  return text.endsWith('.0') ? text.substring(0, text.length - 2) : text;
}
