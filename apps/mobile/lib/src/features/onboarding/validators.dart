/// Client-side checks that mirror the API (ADR-009), so errors show on blur. The server stays the
/// judge; these only spare a round trip.
library;

final _email = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
final _e164 = RegExp(r'^\+[1-9]\d{7,14}$');
final _algerianMobile = RegExp(r'^0[5-7]\d{8}$');

/// E-mail, E.164 phone, or an Algerian mobile written locally (05…, 06…, 07…).
bool isValidIdentifier(String raw) {
  final input = raw.trim();
  if (input.contains('@')) return input.length <= 254 && _email.hasMatch(input.toLowerCase());
  var phone = input.replaceAll(RegExp(r'[\s.\-()]'), '');
  if (phone.startsWith('00')) {
    phone = '+${phone.substring(2)}';
  } else if (_algerianMobile.hasMatch(phone)) {
    phone = '+213${phone.substring(1)}';
  }
  return _e164.hasMatch(phone);
}

/// Minimum length accepted by the API.
const passwordMinLength = 8;

/// How strong a password looks (guidance shown under the field).
enum PasswordStrength { tooShort, weak, fair, strong }

/// Guidance only: the API requires 8 characters; « Solide » asks for 10 with digits and symbols.
PasswordStrength passwordStrength(String password) {
  if (password.length < passwordMinLength) return PasswordStrength.tooShort;
  final hasDigit = RegExp(r'\d').hasMatch(password);
  final hasSymbol = RegExp(r'[^A-Za-z0-9]').hasMatch(password);
  final hasLetter = RegExp('[A-Za-z]').hasMatch(password);
  final variety = [hasDigit, hasSymbol, hasLetter].where((present) => present).length;
  if (password.length >= 10 && variety == 3) return PasswordStrength.strong;
  if (variety >= 2) return PasswordStrength.fair;
  return PasswordStrength.weak;
}

/// Ordre registration number as the API accepts it.
final orderNumberPattern = RegExp(r'^[A-Za-z0-9][A-Za-z0-9/-]{0,29}$');
