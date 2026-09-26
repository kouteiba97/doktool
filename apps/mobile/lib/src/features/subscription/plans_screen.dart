import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_error.dart';
import '../../core/api/generated/models/checkout_eligibility.dart';
import '../../core/api/generated/models/plan_dto.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/dt_page.dart';
import '../../ui/error_text.dart';
import '../../ui/skeleton.dart';
import '../../ui/tokens.dart';
import 'subscription_data.dart';
import '../../core/auth/session_controller.dart';

/// ScreenPlans « Offres »: for each plan what it includes and does not include, duration, price
/// with taxes and access level. Calm: no ribbon, countdown or fake scarcity (Lock L39). Choosing a
/// plan is possible only once professional verification is VERIFIED (ADR-006 Q6).
class PlansScreen extends ConsumerWidget {
  const PlansScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final plans = ref.watch(plansProvider);
    return DtPage(
      title: l10n.plansTitle,
      children: [
        ...plans.when(
          loading: () => [const SkeletonRows(count: 4)],
          error: (error, _) => [
            DtAlert(severity: DtAlertSeverity.neutral, body: commonErrorText(context, ApiError.from(error))),
            const SizedBox(height: DtSpace.s3),
            DtButton(
              label: l10n.commonRetry,
              variant: DtButtonVariant.secondary,
              onPressed: () => ref.invalidate(plansProvider),
            ),
          ],
          data: (data) {
            final state = data.eligibility.state;
            final note = switch (state) {
              CheckoutEligibility.studentFree => l10n.plansStudentNote,
              CheckoutEligibility.verificationRequired ||
              CheckoutEligibility.roleRequired => l10n.plansVerificationNote,
              CheckoutEligibility.verificationPending => l10n.plansPendingNote,
              CheckoutEligibility.accountRequired => l10n.plansAccountNote,
              CheckoutEligibility.active => l10n.plansActiveNote(dateText(context, data.eligibility.renewableFrom)),
              _ => null,
            };
            return [
              if (note != null) ...[
                DtAlert(severity: DtAlertSeverity.info, body: note),
                const SizedBox(height: DtSpace.s4),
              ],
              if (data.plans.isEmpty && state != CheckoutEligibility.studentFree)
                Text(l10n.plansEmpty, style: DtType.body.copyWith(color: colors.inkMuted)),
              for (final plan in data.plans) ...[
                _PlanCard(plan: plan, state: state),
                const SizedBox(height: DtSpace.s3),
              ],
              if (data.plans.isNotEmpty)
                Text(l10n.plansNoRefund, style: DtType.caption.copyWith(color: colors.inkMuted)),
            ];
          },
        ),
      ],
    );
  }
}

class _PlanCard extends ConsumerWidget {
  const _PlanCard({required this.plan, required this.state});

  final PlanDto plan;
  final CheckoutEligibility state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final english = Localizations.localeOf(context).languageCode == 'en';
    final includes = english ? plan.includesEn : plan.includesFr;
    final excludes = english ? plan.excludesEn : plan.excludesFr;

    Widget line(IconData icon, Color color, String text) => Padding(
      padding: const EdgeInsets.only(top: DtSpace.s1),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: DtSpace.s4, color: color),
          const SizedBox(width: DtSpace.s2),
          Expanded(
            child: Text(text, style: DtType.body.copyWith(color: colors.inkSecondary)),
          ),
        ],
      ),
    );

    final Widget action = switch (state) {
      CheckoutEligibility.open => DtButton(
        label: l10n.plansChoose,
        onPressed: () => context.push(Routes.subscriptionReview(plan.id)),
      ),
      CheckoutEligibility.verificationRequired ||
      CheckoutEligibility.verificationPending ||
      CheckoutEligibility.roleRequired => DtButton(
        label: l10n.plansVerificationRequired,
        variant: DtButtonVariant.secondary,
        onPressed: () => context.push(Routes.verificationStatus),
      ),
      CheckoutEligibility.accountRequired => DtButton(
        label: l10n.lockCreateAccount,
        variant: DtButtonVariant.secondary,
        onPressed: () => ref.read(sessionControllerProvider.notifier).signOut(),
      ),
      _ => const SizedBox.shrink(),
    };

    return Container(
      padding: const EdgeInsets.all(DtSpace.s4),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(DtRadius.md),
        border: Border.all(color: colors.border, width: DtBorder.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(english ? plan.nameEn : plan.nameFr, style: DtType.heading.copyWith(color: colors.ink)),
          const SizedBox(height: DtSpace.s1),
          Text(
            l10n.plansPrice(moneyText(context, plan.priceMinor, plan.currency)),
            style: DtType.title.copyWith(color: colors.ink),
          ),
          Text(durationText(l10n, plan.durationDays), style: DtType.caption.copyWith(color: colors.inkMuted)),
          const SizedBox(height: DtSpace.s3),
          Text(l10n.plansAccess, style: DtType.body.copyWith(color: colors.ink)),
          if (includes.isNotEmpty) ...[
            const SizedBox(height: DtSpace.s3),
            Text(l10n.plansIncludes, style: DtType.label.copyWith(color: colors.inkMuted)),
            for (final item in includes) line(LucideIcons.check, colors.teal, item),
          ],
          if (excludes.isNotEmpty) ...[
            const SizedBox(height: DtSpace.s3),
            Text(l10n.plansExcludes, style: DtType.label.copyWith(color: colors.inkMuted)),
            for (final item in excludes) line(LucideIcons.minus, colors.inkMuted, item),
          ],
          const SizedBox(height: DtSpace.s4),
          action,
        ],
      ),
    );
  }
}
