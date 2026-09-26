import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/database/app_database.dart';

/// The person's own last 10 searches, on this device only. They are never sent to analytics
/// (Lock L42, section 16).
class RecentSearches extends AsyncNotifier<List<String>> {
  static const _key = 'search.recent';
  static const _max = 10;

  @override
  Future<List<String>> build() async {
    final raw = await ref.watch(appDatabaseProvider).readSetting(_key);
    if (raw == null) return const [];
    final decoded = jsonDecode(raw);
    return decoded is List ? [for (final item in decoded) '$item'] : const [];
  }

  Future<void> add(String query) async {
    final trimmed = query.trim();
    if (trimmed.length < 2) return;
    final current = await future;
    await _save([trimmed, ...current.where((item) => item.toLowerCase() != trimmed.toLowerCase())].take(_max).toList());
  }

  Future<void> remove(String query) async => _save((await future).where((item) => item != query).toList());

  Future<void> clear() => _save(const []);

  Future<void> _save(List<String> items) async {
    state = AsyncData(items);
    await ref.read(appDatabaseProvider).writeSetting(_key, jsonEncode(items));
  }
}

final recentSearchesProvider = AsyncNotifierProvider<RecentSearches, List<String>>(RecentSearches.new);
