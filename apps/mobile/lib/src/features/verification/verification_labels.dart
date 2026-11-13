import 'package:flutter/widgets.dart';

import '../../core/api/generated/models/verification_case_dto.dart';
import '../../core/api/generated/models/verification_declared_details_dto_document_kind.dart';
import '../../core/api/generated/models/verification_rejection_reason.dart';
import '../../core/api/generated/models/verification_step_type.dart';
import '../../core/api/generated/models/verification_type.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../ui/error_text.dart';

/// The name of a case type.
String caseName(AppLocalizations l10n, VerificationType type) => switch (type) {
  VerificationType.identity => l10n.verificationCaseIdentity,
  VerificationType.studentStatus => l10n.verificationCaseStudent,
  _ => l10n.verificationCaseProfessional,
};

/// The name of a document step (« Page d'identité » for a passport).
String stepName(AppLocalizations l10n, VerificationCaseDto draft, VerificationStepType step) => switch (step) {
  VerificationStepType.identityFront =>
    draft.details.documentKind == VerificationDeclaredDetailsDtoDocumentKind.passport
        ? l10n.verificationIdentityPassportPage
        : l10n.verificationIdentityFront,
  VerificationStepType.identityBack => l10n.verificationIdentityBack,
  VerificationStepType.orderProof => l10n.verificationStatusOrderProof,
  VerificationStepType.residencyAttestation => l10n.verificationStatusResidencyProof,
  VerificationStepType.studentProof => l10n.verificationStatusStudentProof,
  _ => '',
};

/// « Recto · JPG · 1,1 Mo » — the file description shown instead of any image of the document.
String documentDescription(BuildContext context, VerificationCaseDto draft, VerificationStepType step) {
  final l10n = AppLocalizations.of(context);
  final document = draft.documents.where((candidate) => candidate.stepType == step).firstOrNull;
  final name = stepName(l10n, draft, step);
  if (document == null) return name;
  final type = switch (document.contentType) {
    'application/pdf' => 'PDF',
    'image/png' => 'PNG',
    _ => 'JPG',
  };
  return '$name · $type · ${sizeText(context, document.sizeBytes)}';
}

/// A refusal reason in plain words.
String rejectionReason(AppLocalizations l10n, VerificationRejectionReason reason) => switch (reason) {
  VerificationRejectionReason.illegible => l10n.verificationReasonIllegible,
  VerificationRejectionReason.documentExpired => l10n.verificationReasonDocumentExpired,
  VerificationRejectionReason.nameMismatch => l10n.verificationReasonNameMismatch,
  VerificationRejectionReason.wrongDocument => l10n.verificationReasonWrongDocument,
  VerificationRejectionReason.informationMismatch => l10n.verificationReasonInformationMismatch,
  _ => l10n.verificationReasonOther,
};
