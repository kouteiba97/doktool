import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/api/generated/models/payment_method.dart';
import '../../core/api/generated/models/plans_dto.dart';
import '../../core/api/generated/models/subscription_overview_dto.dart';
import '../../core/auth/session_controller.dart';
import '../../l10n/generated/app_localizations.dart';

/// Offers and whether checkout is open (also for the demo, with ACCOUNT_REQUIRED).
final plansProvider = FutureProvider<PlansDto>((ref) {
  ref.watch(sessionControllerProvider);
  return ref.watch(apiProvider).subscription.billingControllerListPlans();
});

/// The subscription screen: current subscription, eligibility and payments.
final subscriptionOverviewProvider = FutureProvider<SubscriptionOverviewDto>((ref) {
  ref.watch(sessionControllerProvider);
  return ref.watch(apiProvider).subscription.billingControllerOverview();
});

/// « 1 500 DA » / « 1,500 DZD », from centimes.
String moneyText(BuildContext context, num minor, String currency) {
  final locale = Localizations.localeOf(context).toLanguageTag();
  final whole = minor % 100 == 0;
  final format = NumberFormat.currency(
    locale: locale,
    name: currency,
    symbol: currency == 'DZD' ? 'DA' : currency,
    decimalDigits: whole ? 0 : 2,
  );
  return format.format(minor / 100);
}

String durationText(AppLocalizations l10n, num days) => switch (days) {
  30 => l10n.plansDurationMonth,
  365 => l10n.plansDurationYear,
  _ => l10n.plansDurationDays(days),
};

/// The card's name; which gateway took it is not the person's concern (ADR-021).
String methodText(AppLocalizations l10n, PaymentMethod method) => switch (method) {
  PaymentMethod.edahabia => l10n.reviewEdahabia,
  PaymentMethod.cib => l10n.reviewCib,
  PaymentMethod.$unknown => '—',
};
