// The app shows a result with the same last digit as the engine's `round` and Admin Web's preview:
// halves away from zero on the decimal value (ADR-012), whatever the binary representation.
import 'package:doktool/src/features/calculators/engine/display_number.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('displayNumber', () {
    test('rounds halves away from zero on the decimal value', () {
      // Each of these is stored in binary just below the half; `intl` alone would round down.
      expect(displayNumber(2.675, 'en', decimals: 2), '2.68');
      expect(displayNumber(1.005, 'en', decimals: 2), '1.01');
      expect(displayNumber(0.285, 'en', decimals: 2), '0.29');
      expect(displayNumber(9.995, 'en', decimals: 2), '10.00');
      expect(displayNumber(-2.675, 'en', decimals: 2), '-2.68');
      expect(displayNumber(2.5, 'en', decimals: 0), '3');
      expect(displayNumber(-2.5, 'en', decimals: 0), '-3');
    });

    test('leaves values that are not on a half as they were', () {
      expect(displayNumber(1.0049999, 'en', decimals: 2), '1.00');
      expect(displayNumber(24.6913, 'en', decimals: 1), '24.7');
      expect(displayNumber(70, 'en', decimals: 0), '70');
      expect(displayNumber(0, 'en', decimals: 2), '0.00');
    });

    test('writes the number in the UI language', () {
      expect(displayNumber(2.675, 'fr', decimals: 2), '2,68');
      expect(displayNumber(1234.5, 'en', decimals: 1), '1,234.5');
      expect(displayNumber(1234.5, 'fr', decimals: 1), matches(RegExp(r'^1.234,5$')));
    });

    test('shows range bounds and converted values with at most six decimals', () {
      expect(displayNumber(0.5, 'en'), '0.5');
      expect(displayNumber(88.4, 'en'), '88.4');
      expect(displayNumber(1.23456789, 'en'), '1.234568');
      expect(displayNumber(150, 'fr'), '150');
    });
  });
}
