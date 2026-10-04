import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_error.dart';
import '../../core/api/generated/models/verification_case_dto.dart';
import '../../core/api/generated/models/verification_overview_dto.dart';
import '../../core/api/generated/models/verification_status.dart';
import '../../core/api/generated/models/verification_type.dart';
import '../../core/api/generated/models/verification_type_state_dto.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_badge.dart';
import '../../ui/dt_button.dart';
import '../../ui/dt_page.dart';
import '../../ui/error_text.dart';
import '../../ui/tokens.dart';
import 'verification_controller.dart';
import 'verification_labels.dart';
import '../../core/api/generated/models/professional_type.dart';

/// A verified case expiring within this many days shows « Expire bientôt » (section 06).
const _expiringWindow = Duration(days: 60);

enum _Overall { toDo, inReview, verified, toRedo }

/// ScreenVerifyOutcomes « Statut »: identity and status as separate cases, each with its
/// timeline (Reçu → En cours de revue → Décision), the reason of a refusal in plain words and one
/// action. `critical` is kept for a definitive refusal only; a fixable step is `warning`.
class VerificationStatusScreen extends ConsumerWidget {
  const VerificationStatusScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final overview = ref.watch(verificationControllerProvider);
    return overview.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (error, _) => DtPage(
        title: l10n.verificationTitle,
        actions: [DtButton(label: l10n.commonRetry, onPressed: () => ref.invalidate(verificationControllerProvider))],
        children: [DtAlert(severity: DtAlertSeverity.critical, body: commonErrorText(context, ApiError.from(error)))],
      ),
      data: (overview) {
        final overall = _overallOf(overview);
        return DtPage(
          title: l10n.verificationTitle,
          onBack: () => context.canPop() ? context.pop() : context.go(Routes.home),
          children: [
            Align(alignment: AlignmentDirectional.centerStart, child: _overallBadge(l10n, overall)),
            const SizedBox(height: DtSpace.s4),
            RefreshIndicator(
              onRefresh: () => ref.read(verificationControllerProvider.notifier).reload(),
              child: Column(
                children: [
                  for (final type in overview.relevantTypes) ...[
                    _CaseCard(state: overview.stateOf(type), overview: overview),
                    const SizedBox(height: DtSpace.s3),
                  ],
                ],
              ),
            ),
            if (overall == _Overall.verified && overview.professionalType != ProfessionalType.student)
              DtButton(label: l10n.verificationActionSeePlans, onPressed: () => context.push(Routes.plans)),
            if (overall == _Overall.inReview)
              Text(l10n.verificationWaitingNote, style: DtType.body.copyWith(color: colors.inkSecondary)),
          ],
        );
      },
    );
  }

  _Overall _overallOf(VerificationOverviewDto overview) {
    final latest = [for (final type in overview.relevantTypes) overview.stateOf(type).latest?.status];
    if (latest.contains(VerificationStatus.rejected) || latest.contains(VerificationStatus.expired)) {
      return _Overall.toRedo;
    }
    if (latest.every((status) => status == VerificationStatus.verified)) return _Overall.verified;
    if (latest.any(pendingStatuses.contains)) return _Overall.inReview;
    return _Overall.toDo;
  }

  Widget _overallBadge(AppLocalizations l10n, _Overall overall) => switch (overall) {
    _Overall.toDo => DtBadge(text: l10n.verificationBadgeToDo, icon: LucideIcons.circleDashed),
    _Overall.inReview => DtBadge(
      text: l10n.verificationBadgeInReview,
      variant: DtBadgeVariant.info,
      icon: LucideIcons.clock,
    ),
    _Overall.verified => DtBadge(
      text: l10n.verificationBadgeVerified,
      variant: DtBadgeVariant.teal,
      icon: LucideIcons.badgeCheck,
    ),
    _Overall.toRedo => DtBadge(
      text: l10n.verificationBadgeToRedo,
      variant: DtBadgeVariant.warning,
      icon: LucideIcons.rotateCcw,
    ),
  };
}

class _CaseCard extends ConsumerStatefulWidget {
  const _CaseCard({required this.state, required this.overview});

  final VerificationTypeStateDto state;
  final VerificationOverviewDto overview;

  @override
  ConsumerState<_CaseCard> createState() => _CaseCardState();
}

class _CaseCardState extends ConsumerState<_CaseCard> {
  bool _busy = false;
  String? _message;

  String get _stepRoute =>
      widget.state.type == VerificationType.identity ? Routes.verificationIdentity : Routes.verificationStatusStep;

  Future<void> _run(Future<void> Function() action, {String? done}) async {
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      await action();
      if (mounted && done != null) setState(() => _message = done);
    } catch (error) {
      if (mounted) setState(() => _message = commonErrorText(context, ApiError.from(error)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmErase(VerificationCaseDto latest) async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        content: Text(l10n.verificationEraseConfirm),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(l10n.commonCancel)),
          TextButton(onPressed: () => Navigator.of(context).pop(true), child: Text(l10n.verificationActionErase)),
        ],
      ),
    );
    if (confirmed != true) return;
    await _run(() => ref.read(verificationControllerProvider.notifier).erase(latest.id), done: l10n.verificationErased);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final latest = widget.state.latest;
    final status = latest?.status;
    final now = DateTime.now();
    final expiresAt = latest?.expiresAt;
    final expiring =
        status == VerificationStatus.verified && expiresAt != null && expiresAt.difference(now) <= _expiringWindow;
    final decided =
        status == VerificationStatus.verified ||
        status == VerificationStatus.rejected ||
        status == VerificationStatus.expired;

    final (badge, line) = switch (status) {
      null => (DtBadge(text: l10n.verificationBadgeToDo), l10n.verificationLineNotStarted),
      VerificationStatus.notStarted => (
        DtBadge(text: l10n.verificationBadgeDraft, icon: LucideIcons.pencil),
        l10n.verificationLineDraft,
      ),
      VerificationStatus.submitted => (
        DtBadge(text: l10n.verificationBadgeInReview, variant: DtBadgeVariant.info, icon: LucideIcons.clock),
        l10n.verificationLineReceived(dateText(context, latest!.submittedAt)),
      ),
      VerificationStatus.inReview => (
        DtBadge(text: l10n.verificationBadgeInReview, variant: DtBadgeVariant.info, icon: LucideIcons.clock),
        l10n.verificationLineInReview,
      ),
      VerificationStatus.appealed => (
        DtBadge(text: l10n.verificationBadgeAppealed, variant: DtBadgeVariant.info, icon: LucideIcons.clock),
        l10n.verificationLineAppealed(dateText(context, latest!.appealedAt)),
      ),
      VerificationStatus.verified => (
        expiring
            ? DtBadge(text: l10n.verificationBadgeExpiring, variant: DtBadgeVariant.warning, icon: LucideIcons.clock)
            : DtBadge(text: l10n.verificationBadgeVerified, variant: DtBadgeVariant.teal, icon: LucideIcons.badgeCheck),
        expiresAt != null
            ? '${l10n.verificationLineVerifiedOn(dateText(context, latest!.decidedAt))} · '
                  '${l10n.verificationLineValidUntil(dateText(context, expiresAt))}'
            : l10n.verificationLineVerifiedOn(dateText(context, latest!.decidedAt)),
      ),
      VerificationStatus.rejected => (
        DtBadge(text: l10n.verificationBadgeToRedo, variant: DtBadgeVariant.warning, icon: LucideIcons.rotateCcw),
        l10n.verificationOneStepToRedo,
      ),
      VerificationStatus.expired => (
        DtBadge(text: l10n.verificationBadgeExpired, variant: DtBadgeVariant.warning, icon: LucideIcons.clock),
        l10n.verificationLineExpired(dateText(context, latest!.expiresAt)),
      ),
      _ => (DtBadge(text: l10n.verificationBadgeToDo), l10n.verificationLineNotStarted),
    };

    final identity = widget.overview.stateOf(VerificationType.identity).latest;
    final actions = <Widget>[
      if (status == null || status == VerificationStatus.notStarted)
        DtButton(
          label: status == null ? l10n.verificationActionStart : l10n.verificationActionContinue,
          onPressed: _busy ? null : () => context.push(_stepRoute),
        ),
      if (status == VerificationStatus.rejected && widget.state.canStart)
        DtButton(label: l10n.verificationActionCorrect, onPressed: _busy ? null : () => context.push(_stepRoute)),
      if (latest?.canAppeal ?? false)
        DtButton(
          label: l10n.verificationActionAppeal,
          variant: DtButtonVariant.secondary,
          loading: _busy,
          onPressed: () => _run(() => ref.read(verificationControllerProvider.notifier).appeal(latest!.id)),
        ),
      if ((status == VerificationStatus.expired || expiring) && widget.state.canStart)
        DtButton(label: l10n.verificationActionRenew, onPressed: _busy ? null : () => context.push(_stepRoute)),
    ];

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
                child: Text(caseName(l10n, widget.state.type), style: DtType.heading.copyWith(color: colors.ink)),
              ),
              badge,
              if (decided && (latest?.documents.isNotEmpty ?? false))
                PopupMenuButton<void>(
                  tooltip: l10n.verificationActionErase,
                  icon: Icon(LucideIcons.ellipsisVertical, color: colors.inkSecondary),
                  itemBuilder: (context) => [
                    PopupMenuItem<void>(onTap: () => _confirmErase(latest!), child: Text(l10n.verificationActionErase)),
                  ],
                ),
            ],
          ),
          const SizedBox(height: DtSpace.s1),
          Text(line, style: DtType.body.copyWith(color: colors.inkSecondary)),
          if (status != null && pendingStatuses.contains(status)) ...[
            const SizedBox(height: DtSpace.s3),
            _Timeline(status: status, submittedAt: latest!.submittedAt),
          ],
          if (status == VerificationStatus.rejected && latest!.rejection != null) ...[
            const SizedBox(height: DtSpace.s3),
            DtAlert(
              severity: DtAlertSeverity.warning,
              title: rejectionReason(l10n, latest.rejection!.reasonCode),
              body: [
                if (latest.rejection!.note != null) latest.rejection!.note!,
                if (widget.state.type != VerificationType.identity && identity?.status == VerificationStatus.verified)
                  l10n.verificationIdentityStillVerified,
              ].join(' '),
            ),
            if (latest.canAppeal) ...[
              const SizedBox(height: DtSpace.s2),
              Text(l10n.verificationAppealNote, style: DtType.caption.copyWith(color: colors.inkMuted)),
            ],
          ],
          if (_message != null) ...[
            const SizedBox(height: DtSpace.s2),
            Text(_message!, style: DtType.caption.copyWith(color: colors.inkSecondary)),
          ],
          for (final action in actions) ...[const SizedBox(height: DtSpace.s3), action],
        ],
      ),
    );
  }
}

/// Reçu → En cours de revue → Décision, with the current step marked.
class _Timeline extends StatelessWidget {
  const _Timeline({required this.status, required this.submittedAt});

  final VerificationStatus status;
  final DateTime? submittedAt;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final reviewing = status == VerificationStatus.inReview || status == VerificationStatus.appealed;
    final steps = [
      (l10n.verificationTimelineReceived, true, dateText(context, submittedAt)),
      (l10n.verificationTimelineReview, reviewing, ''),
      (l10n.verificationTimelineDecision, false, ''),
    ];
    return Column(
      children: [
        for (final (index, step) in steps.indexed)
          Semantics(
            label: step.$1,
            selected: step.$2,
            child: Row(
              children: [
                Icon(
                  step.$2 ? LucideIcons.circleCheck : LucideIcons.circle,
                  size: DtSpace.s5,
                  color: step.$2 ? colors.teal : colors.inkMuted,
                ),
                const SizedBox(width: DtSpace.s2),
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(bottom: index < steps.length - 1 ? DtSpace.s2 : 0),
                    child: Text(
                      step.$3.isEmpty ? step.$1 : '${step.$1} · ${step.$3}',
                      style: (step.$2 ? DtType.bodyStrong : DtType.body).copyWith(
                        color: step.$2 ? colors.ink : colors.inkMuted,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
