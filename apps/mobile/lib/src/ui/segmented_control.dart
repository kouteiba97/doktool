import 'package:flutter/material.dart';

import '../theme/doktool_tokens.dart';
import 'tokens.dart';

/// One option of a [DtSegmentedControl].
@immutable
class DtSegment<T> {
  const DtSegment({required this.value, required this.label});

  final T value;
  final String label;
}

/// The design system's segmented control (`.dt-seg`): finite exclusive choices of up to four
/// options (Settings appearance and language, calculator choices). Full width, pill shaped, with
/// a 44 px touch height (section 20).
class DtSegmentedControl<T> extends StatelessWidget {
  const DtSegmentedControl({
    required this.segments,
    required this.selected,
    required this.onChanged,
    this.semanticLabel,
    super.key,
  }) : assert(segments.length >= 2 && segments.length <= 4, 'use a picker sheet above four options');

  final List<DtSegment<T>> segments;
  final T selected;
  final ValueChanged<T> onChanged;
  final String? semanticLabel;

  static const double _inset = 3;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Semantics(
      container: true,
      label: semanticLabel,
      child: Container(
        constraints: const BoxConstraints(minHeight: DtSize.touchMin),
        decoration: BoxDecoration(
          color: colors.glassTint,
          borderRadius: BorderRadius.circular(DtRadius.full),
          border: Border.all(color: colors.glassHighlight, width: DtBorder.hairline),
        ),
        // Each segment is tappable over the control's full height; the inset is drawn inside it.
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final (index, segment) in segments.indexed)
                Expanded(
                  child: _SegmentButton(
                    label: segment.label,
                    selected: segment.value == selected,
                    inset: EdgeInsetsDirectional.fromSTEB(
                      index == 0 ? _inset : 0,
                      _inset,
                      index == segments.length - 1 ? _inset : 0,
                      _inset,
                    ),
                    onTap: () {
                      if (segment.value != selected) onChanged(segment.value);
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One segment: its label and selected state.
class _SegmentButton extends StatelessWidget {
  const _SegmentButton({required this.label, required this.selected, required this.inset, required this.onTap});

  final String label;
  final bool selected;
  final EdgeInsetsGeometry inset;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    // One node per segment, with its own action: merged into the control, the segments could not
    // be chosen with TalkBack or VoiceOver.
    return Semantics(
      container: true,
      button: true,
      selected: selected,
      inMutuallyExclusiveGroup: true,
      label: label,
      onTap: selected ? null : onTap,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Padding(
          padding: inset,
          child: AnimatedContainer(
            duration: DtMotion.fast,
            curve: DtMotion.easeOut,
            constraints: const BoxConstraints(minHeight: DtSize.touchMin - 2 * DtSegmentedControl._inset),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: DtSpace.s3),
            decoration: BoxDecoration(
              color: selected ? colors.surface : Colors.transparent,
              borderRadius: BorderRadius.circular(DtRadius.full),
              boxShadow: selected ? context.elevation.glass : const [],
            ),
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: DtType.label.copyWith(color: selected ? colors.ink : colors.inkSecondary),
            ),
          ),
        ),
      ),
    );
  }
}
