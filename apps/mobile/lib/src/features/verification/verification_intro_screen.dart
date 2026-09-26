import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/generated/models/professional_type.dart';
import '../../core/api/generated/models/verification_status.dart';
import '../../core/api/generated/models/verification_type.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_button.dart';
import '../../ui/dt_page.dart';
import '../../ui/tokens.dart';
import '../onboarding/onboarding_draft.dart';
import 'verification_controller.dart';

/// Verification intro (section 06): why, what we check, where documents go, how long it takes.
/// One primary action; « Plus tard » is always available.
class VerificationIntroScreen extends ConsumerStatefulWidget {
  const VerificationIntroScreen({super.key});

  @override
  ConsumerState<VerificationIntroScreen> createState() => _VerificationIntroScreenState();
}

class _VerificationIntroScreenState extends ConsumerState<VerificationIntroScreen> {
  @override
  void initState() {
    super.initState();
    // Onboarding is over once verification is reached.
    Future.microtask(() => ref.read(onboardingDraftProvider.notifier).reset());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final overview = ref.watch(verificationControllerProvider).value;
    final type = overview?.professionalType;
    final what = switch (type) {
      ProfessionalType.resident => l10n.verificationIntroWhatResident,
      ProfessionalType.student => l10n.verificationIntroWhatStudent,
      _ => l10n.verificationIntroWhatDoctor,
    };
    final identity = overview?.stateOf(VerificationType.identity).latest;
    final identityDone =
        identity != null &&
        identity.status != VerificationStatus.notStarted &&
        identity.status != VerificationStatus.rejected &&
        identity.status != VerificationStatus.expired;

    Widget paragraph(String title, String body) => Padding(
      padding: const EdgeInsets.only(bottom: DtSpace.s4),
      child: DtSection(
        title: title,
        child: Text(body, style: DtType.body.copyWith(color: colors.inkSecondary)),
      ),
    );

    return DtPage(
      showBack: false,
      title: l10n.verificationTitle,
      trailing: TextButton(
        onPressed: () => context.go(Routes.home),
        child: Text(l10n.commonLater, style: DtType.bodyStrong.copyWith(color: colors.brand)),
      ),
      actions: [
        DtButton(
          label: l10n.verificationIntroStart,
          onPressed: overview == null
              ? null
              : () => context.push(identityDone ? Routes.verificationStatusStep : Routes.verificationIdentity),
        ),
      ],
      children: [
        paragraph(l10n.verificationIntroWhyTitle, l10n.verificationIntroWhy),
        paragraph(l10n.verificationIntroWhatTitle, what),
        paragraph(l10n.verificationIntroDocumentsTitle, l10n.verificationIntroDocuments),
        paragraph(l10n.verificationIntroDurationTitle, l10n.verificationIntroDuration),
      ],
    );
  }
}
