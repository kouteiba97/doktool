import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

part 'app_database.g.dart';

/// Device-local key/value settings (appearance, language). Synced to the account in Phase 13.
class LocalSettings extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column<Object>> get primaryKey => {key};
}

/// The app's SQLite store (drift). Offline content tables join in Phase 15 with a migration.
@DriftDatabase(tables: [LocalSettings])
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.executor);

  /// The on-device database file.
  factory AppDatabase.onDevice() => AppDatabase(driftDatabase(name: 'doktool'));

  @override
  int get schemaVersion => 1;

  Future<String?> readSetting(String key) async {
    final row = await (select(localSettings)..where((s) => s.key.equals(key))).getSingleOrNull();
    return row?.value;
  }

  Future<void> writeSetting(String key, String value) =>
      into(localSettings).insertOnConflictUpdate(LocalSettingsCompanion.insert(key: key, value: value));
}

/// Overridden in tests with an in-memory database.
final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final database = AppDatabase.onDevice();
  ref.onDispose(database.close);
  return database;
});
