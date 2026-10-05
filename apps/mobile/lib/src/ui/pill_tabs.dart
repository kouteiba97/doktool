import 'package:flutter/material.dart';

import '../theme/doktool_tokens.dart';
import 'tokens.dart';

/// One choice of a [DtPillTabs].
@immutable
class DtPillTab<T> {
  const DtPillTab({required this.value, required this.label, this.icon});

  final T value;
  final String label;
  final IconData? icon;
}

/// A scrolling row of pill chips (ADR-020): icon + full label, the selected one filled with the
/// brand, the others white with a hairline. For section choices that no longer fit a segmented
/// control (the library's four sections), never truncated.
class DtPillTabs<T> extends StatelessWidget {
  const DtPillTabs({
    required this.tabs,
    required this.selected,
    required this.onChanged,
    required this.semanticLabel,
    this.padding = const EdgeInsets.symmetric(horizontal: DtSpace.s4),
    super.key,
  });

  final List<DtPillTab<T>> tabs;
  final T selected;
  final ValueChanged<T> onChanged;
  final String semanticLabel;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Semantics(
      container: true,
      label: semanticLabel,
      child: SizedBox(
        height: DtSize.touchMin,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: padding,
          itemCount: tabs.length,
          separatorBuilder: (_, _) => const SizedBox(width: DtSpace.s2),
          itemBuilder: (context, index) {
            final tab = tabs[index];
            final on = tab.value == selected;
            return Semantics(
              button: true,
              selected: on,
              inMutuallyExclusiveGroup: true,
              label: tab.label,
              onTap: on ? null : () => onChanged(tab.value),
              excludeSemantics: true,
              child: Material(
                color: on ? colors.brand : colors.surface,
                shape: StadiumBorder(
                  side: BorderSide(color: on ? colors.brand : colors.border, width: DtBorder.hairline),
                ),
                child: InkWell(
                  customBorder: const StadiumBorder(),
                  onTap: on ? null : () => onChanged(tab.value),
                  child: AnimatedContainer(
                    duration: DtMotion.fast,
                    curve: DtMotion.easeOut,
                    padding: const EdgeInsets.symmetric(horizontal: DtSpace.s4),
                    alignment: Alignment.center,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (tab.icon != null) ...[
                          Icon(tab.icon, size: DtSpace.s4, color: on ? colors.onBrand : colors.inkSecondary),
                          const SizedBox(width: DtSpace.s2),
                        ],
                        Text(tab.label, style: DtType.label.copyWith(color: on ? colors.onBrand : colors.ink)),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
