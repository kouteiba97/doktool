import 'package:intl/intl.dart';

import 'evaluate.dart';

/// A number as the person reads it, in the UI language: [decimals] fixed decimals for a result,
/// or up to six for a range bound or a converted value.
///
/// The value is rounded with the engine's own rule (halves away from zero, on the decimal value:
/// 2.675 → 2,68) before it is formatted. `intl` alone rounds the binary value (2.675 → 2,67), so
/// the app would show another last digit than Admin Web's preview and than the engine's `round`.
String displayNumber(num value, String locale, {int? decimals}) {
  final format = NumberFormat.decimalPattern(locale);
  if (decimals != null) {
    format
      ..minimumFractionDigits = decimals
      ..maximumFractionDigits = decimals;
  } else {
    format.maximumFractionDigits = 6;
  }
  return format.format(roundHalfAwayFromZero(value.toDouble(), decimals ?? 6));
}
