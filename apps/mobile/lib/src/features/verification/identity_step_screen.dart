import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/api/generated/models/professional_type.dart';
import '../../core/api/generated/models/verification_case_dto.dart';
import '../../core/api/generated/models/verification_declared_details_dto_document_kind.dart';
import '../../core/api/generated/models/verification_details_dto.dart';
import '../../core/api/generated/models/verification_details_dto_document_kind.dart';
import '../../core/api/generated/models/verification_step_type.dart';
import '../../core/api/generated/models/verification_type.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/dt_page.dart';
import '../../ui/error_text.dart';
import '../../ui/segmented_control.dart';
import '../../ui/tokens.dart';
import 'case_draft_builder.dart';
import 'document_slot.dart';
import 'verification_controller.dart';
import 'verification_repository.dart';

/// ScreenVerifyIdentity: step 1 of 3. Biometric ID card or passport (or a student card for
/// medical students), camera first, with the on-device legibility and name check.
class IdentityStepScreen extends StatelessWidget {
  const IdentityStepScreen({super.key});

  @override
  Widget build(BuildContext context) => CaseDraftBuilder(
    type: VerificationType.identity,
    builder: (context, draft) => _IdentityStep(draft: draft),
  );
}

class _IdentityStep extends ConsumerStatefulWidget {
  const _IdentityStep({required this.draft});

  final VerificationCaseDto draft;

  @override
  ConsumerState<_IdentityStep> createState() => _IdentityStepState();
}

class _IdentityStepState extends ConsumerState<_IdentityStep> {
  late VerificationDetailsDtoDocumentKind _kind = switch (widget.draft.details.documentKind) {
    VerificationDeclaredDetailsDtoDocumentKind.passport => VerificationDetailsDtoDocumentKind.passport,
    VerificationDeclaredDetailsDtoDocumentKind.studentCard => VerificationDetailsDtoDocumentKind.studentCard,
    _ => VerificationDetailsDtoDocumentKind.nationalId,
  };
  bool _saving = false;
  ApiError? _error;

  bool _provided(VerificationStepType step) => widget.draft.documents.any((document) => document.stepType == step);

  Future<void> _changeKind(VerificationDetailsDtoDocumentKind kind) async {
    setState(() => _kind = kind);
    if (kind != VerificationDetailsDtoDocumentKind.passport) return;
    // A passport has one identity page: a back side captured for a card no longer applies.
    final back = widget.draft.documents.where((d) => d.stepType == VerificationStepType.identityBack).firstOrNull;
    if (back == null) return;
    final updated = await ref.read(verificationRepositoryProvider).removeDocument(widget.draft.id, back.id);
    ref.read(verificationControllerProvider.notifier).replace(updated);
  }

  Future<void> _continue() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final updated = await ref
          .read(verificationRepositoryProvider)
          .saveDetails(widget.draft.id, VerificationDetailsDto(documentKind: _kind));
      ref.read(verificationControllerProvider.notifier).replace(updated);
      if (mounted) await context.push(Routes.verificationStatusStep);
    } catch (error) {
      if (mounted) setState(() => _error = ApiError.from(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final student = ref.watch(verificationControllerProvider).value?.professionalType == ProfessionalType.student;
    final passport = _kind == VerificationDetailsDtoDocumentKind.passport;
    final frontLabel = passport ? l10n.verificationIdentityPassportPage : l10n.verificationIdentityFront;
    final frontDocument = widget.draft.documents
        .where((d) => d.stepType == VerificationStepType.identityFront)
        .firstOrNull;
    final backDocument = widget.draft.documents
        .where((d) => d.stepType == VerificationStepType.identityBack)
        .firstOrNull;

    return DtPage(
      eyebrow: '${l10n.commonStepOf('1', '3')} · ${l10n.verificationIdentityStep}',
      title: l10n.verificationIdentityTitle,
      intro: student ? l10n.verificationIdentityIntroStudent : l10n.verificationIdentityIntro,
      trailing: TextButton(
        onPressed: () => context.go(Routes.home),
        child: Text(l10n.commonLater, style: DtType.bodyStrong.copyWith(color: colors.onHero)),
      ),
      actions: [
        if (_error != null) DtAlert(severity: DtAlertSeverity.critical, body: commonErrorText(context, _error!)),
        DtButton(
          label: l10n.commonContinue,
          loading: _saving,
          onPressed: _provided(VerificationStepType.identityFront) ? _continue : null,
        ),
      ],
      children: [
        DtSegmentedControl<VerificationDetailsDtoDocumentKind>(
          semanticLabel: l10n.verificationIdentityKind,
          selected: _kind,
          onChanged: _changeKind,
          segments: [
            DtSegment(
              value: VerificationDetailsDtoDocumentKind.nationalId,
              label: l10n.verificationIdentityKindNationalId,
            ),
            DtSegment(value: VerificationDetailsDtoDocumentKind.passport, label: l10n.verificationIdentityKindPassport),
            if (student)
              DtSegment(
                value: VerificationDetailsDtoDocumentKind.studentCard,
                label: l10n.verificationIdentityKindStudentCard,
              ),
          ],
        ),
        const SizedBox(height: DtSpace.s6),
        DocumentSlot(
          key: const ValueKey('identity-front'),
          caseId: widget.draft.id,
          stepType: VerificationStepType.identityFront,
          label: frontLabel,
          requiredMark: l10n.commonRequired,
          document: frontDocument,
        ),
        if (!passport) ...[
          const SizedBox(height: DtSpace.s4),
          DocumentSlot(
            key: const ValueKey('identity-back'),
            caseId: widget.draft.id,
            stepType: VerificationStepType.identityBack,
            label: '${l10n.verificationIdentityBack} · ${l10n.commonOptional}',
            document: backDocument,
          ),
        ],
        const SizedBox(height: DtSpace.s6),
        Text(l10n.verificationPrivacy, style: DtType.caption.copyWith(color: colors.inkMuted)),
      ],
    );
  }
}
