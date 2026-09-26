import 'package:flutter/material.dart';

import '../theme/doktool_tokens.dart';
import 'tokens.dart';

enum DtButtonVariant { primary, secondary, ghost, danger, teal }

enum DtButtonSize { sm, md, lg }

/// The single action control (component Button): one primary per screen region, labels in the
/// infinitive and under three words. While [loading], a spinner replaces the icon and the button
/// ignores taps; a null [onPressed] renders the disabled state.
class DtButton extends StatelessWidget {
  const DtButton({
    required this.label,
    required this.onPressed,
    this.variant = DtButtonVariant.primary,
    this.size = DtButtonSize.lg,
    this.icon,
    this.loading = false,
    this.expand = true,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;
  final DtButtonVariant variant;
  final DtButtonSize size;
  final IconData? icon;
  final bool loading;
  final bool expand;

  double get _height => switch (size) {
    DtButtonSize.sm => DtSize.controlSm,
    DtButtonSize.md => DtSize.control,
    DtButtonSize.lg => DtSize.controlLg,
  };

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final (background, foreground, border) = switch (variant) {
      DtButtonVariant.primary => (colors.brand, colors.onBrand, colors.brand),
      DtButtonVariant.secondary => (colors.surface, colors.ink, colors.borderStrong),
      DtButtonVariant.ghost => (Colors.transparent, colors.brand, Colors.transparent),
      DtButtonVariant.danger => (colors.surface, colors.critical, colors.critical),
      DtButtonVariant.teal => (colors.teal, colors.onTeal, colors.teal),
    };
    final enabled = onPressed != null && !loading;
    final child = Row(
      mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (loading)
          SizedBox.square(
            dimension: DtSpace.s4,
            child: CircularProgressIndicator(strokeWidth: DtBorder.focus, color: foreground),
          )
        else if (icon != null)
          Icon(icon, size: DtSpace.s5, color: foreground),
        if (loading || icon != null) const SizedBox(width: DtSpace.s2),
        Flexible(
          child: Text(
            label,
            overflow: TextOverflow.ellipsis,
            style: DtType.bodyStrong.copyWith(color: foreground),
          ),
        ),
      ],
    );
    return Semantics(
      button: true,
      enabled: enabled,
      child: Opacity(
        opacity: onPressed == null ? DtOpacity.disabled : 1,
        child: SizedBox(
          height: _height < DtSize.touchMin ? DtSize.touchMin : _height,
          width: expand ? double.infinity : null,
          child: Material(
            color: background,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(DtRadius.md),
              side: BorderSide(color: border, width: DtBorder.control),
            ),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: enabled ? onPressed : null,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: DtSpace.s4),
                child: child,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
