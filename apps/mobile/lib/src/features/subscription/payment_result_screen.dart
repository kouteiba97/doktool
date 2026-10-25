import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/api/generated/models/transaction_dto.dart';
import '../../core/api/generated/models/transaction_status.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/dt_page.dart';
import '../../ui/tokens.dart';
import '../access/access_controller.dart';
import 'payment_state.dart';
import 'subscription_data.dart';

/// « Résultat du paiement »: the API asks the payment gateway what happened (never trusting the browser), so this
/// screen polls the transaction until it is final, and again whenever the app comes back.
class PaymentResultScreen extends ConsumerStatefulWidget {
  const PaymentResultScreen({required this.transactionId, super.key});

  final String transactionId;

  @override
  ConsumerState<PaymentResultScreen> createState() => _PaymentResultScreenState();
}

/// Checks the payment every 4 seconds and on return to the app, until it is no longer pending.
class _PaymentResultScreenState extends ConsumerState<PaymentResultScreen> with WidgetsBindingObserver {
  static const _interval = Duration(seconds: 4);
  Timer? _timer;
  TransactionDto? _transaction;
  bool _checking = false;

  /// Checks at once, then every 4 seconds.
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _check();
    _timer = Timer.periodic(_interval, (_) => _check());
  }

  /// Stops the checks.
  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    super.dispose();
  }

  /// Back from the payment page: checks at once.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _check();
  }

  /// Asks the API for the payment's status; success refreshes the access profile.
  Future<void> _check() async {
    if (_checking || (_transaction != null && _transaction!.status != TransactionStatus.pending)) return;
    setState(() => _checking = true);
    try {
      final transaction = await ref
          .read(apiProvider)
          .subscription
          .billingControllerTransaction(transactionId: widget.transactionId);
      if (!mounted) return;
      setState(() => _transaction = transaction);
      if (transaction.status != TransactionStatus.pending) {
        _timer?.cancel();
        ref.read(pendingCheckoutProvider.notifier).clear();
        ref
          ..invalidate(subscriptionOverviewProvider)
          ..invalidate(plansProvider);
        await ref.read(accessControllerProvider.notifier).reload();
      }
    } catch (_) {
      // Offline or server busy: the next tick or the next resume tries again.
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final status = _transaction?.status ?? TransactionStatus.pending;
    final pending = ref.watch(pendingCheckoutProvider);

    final (DtAlertSeverity severity, String body) = switch (status) {
      TransactionStatus.succeeded => (DtAlertSeverity.success, l10n.paymentSuccess),
      TransactionStatus.failed => (
        DtAlertSeverity.warning,
        [l10n.paymentFailed, if (_transaction?.providerMessage != null) _transaction!.providerMessage!].join(' '),
      ),
      TransactionStatus.canceled => (DtAlertSeverity.neutral, l10n.paymentCanceled),
      _ => (DtAlertSeverity.info, l10n.paymentWaiting),
    };

    return DtPage(
      title: l10n.paymentTitle,
      onBack: () => context.go(Routes.home),
      actions: switch (status) {
        TransactionStatus.succeeded => [
          // « Voir mon abonnement ».
          DtButton(label: l10n.paymentSeeSubscription, onPressed: () => context.go(Routes.subscription)),
        ],
        TransactionStatus.failed || TransactionStatus.canceled => [
          // « Réessayer »: back to the plans.
          DtButton(label: l10n.paymentRetry, onPressed: () => context.pushReplacement(Routes.plans)),
          // « Autre moyen de paiement »: back to the review of the same plan.
          DtButton(
            label: l10n.paymentOtherMethod,
            variant: DtButtonVariant.secondary,
            onPressed: pending == null
                ? null
                : () => context.pushReplacement(Routes.subscriptionReview(pending.planId)),
          ),
        ],
        _ => [
          // « Vérifier »: asks the payment status now.
          DtButton(label: l10n.paymentCheck, loading: _checking, onPressed: _check),
          if (pending != null)
            // « Rouvrir la page de paiement ».
            DtButton(
              label: l10n.paymentReopen,
              variant: DtButtonVariant.secondary,
              onPressed: () => launchUrl(Uri.parse(pending.redirectUrl), mode: LaunchMode.externalApplication),
            ),
        ],
      },
      children: [
        DtAlert(severity: severity, body: body),
        if (status == TransactionStatus.pending) ...[
          const SizedBox(height: DtSpace.s4),
          const LinearProgressIndicator(),
          const SizedBox(height: DtSpace.s3),
          Text(l10n.paymentWaitingNote, style: DtType.body.copyWith(color: colors.inkSecondary)),
        ],
        const SizedBox(height: DtSpace.s4),
        Text(widget.transactionId, style: DtType.mono.copyWith(color: colors.inkMuted)),
      ],
    );
  }
}
