import 'definition.dart';

/// The formula as mono text with the entered values substituted (ScreenCalculatorMobile), e.g.
/// `(70 × (140 − 60)) ÷ (72 × 1.1)`. Inputs without a value keep their label.
///
/// A choice compared with one of its answers shows that answer's label, not its internal code:
/// `(Sexe = « Femme »)`, never `(Sexe = "o2")`. [choiceLabelOf] gives the label of an answer.
String formulaText(
  Expr node, {
  required Map<String, String> values,
  required String Function(String key) labelOf,
  String? Function(String key, String value)? choiceLabelOf,
}) {
  // Writes a child node.
  String text(Expr expr) => formulaText(expr, values: values, labelOf: labelOf, choiceLabelOf: choiceLabelOf);
  // Writes an answer code as its label when the other side of the comparison is its input.
  String answer(Expr side, Expr other) {
    if (side is StrExpr && other is InputExpr) {
      final label = choiceLabelOf?.call(other.key, side.value);
      if (label != null) return '« $label »';
    }
    return text(side);
  }

  switch (node) {
    case NumExpr(:final value):
      return _number(value);
    case BoolExpr(:final value):
      return value ? 'true' : 'false';
    case StrExpr(:final value):
      return '"$value"';
    case InputExpr(:final key):
    case PointsExpr(:final key):
      return values[key] ?? labelOf(key);
    case PresentExpr(:final key):
      return 'present(${labelOf(key)})';
    case RoundExpr(:final digits, :final arg):
      return 'round(${text(arg)}, $digits)';
    case PiecewiseExpr(:final cases, :final otherwise):
      final branches = [for (final entry in cases) '${text(entry.when)} → ${text(entry.then)}'];
      return '{ ${[...branches, '… → ${text(otherwise)}'].join('; ')} }';
    case OpExpr(:final op, :final args):
      const infix = {
        'add': '+',
        'sub': '−',
        'mul': '×',
        'div': '÷',
        'pow': '^',
        'lt': '<',
        'le': '≤',
        'gt': '>',
        'ge': '≥',
        'eq': '=',
        'ne': '≠',
      };
      if (op == 'eq' || op == 'ne') {
        return '(${answer(args[0], args[1])} ${infix[op]} ${answer(args[1], args[0])})';
      }
      if (infix.containsKey(op)) return '(${text(args[0])} ${infix[op]} ${text(args[1])})';
      return switch (op) {
        'sqrt' => '√(${text(args[0])})',
        'ln' => 'ln(${text(args[0])})',
        'log10' => 'log₁₀(${text(args[0])})',
        'exp' => 'e^(${text(args[0])})',
        'not' => 'not(${text(args[0])})',
        'sum' => '(${args.map(text).join(' + ')})',
        'if' => 'if(${args.map(text).join(', ')})',
        _ => '$op(${args.map(text).join(', ')})',
      };
  }
}

/// A number without a useless ".0".
String _number(double value) {
  final text = value.toString();
  return text.endsWith('.0') ? text.substring(0, text.length - 2) : text;
}
