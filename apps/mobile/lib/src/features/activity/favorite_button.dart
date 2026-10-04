import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_error.dart';
import '../../core/api/generated/models/favorite_target_type.dart';
import '../../l10n/generated/app_localizations.dart';
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
      selectedIcon: Icon(LucideIcons.star, color: onHero ? colors.onHero : colors.brand, fill: 1),
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
