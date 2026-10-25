import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/doktool_tokens.dart';
import 'tokens.dart';

/// The kinds of alert, each with its colour and icon.
enum DtAlertSeverity { critical, warning, info, success, offline, neutral }

/// Alert · Banner: icon + optional title + body. Critical is for blocking validation and real
/// failures only — never for subscriptions or locked content.
class DtAlert extends StatelessWidget {
  const DtAlert({required this.severity, required this.body, this.title, this.action, super.key});

  final DtAlertSeverity severity;
  final String? title;
  final String body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final (background, accent, icon) = switch (severity) {
      DtAlertSeverity.critical => (colors.criticalSoft, colors.critical, LucideIcons.circleAlert),
      DtAlertSeverity.warning => (colors.warningSoft, colors.warning, LucideIcons.triangleAlert),
      DtAlertSeverity.info => (colors.infoSoft, colors.info, LucideIcons.info),
      DtAlertSeverity.success => (colors.successSoft, colors.success, LucideIcons.circleCheck),
      DtAlertSeverity.offline => (colors.surfaceSunken, colors.inkSecondary, LucideIcons.wifiOff),
      DtAlertSeverity.neutral => (colors.surfaceSunken, colors.inkSecondary, LucideIcons.info),
    };
    return Semantics(
      liveRegion: severity == DtAlertSeverity.critical,
      container: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(DtSpace.s3),
        decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(DtRadius.md)),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: DtSpace.s5, color: accent),
            const SizedBox(width: DtSpace.s2),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (title != null) Text(title!, style: DtType.bodyStrong.copyWith(color: colors.ink)),
                  Text(body, style: DtType.body.copyWith(color: colors.inkSecondary)),
                  if (action != null) ...[const SizedBox(height: DtSpace.s2), action!],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
