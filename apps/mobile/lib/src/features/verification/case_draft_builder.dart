import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_error.dart';
import '../../core/api/generated/models/verification_case_dto.dart';
import '../../core/api/generated/models/verification_type.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/error_text.dart';
import 'verification_controller.dart';

/// Opens (or resumes) the draft case of [type], then builds the step with it. The case shown is
/// always the latest one held by the controller, so uploads elsewhere refresh this step.
class CaseDraftBuilder extends ConsumerStatefulWidget {
  const CaseDraftBuilder({required this.type, required this.builder, super.key});

  final VerificationType type;
  final Widget Function(BuildContext context, VerificationCaseDto draft) builder;

  @override
  ConsumerState<CaseDraftBuilder> createState() => _CaseDraftBuilderState();
}

class _CaseDraftBuilderState extends ConsumerState<CaseDraftBuilder> {
  late Future<VerificationCaseDto> _opening = _open();

  Future<VerificationCaseDto> _open() => ref.read(verificationControllerProvider.notifier).draftFor(widget.type);

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return FutureBuilder<VerificationCaseDto>(
      future: _opening,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Scaffold(
            body: SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(DtSpace.s4),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    DtAlert(
                      severity: DtAlertSeverity.critical,
                      body: commonErrorText(context, ApiError.from(snapshot.error!)),
                    ),
                    const SizedBox(height: DtSpace.s4),
                    DtButton(label: l10n.commonRetry, onPressed: () => setState(() => _opening = _open())),
                  ],
                ),
              ),
            ),
          );
        }
        final opened = snapshot.data;
        if (opened == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
        final latest = ref.watch(verificationControllerProvider).value?.stateOf(widget.type).latest;
        return widget.builder(context, latest != null && latest.id == opened.id ? latest : opened);
      },
    );
  }
}
