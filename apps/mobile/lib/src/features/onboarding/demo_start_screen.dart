import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_error.dart';
import '../../core/api/generated/models/demo_context.dart';
import '../../core/auth/session_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/dt_page.dart';
import '../../ui/error_text.dart';
import '../../ui/segmented_control.dart';
import '../../ui/tokens.dart';
import '../analytics/analytics_event.dart';
import '../analytics/analytics_recorder.dart';

/// ScreenDemo step 2 « Contexte professionnel »: the demo is an access context, never a
/// professional type. No sign-up, no personal data, no time limit (ADR-006 Q5).
class DemoStartScreen extends ConsumerStatefulWidget {
  const DemoStartScreen({super.key});

  @override
  ConsumerState<DemoStartScreen> createState() => _DemoStartScreenState();
}

class _DemoStartScreenState extends ConsumerState<DemoStartScreen> {
  DemoContext _context = DemoContext.doctor;
  bool _starting = false;
  ApiError? _error;

  Future<void> _start() async {
    setState(() {
      _starting = true;
      _error = null;
    });
    final analytics = ref.read(analyticsRecorderProvider);
    try {
      await ref.read(sessionControllerProvider.notifier).startDemo(_context);
      analytics.record(AnalyticsEvent.demoStarted(_context));
    } catch (error) {
      if (mounted) setState(() => _error = ApiError.from(error));
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final points = [
      (LucideIcons.search, l10n.demoPointNavigation),
      (LucideIcons.bookOpen, l10n.demoPointSample),
      (LucideIcons.lock, l10n.demoPointLocked),
      (LucideIcons.shieldCheck, l10n.demoPointPrivacy),
    ];
    return DtPage(
      title: l10n.demoTitle,
      intro: l10n.demoIntro,
      actions: [
        if (_error != null) DtAlert(severity: DtAlertSeverity.critical, body: commonErrorText(context, _error!)),
        DtButton(label: l10n.demoStart, loading: _starting, onPressed: _start),
      ],
      children: [
        // Read once, as the label of the choice below.
        ExcludeSemantics(
          child: Text(l10n.demoYouAre, style: DtType.label.copyWith(color: colors.inkSecondary)),
        ),
        const SizedBox(height: DtSpace.s1),
        DtSegmentedControl<DemoContext>(
          semanticLabel: l10n.demoYouAre,
          selected: _context,
          onChanged: (value) => setState(() => _context = value),
          segments: [
            DtSegment(value: DemoContext.doctor, label: l10n.roleDoctor),
            DtSegment(value: DemoContext.resident, label: l10n.roleResident),
          ],
        ),
        const SizedBox(height: DtSpace.s6),
        DtSection(
          title: l10n.demoInDemoTitle,
          child: Column(
            children: [
              for (final (icon, text) in points)
                Padding(
                  padding: const EdgeInsets.only(top: DtSpace.s2),
                  child: Row(
                    children: [
                      Icon(icon, size: DtSpace.s5, color: colors.brand),
                      const SizedBox(width: DtSpace.s3),
                      Expanded(
                        child: Text(text, style: DtType.body.copyWith(color: colors.inkSecondary)),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
