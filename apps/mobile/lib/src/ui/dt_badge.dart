import 'package:flutter/material.dart';

import '../theme/doktool_tokens.dart';
import 'tokens.dart';

enum DtBadgeVariant { neutral, brand, teal, success, warning, critical, info }

/// Badge (22 px): always a word, the colour only reinforces it. `critical` is for a definitive
/// rejection only; subscription states never use critical or warning (Lock L39).
class DtBadge extends StatelessWidget {
  const DtBadge({required this.text, this.variant = DtBadgeVariant.neutral, this.icon, super.key});

  final String text;
  final DtBadgeVariant variant;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final (background, foreground) = switch (variant) {
      DtBadgeVariant.neutral => (colors.surfaceSunken, colors.inkSecondary),
      DtBadgeVariant.brand => (colors.brandSoft, colors.brandStrong),
      DtBadgeVariant.teal => (colors.tealSoft, colors.tealStrong),
      DtBadgeVariant.success => (colors.successSoft, colors.success),
      DtBadgeVariant.warning => (colors.warningSoft, colors.warning),
      DtBadgeVariant.critical => (colors.criticalSoft, colors.critical),
      DtBadgeVariant.info => (colors.infoSoft, colors.info),
    };
    return Container(
      constraints: const BoxConstraints(minHeight: DtSpace.s5 + 2),
      padding: const EdgeInsets.symmetric(horizontal: DtSpace.s2, vertical: 2),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(DtRadius.sm)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 14, color: foreground), const SizedBox(width: DtSpace.s1)],
          Text(text, style: DtType.label.copyWith(color: foreground)),
        ],
      ),
    );
  }
}
