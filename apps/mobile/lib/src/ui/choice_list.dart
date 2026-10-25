import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/doktool_tokens.dart';
import 'segmented_control.dart';
import 'tokens.dart';

/// Exclusive choices as full-width rows, one per answer, the whole text visible (ADR-026). Used when
/// answers are too long for a [DtSegmentedControl] or more than four: a score's answers are read in
/// full and chosen in one tap. Selection is an icon and weight, never colour alone.
class DtChoiceList<T> extends StatelessWidget {
  const DtChoiceList({
    required this.segments,
    required this.selected,
    required this.onChanged,
    this.semanticLabel,
    super.key,
  });

  final List<DtSegment<T>> segments;
  final T? selected;
  final ValueChanged<T> onChanged;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Semantics(
      container: true,
      label: semanticLabel,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.glassTint,
          borderRadius: BorderRadius.circular(DtRadius.md),
          border: Border.all(color: colors.glassHighlight, width: DtBorder.hairline),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(DtRadius.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final (index, segment) in segments.indexed) ...[
                if (index > 0) Divider(height: DtBorder.hairline, thickness: DtBorder.hairline, color: colors.border),
                _ChoiceRow(
                  label: segment.label,
                  selected: segment.value == selected,
                  onTap: () => onChanged(segment.value),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// One answer with its radio mark.
class _ChoiceRow extends StatelessWidget {
  const _ChoiceRow({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Semantics(
      inMutuallyExclusiveGroup: true,
      checked: selected,
      button: true,
      label: label,
      onTap: onTap,
      excludeSemantics: true,
      child: Material(
        color: selected ? colors.brandSoft : Colors.transparent,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: DtSize.touchMin),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: DtSpace.s3, vertical: DtSpace.s2),
              child: Row(
                children: [
                  Icon(
                    selected ? LucideIcons.circleCheck : LucideIcons.circle,
                    size: DtSpace.s5,
                    color: selected ? colors.brandStrong : colors.inkMuted,
                  ),
                  const SizedBox(width: DtSpace.s3),
                  Expanded(
                    child: Text(
                      label,
                      style: (selected ? DtType.bodyStrong : DtType.body).copyWith(
                        color: selected ? colors.brandStrong : colors.ink,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Whether every label fits on one line of a segmented control of [width] (measured with the
/// person's text size); otherwise the answers belong in a [DtChoiceList].
bool segmentsFit(BuildContext context, List<String> labels, double width) {
  if (labels.length < 2 || labels.length > 4) return false;
  // Segment inner width: the control is split evenly, each segment padded on both sides.
  final available = width / labels.length - 2 * DtSpace.s3 - 6;
  final scaler = MediaQuery.textScalerOf(context);
  for (final label in labels) {
    final painter = TextPainter(
      text: TextSpan(text: label, style: DtType.label),
      textDirection: TextDirection.ltr,
      textScaler: scaler,
      maxLines: 1,
    )..layout();
    final fits = painter.width <= available;
    painter.dispose();
    if (!fits) return false;
  }
  return true;
}
