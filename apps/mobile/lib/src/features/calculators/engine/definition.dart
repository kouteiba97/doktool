// Calculator definition, schema version 1 (ADR-012), read from the published JSON. Pure data:
// no code, no eval. Parsing applies the same defaults as the API schema.
import 'package:flutter/foundation.dart';

/// A published definition the device cannot read (the calculator is then not offered).
class DefinitionFormatException extends FormatException {
  const DefinitionFormatException(super.message);
}

typedef Json = Map<String, Object?>;

/// The value as a JSON object, or a format error naming where in the definition.
Json _map(Object? value, String path) {
  if (value is Map) return value.cast<String, Object?>();
  throw DefinitionFormatException('$path: expected an object');
}

/// The value as a list, or a format error.
List<Object?> _list(Object? value, String path) {
  if (value is List) return value;
  throw DefinitionFormatException('$path: expected a list');
}

/// The value as a string, or a format error.
String _string(Object? value, String path) {
  if (value is String) return value;
  throw DefinitionFormatException('$path: expected a string');
}

/// The value as a finite number, or a format error.
double _number(Object? value, String path) {
  if (value is num && value.isFinite) return value.toDouble();
  throw DefinitionFormatException('$path: expected a finite number');
}

/// The value as a number, or null when absent.
double? _optionalNumber(Object? value, String path) => value == null ? null : _number(value, path);

/// The value as a whole number (fallback when absent), or a format error.
int _int(Object? value, String path, {required int fallback}) {
  if (value == null) return fallback;
  if (value is num && value == value.roundToDouble()) return value.toInt();
  throw DefinitionFormatException('$path: expected an integer');
}

/// A text in French and English.
@immutable
class LocalizedText {
  const LocalizedText({required this.fr, required this.en});

  factory LocalizedText.parse(Object? raw, String path) {
    final map = _map(raw, path);
    return LocalizedText(fr: _string(map['fr'], '$path.fr'), en: _string(map['en'], '$path.en'));
  }

  final String fr;
  final String en;

  /// The text in the given language (English for "en", French otherwise).
  String of(String languageCode) => languageCode == 'en' ? en : fr;
}

/// A range with an optional minimum and maximum (inclusive).
@immutable
class Range {
  const Range({this.min, this.max});

  /// Reads a range from the definition (null when absent).
  static Range? parse(Object? raw, String path) {
    if (raw == null) return null;
    final map = _map(raw, path);
    return Range(min: _optionalNumber(map['min'], '$path.min'), max: _optionalNumber(map['max'], '$path.max'));
  }

  final double? min;
  final double? max;

  /// True when the value is inside the range.
  bool contains(double value) => (min == null || value >= min!) && (max == null || value <= max!);
}

// ───────────────────────────────── formula AST ─────────────────────────────────

sealed class Expr {
  const Expr();

  static const binary = {'add', 'sub', 'mul', 'div', 'pow', 'lt', 'le', 'gt', 'ge', 'eq', 'ne'};
  static const unary = {'sqrt', 'ln', 'log10', 'exp', 'not'};
  static const variadic = {'min', 'max', 'sum', 'and', 'or'};

  /// Reads a formula node and its children; any operator outside the closed set is refused.
  static Expr parse(Object? raw, String path) {
    final node = _map(raw, path);
    if (node.containsKey('num')) return NumExpr(_number(node['num'], '$path.num'));
    if (node.containsKey('bool')) {
      final value = node['bool'];
      if (value is! bool) throw DefinitionFormatException('$path.bool: expected a boolean');
      return BoolExpr(value);
    }
    if (node.containsKey('str')) return StrExpr(_string(node['str'], '$path.str'));
    if (node.containsKey('input')) return InputExpr(_string(node['input'], '$path.input'));
    if (node.containsKey('present')) return PresentExpr(_string(node['present'], '$path.present'));
    if (node.containsKey('points')) return PointsExpr(_string(node['points'], '$path.points'));
    final op = _string(node['op'], '$path.op');
    List<Expr> args(int? count) {
      final list = _list(node['args'], '$path.args');
      if (count != null && list.length != count) {
        throw DefinitionFormatException('$path.args: expected $count arguments');
      }
      if (list.isEmpty) throw DefinitionFormatException('$path.args: expected arguments');
      return [for (final (index, arg) in list.indexed) Expr.parse(arg, '$path.args.$index')];
    }

    if (binary.contains(op)) return OpExpr(op, args(2));
    if (unary.contains(op)) return OpExpr(op, args(1));
    if (variadic.contains(op)) return OpExpr(op, args(null));
    switch (op) {
      case 'round':
        return RoundExpr(_int(node['digits'], '$path.digits', fallback: -1), args(1).single);
      case 'if':
        return OpExpr(op, args(3));
      case 'piecewise':
        final cases = [
          for (final (index, entry) in _list(node['cases'], '$path.cases').indexed)
            (
              when: Expr.parse(_map(entry, '$path.cases.$index')['when'], '$path.cases.$index.when'),
              then: Expr.parse(_map(entry, '$path.cases.$index')['then'], '$path.cases.$index.then'),
            ),
        ];
        return PiecewiseExpr(cases, Expr.parse(node['otherwise'], '$path.otherwise'));
    }
    throw DefinitionFormatException('$path.op: unknown operator "$op"');
  }
}

final class NumExpr extends Expr {
  const NumExpr(this.value);
  final double value;
}

final class BoolExpr extends Expr {
  const BoolExpr(this.value);
  final bool value;
}

final class StrExpr extends Expr {
  const StrExpr(this.value);
  final String value;
}

final class InputExpr extends Expr {
  const InputExpr(this.key);
  final String key;
}

final class PresentExpr extends Expr {
  const PresentExpr(this.key);
  final String key;
}

final class PointsExpr extends Expr {
  const PointsExpr(this.key);
  final String key;
}

final class OpExpr extends Expr {
  const OpExpr(this.op, this.args);
  final String op;
  final List<Expr> args;
}

final class RoundExpr extends Expr {
  const RoundExpr(this.digits, this.arg);
  final int digits;
  final Expr arg;
}

final class PiecewiseExpr extends Expr {
  const PiecewiseExpr(this.cases, this.otherwise);
  final List<({Expr when, Expr then})> cases;
  final Expr otherwise;
}

// ───────────────────────────────── inputs ─────────────────────────────────

/// How to convert a unit to the input's canonical unit, and where the factor comes from.
@immutable
class UnitConversion {
  const UnitConversion({required this.code, required this.factorToCanonical, required this.source});

  final String code;
  final double factorToCanonical;
  final String source;
}

/// One answer of a choice input, with its points if the score uses them.
@immutable
class Choice {
  const Choice({required this.value, required this.label, this.points});

  final String value;
  final LocalizedText label;
  final double? points;
}

/// What an input asks for.
enum InputKind { number, integer, choice, boolean }

/// One input of a calculator: kind, label, units, the three ranges (hard, validated, plausible), help.
@immutable
class CalculatorInput {
  const CalculatorInput({
    required this.kind,
    required this.key,
    required this.label,
    required this.required,
    this.help,
    this.quantity,
    this.canonicalUnit = '',
    this.units = const [],
    this.defaultUnitFr,
    this.defaultUnitEn,
    this.decimals = 0,
    this.hardRange,
    this.validatedRange,
    this.plausibleRange,
    this.choices = const [],
  });

  factory CalculatorInput.parse(Object? raw, String path) {
    final map = _map(raw, path);
    final kind = switch (map['kind']) {
      'NUMBER' => InputKind.number,
      'INTEGER' => InputKind.integer,
      'CHOICE' => InputKind.choice,
      'BOOLEAN' => InputKind.boolean,
      _ => throw DefinitionFormatException('$path.kind: unknown input kind'),
    };
    final required = map['required'];
    if (required is! bool) throw DefinitionFormatException('$path.required: expected a boolean');
    final numeric = kind == InputKind.number || kind == InputKind.integer;
    final defaultUnit = map['defaultUnit'] == null ? null : _map(map['defaultUnit'], '$path.defaultUnit');
    return CalculatorInput(
      kind: kind,
      key: _string(map['key'], '$path.key'),
      label: LocalizedText.parse(map['label'], '$path.label'),
      required: required,
      help: map['help'] == null ? null : LocalizedText.parse(map['help'], '$path.help'),
      quantity: numeric ? _string(map['quantity'], '$path.quantity') : null,
      canonicalUnit: numeric ? _string(map['canonicalUnit'], '$path.canonicalUnit') : '',
      units: [
        if (numeric && map['units'] != null)
          for (final (index, unit) in _list(map['units'], '$path.units').indexed)
            UnitConversion(
              code: _string(_map(unit, '$path.units.$index')['code'], '$path.units.$index.code'),
              factorToCanonical: _number(
                _map(unit, '$path.units.$index')['factorToCanonical'],
                '$path.units.$index.factorToCanonical',
              ),
              source: _string(_map(unit, '$path.units.$index')['source'], '$path.units.$index.source'),
            ),
      ],
      defaultUnitFr: defaultUnit?['FR'] as String?,
      defaultUnitEn: defaultUnit?['EN'] as String?,
      decimals: _int(map['decimals'], '$path.decimals', fallback: 0),
      hardRange: Range.parse(map['hardRange'], '$path.hardRange'),
      validatedRange: Range.parse(map['validatedRange'], '$path.validatedRange'),
      plausibleRange: Range.parse(map['plausibleRange'], '$path.plausibleRange'),
      choices: [
        if (kind == InputKind.choice)
          for (final (index, choice) in _list(map['choices'], '$path.choices').indexed)
            Choice(
              value: _string(_map(choice, '$path.choices.$index')['value'], '$path.choices.$index.value'),
              label: LocalizedText.parse(_map(choice, '$path.choices.$index')['label'], '$path.choices.$index.label'),
              points: _optionalNumber(_map(choice, '$path.choices.$index')['points'], '$path.choices.$index.points'),
            ),
      ],
    );
  }

  final InputKind kind;
  final String key;
  final LocalizedText label;
  final bool required;
  final LocalizedText? help;
  final String? quantity;
  final String canonicalUnit;
  final List<UnitConversion> units;
  final String? defaultUnitFr;
  final String? defaultUnitEn;
  final int decimals;
  final Range? hardRange;
  final Range? validatedRange;
  final Range? plausibleRange;
  final List<Choice> choices;

  bool get isNumeric => kind == InputKind.number || kind == InputKind.integer;

  /// Units the field offers: the canonical unit first, then the declared conversions.
  List<String> get unitCodes => [canonicalUnit, for (final unit in units) unit.code];
}

/// What a cross-field rule does when it matches.
enum RuleOutcome { invalid, outOfValidatedRange }

/// A rule over several inputs (e.g. diastolic < systolic) that blocks the result.
@immutable
class CrossFieldRule {
  const CrossFieldRule({required this.id, required this.when, required this.outcome, required this.message});

  final String id;
  final Expr when;
  final RuleOutcome outcome;
  final LocalizedText message;
}

/// A band of the result (from / to) with its severity and label.
@immutable
class InterpretationBand {
  const InterpretationBand({required this.code, required this.severity, required this.label, this.from, this.to});

  final String code;
  final double? from;
  final double? to;
  final String severity;
  final LocalizedText label;
}

/// A whole calculator version: inputs, rules, formula, result unit and decimals, bands, limitations.
@immutable
class CalculatorDefinition {
  const CalculatorDefinition({
    required this.inputs,
    required this.crossFieldRules,
    required this.formula,
    required this.resultUnit,
    required this.resultDecimals,
    required this.resultLabel,
    required this.interpretation,
    required this.limitations,
  });

  factory CalculatorDefinition.parse(Object? raw) {
    final map = _map(raw, 'definition');
    if (map['schemaVersion'] != 1) throw const DefinitionFormatException('definition.schemaVersion: expected 1');
    final result = _map(map['result'], 'result');
    return CalculatorDefinition(
      inputs: [
        for (final (index, input) in _list(map['inputs'], 'inputs').indexed)
          CalculatorInput.parse(input, 'inputs.$index'),
      ],
      crossFieldRules: [
        if (map['crossFieldRules'] != null)
          for (final (index, rule) in _list(map['crossFieldRules'], 'crossFieldRules').indexed)
            CrossFieldRule(
              id: _string(_map(rule, 'crossFieldRules.$index')['id'], 'crossFieldRules.$index.id'),
              when: Expr.parse(_map(rule, 'crossFieldRules.$index')['when'], 'crossFieldRules.$index.when'),
              outcome: _map(rule, 'crossFieldRules.$index')['outcome'] == 'INVALID'
                  ? RuleOutcome.invalid
                  : RuleOutcome.outOfValidatedRange,
              message: LocalizedText.parse(
                _map(rule, 'crossFieldRules.$index')['message'],
                'crossFieldRules.$index.message',
              ),
            ),
      ],
      formula: Expr.parse(map['formula'], 'formula'),
      resultUnit: _string(result['unit'], 'result.unit'),
      resultDecimals: _int(result['decimals'], 'result.decimals', fallback: 0),
      resultLabel: LocalizedText.parse(result['label'], 'result.label'),
      interpretation: [
        if (map['interpretation'] != null)
          for (final (index, band) in _list(map['interpretation'], 'interpretation').indexed)
            InterpretationBand(
              code: _string(_map(band, 'interpretation.$index')['code'], 'interpretation.$index.code'),
              from: _optionalNumber(_map(band, 'interpretation.$index')['from'], 'interpretation.$index.from'),
              to: _optionalNumber(_map(band, 'interpretation.$index')['to'], 'interpretation.$index.to'),
              severity: _string(_map(band, 'interpretation.$index')['severity'], 'interpretation.$index.severity'),
              label: LocalizedText.parse(_map(band, 'interpretation.$index')['label'], 'interpretation.$index.label'),
            ),
      ],
      limitations: LocalizedText.parse(map['limitations'], 'limitations'),
    );
  }

  final List<CalculatorInput> inputs;
  final List<CrossFieldRule> crossFieldRules;
  final Expr formula;
  final String resultUnit;
  final int resultDecimals;
  final LocalizedText resultLabel;
  final List<InterpretationBand> interpretation;
  final LocalizedText limitations;
}
