import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/models/checkout_dto.dart';
import '../../core/api/generated/models/checkout_dto_language.dart';
import '../../core/api/generated/models/checkout_eligibility.dart';
import '../../core/api/generated/models/payment_method.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/dt_page.dart';
import '../../ui/error_text.dart';
import '../../ui/segmented_control.dart';
import '../../ui/skeleton.dart';
import '../../ui/tokens.dart';
import 'payment_state.dart';
import 'subscription_data.dart';

/// « Récapitulatif & confirmation » (section 06): plan, price, period, payment method, access,
/// renewal mode and one acknowledgement line; « Payer » stays disabled until it is ticked.
class ReviewScreen extends ConsumerStatefulWidget {
  const ReviewScreen({required this.planId, super.key});

  final String planId;

  @override
  ConsumerState<ReviewScreen> createState() => _ReviewScreenState();
}

/// The card chosen, the « non remboursable » acknowledgement, progress and error.
class _ReviewScreenState extends ConsumerState<ReviewScreen> {
  /// The card chosen; null until the person picks one of those the API accepts right now.
  PaymentMethod? _choice;
  bool _acknowledged = false;
  bool _paying = false;
  ApiError? _error;

  /// « Payer »: starts the payment on the API and opens the payment page in the browser.
  Future<void> _pay(String acknowledgementVersion, PaymentMethod method) async {
    setState(() {
      _paying = true;
      _error = null;
    });
    try {
      final english = Localizations.localeOf(context).languageCode == 'en';
      final started = await ref
          .read(apiProvider)
          .subscription
          .billingControllerStart(
            body: CheckoutDto(
              planId: widget.planId,
              method: method,
              acknowledged: true,
              acknowledgementVersion: acknowledgementVersion,
              language: english ? CheckoutDtoLanguage.en : CheckoutDtoLanguage.fr,
            ),
          );
      ref.read(pendingCheckoutProvider.notifier).start(started.transactionId, started.redirectUrl, widget.planId);
      await launchUrl(Uri.parse(started.redirectUrl), mode: LaunchMode.externalApplication);
      if (mounted) context.pushReplacement(Routes.subscriptionResult(started.transactionId));
    } catch (error) {
      if (mounted) setState(() => _error = ApiError.from(error));
    } finally {
      if (mounted) setState(() => _paying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final plans = ref.watch(plansProvider).value;
    final overview = ref.watch(subscriptionOverviewProvider).value;
    final plan = plans?.plans.where((candidate) => candidate.id == widget.planId).firstOrNull;
    if (plans == null || plan == null) return DtPage(title: l10n.reviewTitle, children: const [SkeletonRows(count: 5)]);
    final english = Localizations.localeOf(context).languageCode == 'en';
    final renewal = plans.eligibility.renewal ?? false;
    final currentEnd = overview?.subscription?.currentPeriodEnd;
    final start = renewal && currentEnd != null && currentEnd.isAfter(DateTime.now()) ? currentEnd : DateTime.now();
    final end = start.add(Duration(days: plan.durationDays.toInt()));
    final open = plans.eligibility.state == CheckoutEligibility.open;
    // Only the cards the API accepts now (ADR-021); a card unknown to this app version is skipped.
    final methods = plans.paymentMethods.where((method) => method != PaymentMethod.$unknown).toList();
    final method = methods.contains(_choice) ? _choice : methods.firstOrNull;

    Widget row(String label, String value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: DtSpace.s2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(label, style: DtType.label.copyWith(color: colors.inkMuted)),
          ),
          Expanded(
            child: Text(value, style: DtType.body.copyWith(color: colors.ink)),
          ),
        ],
      ),
    );

    return DtPage(
      title: l10n.reviewTitle,
      actions: [
        if (_error != null) DtAlert(severity: DtAlertSeverity.critical, body: _message(context, _error!)),
        if (methods.isEmpty) DtAlert(severity: DtAlertSeverity.info, body: l10n.reviewMethodsPaused),
        // « Payer »: needs the plan open, a card chosen and the acknowledgement ticked.
        DtButton(
          label: l10n.reviewPay,
          loading: _paying,
          onPressed: open && _acknowledged && method != null ? () => _pay(plans.acknowledgementVersion, method) : null,
        ),
        Text(
          l10n.reviewRedirectNote,
          textAlign: TextAlign.center,
          style: DtType.caption.copyWith(color: colors.inkMuted),
        ),
      ],
      children: [
        row(l10n.reviewPlan, english ? plan.nameEn : plan.nameFr),
        row(l10n.reviewPrice, l10n.plansPrice(moneyText(context, plan.priceMinor, plan.currency))),
        row(l10n.reviewPeriod, l10n.reviewPeriodValue(dateText(context, start), dateText(context, end))),
        row(l10n.reviewAccessLevel, l10n.plansAccess),
        row(l10n.reviewRenewal, l10n.reviewRenewalManual),
        const SizedBox(height: DtSpace.s4),
        if (method != null) ...[
          // Read once, as the label of the choice below.
          ExcludeSemantics(
            child: Text(l10n.reviewMethod, style: DtType.label.copyWith(color: colors.inkSecondary)),
          ),
          const SizedBox(height: DtSpace.s1),
          if (methods.length == 1)
            Text(methodText(l10n, method), style: DtType.body.copyWith(color: colors.ink))
          else
            // The card: CIB or Edahabia (those the API accepts now).
            DtSegmentedControl<PaymentMethod>(
              semanticLabel: l10n.reviewMethod,
              selected: method,
              onChanged: (choice) => setState(() => _choice = choice),
              segments: [for (final option in methods) DtSegment(value: option, label: methodText(l10n, option))],
            ),
        ],
        const SizedBox(height: DtSpace.s6),
        MergeSemantics(
          // « J'ai compris que l'abonnement n'est pas remboursable ».
          child: CheckboxListTile(
            value: _acknowledged,
            onChanged: (value) => setState(() => _acknowledged = value ?? false),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
            activeColor: colors.brand,
            title: Text(l10n.reviewAcknowledgement, style: DtType.body.copyWith(color: colors.ink)),
          ),
        ),
      ],
    );
  }

  /// The message for each refusal (a payment already in progress, method paused…).
  String _message(BuildContext context, ApiError error) {
    final l10n = AppLocalizations.of(context);
    return switch (error.code) {
      'INVALID_STATE' => l10n.paymentInProgress,
      'CHANNEL_UNAVAILABLE' => l10n.reviewMethodsPaused,
      _ => commonErrorText(context, error),
    };
  }
}
