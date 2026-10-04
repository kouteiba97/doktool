import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_error.dart';
import '../../core/api/generated/models/verification_case_dto.dart';
import '../../core/api/generated/models/verification_status.dart';
import '../../core/api/generated/models/verification_type.dart';
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

/// « Récapitulatif » (step 3 of 3): step checkmarks and file descriptions only, then « Envoyer ».
class SummaryScreen extends ConsumerStatefulWidget {
  const SummaryScreen({super.key});

  @override
  ConsumerState<SummaryScreen> createState() => _SummaryScreenState();
}

class _SummaryScreenState extends ConsumerState<SummaryScreen> {
  bool _sending = false;
  ApiError? _error;

  Future<void> _send() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref.read(verificationControllerProvider.notifier).submitDrafts();
      if (mounted) context.go(Routes.verificationStatus);
    } catch (error) {
      if (mounted) setState(() => _error = ApiError.from(error));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final overview = ref.watch(verificationControllerProvider).value;
    if (overview == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final drafts = [
      for (final type in overview.relevantTypes)
        if (overview.stateOf(type).latest case final latest? when latest.status == VerificationStatus.notStarted)
          latest,
    ];
    final complete = drafts.isNotEmpty && drafts.every(_complete);

    return DtPage(
      eyebrow: '${l10n.commonStepOf('3', '3')} · ${l10n.verificationSummaryStep}',
      title: l10n.verificationSummaryTitle,
      intro: l10n.verificationSummaryIntro,
      actions: [
        if (_error != null) DtAlert(severity: DtAlertSeverity.critical, body: commonErrorText(context, _error!)),
        DtButton(label: l10n.verificationSummarySend, loading: _sending, onPressed: complete ? _send : null),
      ],
      children: [
        for (final draft in drafts) ...[
          _SummaryCard(
            draft: draft,
            complete: _complete(draft),
            onEdit: () => context.push(
              draft.type == VerificationType.identity ? Routes.verificationIdentity : Routes.verificationStatusStep,
            ),
          ),
          const SizedBox(height: DtSpace.s3),
        ],
      ],
    );
  }

  bool _complete(VerificationCaseDto draft) {
    final hasDetails = draft.type == VerificationType.identity
        ? draft.details.documentKind != null
        : draft.details.specialtyId != null || draft.details.universityId != null;
    return hasDetails && draft.steps.where((step) => step.requiredValue).every((step) => step.provided);
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.draft, required this.complete, required this.onEdit});

  final VerificationCaseDto draft;
  final bool complete;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
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
                child: Text(caseName(l10n, draft.type), style: DtType.heading.copyWith(color: colors.ink)),
              ),
              DtBadge(
                text: complete ? l10n.verificationSummaryComplete : l10n.verificationSummaryIncomplete,
                variant: complete ? DtBadgeVariant.teal : DtBadgeVariant.warning,
                icon: complete ? LucideIcons.check : LucideIcons.circleDashed,
              ),
            ],
          ),
          const SizedBox(height: DtSpace.s2),
          for (final step in draft.steps)
            if (step.requiredValue || step.provided)
              Padding(
                padding: const EdgeInsets.only(bottom: DtSpace.s1),
                child: Row(
                  children: [
                    Icon(
                      step.provided ? LucideIcons.circleCheck : LucideIcons.circle,
                      size: DtSpace.s4,
                      color: step.provided ? colors.success : colors.inkMuted,
                    ),
                    const SizedBox(width: DtSpace.s2),
                    Expanded(
                      child: Text(
                        documentDescription(context, draft, step.stepType),
                        style: DtType.body.copyWith(color: colors.inkSecondary),
                      ),
                    ),
                  ],
                ),
              ),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: DtButton(
              label: l10n.verificationSummaryEdit,
              variant: DtButtonVariant.ghost,
              size: DtButtonSize.sm,
              expand: false,
              onPressed: onEdit,
            ),
          ),
        ],
      ),
    );
  }
}
