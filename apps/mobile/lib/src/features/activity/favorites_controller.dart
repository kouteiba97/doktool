import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/generated/models/favorite_dto.dart';
import '../../core/api/generated/models/favorite_target_type.dart';
import '../../core/auth/session.dart';
import '../../core/auth/session_controller.dart';

/// A favorite's identity: what it points at.
@immutable
class FavoriteKey {
  const FavoriteKey(this.type, this.id);

  final FavoriteTargetType type;
  final String id;

  @override
  bool operator ==(Object other) => other is FavoriteKey && other.type == type && other.id == id;

  @override
  int get hashCode => Object.hash(type, id);
}

@immutable
class Favorites {
  const Favorites({this.entries = const [], this.keys = const {}});

  /// Server entries of a real account (with titles and access); empty for a demo.
  final List<FavoriteDto> entries;

  /// Everything starred, for the star buttons and « favoris d’abord » ordering.
  final Set<FavoriteKey> keys;

  bool contains(FavoriteTargetType type, String id) => keys.contains(FavoriteKey(type, id));
}

/// Favorites: on the server for a real account; kept in memory only for a demo (session-local,
/// nothing a demo does is written to user tables — section 27).
class FavoritesController extends AsyncNotifier<Favorites> {
  @override
  Future<Favorites> build() async {
    final session = ref.watch(sessionControllerProvider).value;
    if (session is! UserSession) return const Favorites();
    final entries = await ref.read(apiProvider).activity.activityControllerFavorites();
    return Favorites(
      entries: entries,
      keys: {for (final entry in entries) FavoriteKey(entry.targetType, entry.targetId)},
    );
  }

  Future<void> toggle(FavoriteTargetType type, String id) async {
    final current = await future;
    final key = FavoriteKey(type, id);
    final adding = !current.keys.contains(key);
    final keys = {...current.keys};
    adding ? keys.add(key) : keys.remove(key);
    state = AsyncData(Favorites(entries: current.entries, keys: keys));
    if (ref.read(sessionControllerProvider).value is! UserSession) return;
    final api = ref.read(apiProvider).activity;
    try {
      if (adding) {
        await api.activityControllerAddFavorite(targetType: type, targetId: id);
      } else {
        await api.activityControllerRemoveFavorite(targetType: type, targetId: id);
      }
      ref.invalidateSelf();
    } catch (_) {
      state = AsyncData(current);
      rethrow;
    }
  }
}

final favoritesProvider = AsyncNotifierProvider<FavoritesController, Favorites>(FavoritesController.new);
