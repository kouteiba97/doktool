import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/models/checkout_eligibility.dart';
import '../../core/api/generated/models/subscription_dto.dart';
import '../../core/api/generated/models/subscription_status.dart';
import '../../core/api/generated/models/transaction_dto.dart';
import '../../core/api/generated/models/transaction_status.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_badge.dart';
import '../../ui/dt_button.dart';
import '../../ui/dt_page.dart';
import '../../ui/error_text.dart';
import '../../ui/skeleton.dart';
import '../../ui/tokens.dart';
import 'subscription_data.dart';

/// ScreenSubscriptionMobile: plan, status as a neutral or teal badge, period, access, renewal
/// information and the payments. Calm by design: no red, no countdown, no promotion, and no refund
/// request anywhere (ADR-005).
class SubscriptionScreen extends ConsumerWidget {
  const SubscriptionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final overview = ref.watch(subscriptionOverviewProvider);
    return DtPage(
      title: l10n.subscriptionTitle,
      children: overview.when(
        loading: () => [const SkeletonRows(count: 5)],
        error: (error, _) => [
          DtAlert(severity: DtAlertSeverity.neutral, body: commonErrorText(context, ApiError.from(error))),
          const SizedBox(height: DtSpace.s3),
          DtButton(
            label: l10n.commonRetry,
            variant: DtButtonVariant.secondary,
            onPressed: () => ref.invalidate(subscriptionOverviewProvider),
          ),
        ],
        data: (data) => [
          if (data.subscription == null)
            Text(l10n.subscriptionNone, style: DtType.body.copyWith(color: context.colors.inkSecondary))
          else
            _Current(subscription: data.subscription!),
          const SizedBox(height: DtSpace.s4),
          if (data.eligibility.state == CheckoutEligibility.open)
            DtButton(
              label: data.subscription == null ? l10n.lockSeePlans : l10n.subscriptionRenew,
              onPressed: () => context.push(Routes.plans),
            )
          else if (data.eligibility.state == CheckoutEligibility.active)
            Text(
              l10n.subscriptionRenewFrom(dateText(context, data.eligibility.renewableFrom)),
              style: DtType.body.copyWith(color: context.colors.inkSecondary),
            ),
          if (data.subscription?.status == SubscriptionStatus.active) ...[
            const SizedBox(height: DtSpace.s2),
            DtButton(
              label: l10n.subscriptionStopRenewal,
              variant: DtButtonVariant.ghost,
              onPressed: () => _stopRenewal(context, ref),
            ),
          ],
          if (data.transactions.isNotEmpty) ...[
            const SizedBox(height: DtSpace.s6),
            Semantics(
              header: true,
              child: Text(l10n.subscriptionHistory, style: DtType.heading.copyWith(color: context.colors.ink)),
            ),
            for (final transaction in data.transactions) _TransactionRow(transaction: transaction),
          ],
        ],
      ),
    );
  }

  Future<void> _stopRenewal(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        content: Text(l10n.subscriptionStopRenewalConfirm),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialog).pop(false), child: Text(l10n.commonCancel)),
          TextButton(onPressed: () => Navigator.of(dialog).pop(true), child: Text(l10n.subscriptionStopRenewal)),
        ],
      ),
    );
    if (confirmed != true) return;
    await ref.read(apiProvider).subscription.billingControllerStopRenewal();
    ref.invalidate(subscriptionOverviewProvider);
  }
}

class _Current extends StatelessWidget {
  const _Current({required this.subscription});

  final SubscriptionDto subscription;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final english = Localizations.localeOf(context).languageCode == 'en';
    final end = dateText(context, subscription.currentPeriodEnd);
    final (badge, line) = switch (subscription.status) {
      SubscriptionStatus.active => (
        DtBadge(text: l10n.subscriptionStatusActive, variant: DtBadgeVariant.teal, icon: LucideIcons.badgeCheck),
        l10n.subscriptionStatusRenewsOn(end),
      ),
      SubscriptionStatus.grace => (
        DtBadge(text: l10n.subscriptionStatusGrace, variant: DtBadgeVariant.info),
        l10n.subscriptionGraceUntil(dateText(context, subscription.graceEndsAt)),
      ),
      SubscriptionStatus.canceled => (
        DtBadge(text: l10n.subscriptionStatusCanceled, variant: DtBadgeVariant.neutral),
        l10n.subscriptionStopped(end),
      ),
      _ => (DtBadge(text: l10n.subscriptionStatusEnded), l10n.subscriptionEndedNote),
    };
    return Container(
      padding: const EdgeInsets.all(DtSpace.s4),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(DtRadius.xl),
        border: Border.all(color: colors.glassHighlight, width: DtBorder.hairline),
        boxShadow: context.elevation.glass,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  english ? subscription.plan.nameEn : subscription.plan.nameFr,
                  style: DtType.heading.copyWith(color: colors.ink),
                ),
              ),
              badge,
            ],
          ),
          const SizedBox(height: DtSpace.s1),
          Text(line, style: DtType.body.copyWith(color: colors.inkSecondary)),
          if (subscription.currentPeriodStart != null)
            Text(
              l10n.subscriptionPeriod(dateText(context, subscription.currentPeriodStart), end),
              style: DtType.caption.copyWith(color: colors.inkMuted),
            ),
          const SizedBox(height: DtSpace.s2),
          Text(l10n.plansAccess, style: DtType.caption.copyWith(color: colors.inkSecondary)),
          Text(l10n.reviewRenewalManual, style: DtType.caption.copyWith(color: colors.inkSecondary)),
        ],
      ),
    );
  }
}

class _TransactionRow extends StatelessWidget {
  const _TransactionRow({required this.transaction});

  final TransactionDto transaction;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final status = switch (transaction.status) {
      TransactionStatus.pending => l10n.subscriptionTransactionPending,
      TransactionStatus.failed => l10n.subscriptionTransactionFailed,
      TransactionStatus.canceled => l10n.subscriptionTransactionCanceled,
      _ => null,
    };
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(
        l10n.subscriptionTransactionLine(
          dateText(context, transaction.paymentDate ?? transaction.createdAt),
          moneyText(context, transaction.amountMinor, transaction.currency),
          methodText(l10n, transaction.paymentMethod),
        ),
        style: DtType.body.copyWith(color: colors.ink),
      ),
      subtitle: Text(
        [transaction.transactionId, ?status].join(' · '),
        style: DtType.mono.copyWith(color: colors.inkMuted),
      ),
    );
  }
}
