import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';

import '../core/api/api_error.dart';
import '../l10n/generated/app_localizations.dart';

/// The message for errors every screen can meet. Screens handle their specific codes first
/// (e.g. OTP_INVALID) and fall back to this.
String commonErrorText(BuildContext context, ApiError error) {
  final l10n = AppLocalizations.of(context);
  if (error.isNetwork) return l10n.errorsNetwork;
  if (error.isSessionEnded) return l10n.errorsSessionExpired;
  if (error.code == 'RATE_LIMITED') return l10n.errorsRateLimited;
  return l10n.errorsGeneric;
}

/// A local time such as « 14:05 » for « Réessayez à … » messages.
String timeText(BuildContext context, DateTime? at) {
  if (at == null) return '';
  return DateFormat.Hm(Localizations.localeOf(context).toLanguageTag()).format(at.toLocal());
}

/// A local date such as « 21/09/2026 ».
String dateText(BuildContext context, DateTime? at) {
  if (at == null) return '';
  return DateFormat.yMd(Localizations.localeOf(context).toLanguageTag()).format(at.toLocal());
}

/// « 1,1 Mo » / « 1.1 MB ».
String sizeText(BuildContext context, num bytes) {
  final locale = Localizations.localeOf(context).toLanguageTag();
  final french = locale.startsWith('fr');
  final units = french ? ['o', 'Ko', 'Mo'] : ['B', 'KB', 'MB'];
  var value = bytes.toDouble();
  var unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  final format = NumberFormat(unit == 0 ? '0' : '0.0', locale);
  return '${format.format(value)} ${units[unit]}';
}
