import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/models/content_report_dto.dart';
import '../../core/api/generated/models/content_report_reason.dart';
import '../../core/api/generated/models/profile_section.dart';
import '../../core/api/generated/models/substance_profile_dto.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/error_text.dart';
import '../../ui/tokens.dart';
import '../analytics/analytics_event.dart';

/// « Signaler une erreur » on the block being read: a reason and, if useful, a short comment for
/// the clinical team — never patient data (Lock L42).
Future<void> showReportSheet(
  BuildContext context, {
  required SubstanceProfileDto profile,
  required PregnancySection section,
}) {
  final colors = context.colors;
  return showModalBottomSheet<void>(
    // Above the floating tab bar (ADR-020), never under it.
    useRootNavigator: true,
    context: context,
    useSafeArea: true,
    isScrollControlled: true,
    backgroundColor: colors.surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(DtRadius.xl))),
    builder: (sheetContext) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(sheetContext).bottom),
      child: _ReportSheet(profile: profile, section: section),
    ),
  );
}

class _ReportSheet extends ConsumerStatefulWidget {
  const _ReportSheet({required this.profile, required this.section});

  final SubstanceProfileDto profile;
  final PregnancySection section;

  @override
  ConsumerState<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends ConsumerState<_ReportSheet> {
  final _comment = TextEditingController();
  ContentReportReason? _reason;
  bool _sending = false;
  ApiError? _error;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final comment = _comment.text.trim();
      await ref
          .read(apiProvider)
          .pregnancy
          .pregnancyControllerReport(
            id: widget.profile.id,
            body: ContentReportDto(
              section: widget.section == PregnancySection.pregnancy
                  ? ProfileSection.pregnancy
                  : ProfileSection.lactation,
              reason: _reason!,
              comment: comment.isEmpty ? null : comment,
            ),
          );
      navigator.pop();
      messenger.showSnackBar(SnackBar(content: Text(l10n.pregnancyReportSent)));
    } catch (error) {
      if (mounted) {
        setState(() {
          _sending = false;
          _error = ApiError.from(error);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final reasons = [
      (ContentReportReason.incorrect, l10n.pregnancyReasonIncorrect),
      (ContentReportReason.outdated, l10n.pregnancyReasonOutdated),
      (ContentReportReason.unclear, l10n.pregnancyReasonUnclear),
      (ContentReportReason.other, l10n.pregnancyReasonOther),
    ];
    return SingleChildScrollView(
      padding: const EdgeInsets.all(DtSpace.s5),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            header: true,
            child: Text(l10n.pregnancyReport, style: DtType.heading.copyWith(color: colors.ink)),
          ),
          const SizedBox(height: DtSpace.s1),
          Text(
            widget.section == PregnancySection.pregnancy
                ? l10n.pregnancyReportAboutPregnancy
                : l10n.pregnancyReportAboutLactation,
            style: DtType.body.copyWith(color: colors.inkSecondary),
          ),
          const SizedBox(height: DtSpace.s3),
          for (final (reason, label) in reasons)
            Semantics(
              selected: _reason == reason,
              inMutuallyExclusiveGroup: true,
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                minTileHeight: DtSize.touchMin,
                title: Text(label, style: DtType.body.copyWith(color: colors.ink)),
                trailing: _reason == reason
                    ? Icon(LucideIcons.circleCheck, color: colors.brand)
                    : Icon(LucideIcons.circle, color: colors.borderStrong),
                onTap: () => setState(() => _reason = reason),
              ),
            ),
          const SizedBox(height: DtSpace.s2),
          TextField(
            controller: _comment,
            maxLength: 500,
            maxLines: 3,
            minLines: 2,
            style: DtType.body.copyWith(color: colors.ink),
            decoration: InputDecoration(
              labelText: l10n.pregnancyReportComment,
              helperText: l10n.pregnancyReportNoPatientData,
              helperMaxLines: 2,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(DtRadius.md)),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: DtSpace.s2),
            DtAlert(severity: DtAlertSeverity.critical, body: commonErrorText(context, _error!)),
          ],
          const SizedBox(height: DtSpace.s4),
          DtButton(label: l10n.pregnancyReportSend, loading: _sending, onPressed: _reason == null ? null : _send),
        ],
      ),
    );
  }
}
