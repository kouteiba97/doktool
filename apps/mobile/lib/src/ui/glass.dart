import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

import '../theme/doktool_tokens.dart';
import 'tokens.dart';

/// The hero gradient (ADR-020): the brand at its deepest at the top, fading into the page ground.
/// It sits behind the status bar and the first block of Home, Welcome and profile-like headers.
class DtHeroBackground extends StatelessWidget {
  const DtHeroBackground({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [colors.heroStart, colors.heroMid, colors.heroEnd],
          stops: const [0, 0.55, 1],
        ),
      ),
      child: child,
    );
  }
}

/// A frosted surface (Clinical Glass): blur behind, a translucent fill, a hairline edge that
/// catches the light, and an optional soft shadow. Use [DtGlass.onHero] over the hero gradient.
class DtGlass extends StatelessWidget {
  const DtGlass({
    required this.child,
    this.radius = DtRadius.lg,
    this.padding,
    this.color,
    this.borderColor,
    this.shadow,
    this.blur = DtBlur.glass,
    super.key,
  }) : _onHero = false;

  /// White frost over the hero gradient (icon buttons, quick actions).
  const DtGlass.onHero({required this.child, this.radius = DtRadius.lg, this.padding, super.key})
    : color = null,
      borderColor = null,
      shadow = null,
      blur = DtBlur.glass,
      _onHero = true;

  final Widget child;
  final double radius;
  final EdgeInsetsGeometry? padding;
  final Color? color;
  final Color? borderColor;
  final List<BoxShadow>? shadow;
  final double blur;
  final bool _onHero;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final shape = BorderRadius.circular(radius);
    return DecoratedBox(
      // The shadow sits outside the clip so it is not cut by it.
      decoration: BoxDecoration(borderRadius: shape, boxShadow: shadow ?? const []),
      child: ClipRRect(
        borderRadius: shape,
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: color ?? (_onHero ? colors.glassOnHero : colors.glass),
              borderRadius: shape,
              border: Border.all(
                color: borderColor ?? (_onHero ? colors.glassOnHeroBorder : colors.glassBorder),
                width: DtBorder.hairline,
              ),
            ),
            child: padding == null ? child : Padding(padding: padding!, child: child),
          ),
        ),
      ),
    );
  }
}

/// A round frosted icon button on the hero (search, notifications), 44 pt as every touch target.
class DtGlassIconButton extends StatelessWidget {
  const DtGlassIconButton({required this.icon, required this.tooltip, required this.onPressed, super.key});

  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Tooltip(
      message: tooltip,
      child: Semantics(
        button: true,
        label: tooltip,
        excludeSemantics: true,
        child: SizedBox.square(
          dimension: DtSize.touchMin,
          child: DtGlass.onHero(
            radius: DtRadius.full,
            child: Material(
              type: MaterialType.transparency,
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: onPressed,
                child: Icon(icon, color: colors.onHero, size: DtSpace.s5),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A white card lifted over the hero or the page: large radius, soft brand-tinted shadow.
class DtLiftedCard extends StatelessWidget {
  const DtLiftedCard({required this.child, this.padding = const EdgeInsets.all(DtSpace.s4), super.key});

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(DtRadius.xl),
        border: Border.all(color: colors.glassHighlight, width: DtBorder.hairline),
        boxShadow: context.elevation.glass,
      ),
      child: child,
    );
  }
}
