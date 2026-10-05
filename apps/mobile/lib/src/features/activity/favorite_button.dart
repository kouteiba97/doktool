import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_error.dart';
import '../../core/api/generated/models/favorite_target_type.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/error_text.dart';
import '../../ui/tokens.dart';
import 'favorites_controller.dart';

/// The ★ of a model or a calculator (viewer and calculator top bars, search sheet).
class FavoriteButton extends ConsumerWidget {
  const FavoriteButton({required this.type, required this.id, this.onHero = false, super.key});

  final FavoriteTargetType type;
  final String id;

  /// Placed on the hero top bar (ADR-020): white outline, white fill when starred.
  final bool onHero;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final starred = ref.watch(favoritesProvider).value?.contains(type, id) ?? false;
    return IconButton(
      tooltip: starred ? l10n.favoritesRemove : l10n.favoritesAdd,
      isSelected: starred,
      icon: Icon(LucideIcons.star, color: onHero ? colors.onHero : colors.inkSecondary),
      selectedIcon: _FilledStar(color: onHero ? colors.onHero : colors.brand),
      onPressed: () async {
        try {
          await ref.read(favoritesProvider.notifier).toggle(type, id);
        } catch (error) {
          if (context.mounted) {
            ScaffoldMessenger.of(context)
                .showSnackBar(SnackBar(content: Text(commonErrorText(context, ApiError.from(error)))));
          }
        }
      },
    );
  }
}

/// Lucide draws outlines only (an icon font ignores `fill`): the starred state paints the star's
/// inside under the same outline, so it reads by shape and not by colour alone (section 20).
class _FilledStar extends StatelessWidget {
  const _FilledStar({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    final size = IconTheme.of(context).size ?? DtSpace.s6;
    return SizedBox.square(
      dimension: size,
      child: CustomPaint(
        painter: _StarPainter(color),
        child: Icon(LucideIcons.star, color: color, size: size),
      ),
    );
  }
}

class _StarPainter extends CustomPainter {
  const _StarPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    // The Lucide star on its 24-unit grid: centre (12, 12.3), points at radius 9.6, inner 4.
    final unit = size.width / 24;
    final path = Path();
    for (var point = 0; point < 10; point += 1) {
      final radius = (point.isEven ? 9.6 : 4.0) * unit;
      final angle = -math.pi / 2 + point * math.pi / 5;
      final offset = Offset(12 * unit + radius * math.cos(angle), 12.3 * unit + radius * math.sin(angle));
      point == 0 ? path.moveTo(offset.dx, offset.dy) : path.lineTo(offset.dx, offset.dy);
    }
    canvas.drawPath(path..close(), Paint()..color = color);
  }

  @override
  bool shouldRepaint(_StarPainter oldDelegate) => oldDelegate.color != color;
}
