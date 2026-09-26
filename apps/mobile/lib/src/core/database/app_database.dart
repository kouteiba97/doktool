import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

part 'app_database.g.dart';

/// Device-local key/value settings (appearance, language, offline preferences, queues).
class LocalSettings extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column<Object>> get primaryKey => {key};
}

/// Reference PDFs kept for offline use (section 18). The file lives in the app's private storage;
/// its SHA-256 was checked against the manifest before the row was written.
class OfflineDocuments extends Table {
  TextColumn get id => text()();

  /// ORDONNANCE or CERTIFICATE.
  TextColumn get type => text()();
  TextColumn get titleFr => text()();
  TextColumn get titleEn => text().nullable()();
  IntColumn get fileVersion => integer()();
  TextColumn get sha256 => text()();
  IntColumn get sizeBytes => integer()();
  IntColumn get pageCount => integer()();

  /// When the server last changed the model (the « données du » date).
  DateTimeColumn get updatedAt => dateTime()();
  TextColumn get filePath => text()();
  DateTimeColumn get downloadedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

/// Published calculator versions installed for offline use, after their test cases passed on the
/// device (ADR-003). The JSON columns keep the API's own shapes.
class OfflineCalculators extends Table {
  TextColumn get id => text()();
  TextColumn get slug => text()();
  TextColumn get nameFr => text()();
  TextColumn get nameEn => text()();
  TextColumn get category => text().nullable()();
  IntColumn get version => integer()();
  TextColumn get definitionSha256 => text()();

  /// PublishedVersionDto as JSON (definition, sources, review).
  TextColumn get published => text()();

  /// PublishedTestCaseDto list as JSON.
  TextColumn get testCases => text()();
  DateTimeColumn get installedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

/// The app's SQLite store (drift).
@DriftDatabase(tables: [LocalSettings, OfflineDocuments, OfflineCalculators])
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.executor);

  /// The on-device database file.
  factory AppDatabase.onDevice() => AppDatabase(driftDatabase(name: 'doktool'));

  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onUpgrade: (migrator, from, to) async {
      if (from < 2) {
        await migrator.createTable(offlineDocuments);
        await migrator.createTable(offlineCalculators);
      }
    },
  );

  Future<String?> readSetting(String key) async {
    final row = await (select(localSettings)..where((s) => s.key.equals(key))).getSingleOrNull();
    return row?.value;
  }

  Future<void> writeSetting(String key, String value) =>
      into(localSettings).insertOnConflictUpdate(LocalSettingsCompanion.insert(key: key, value: value));

  Future<void> deleteSetting(String key) => (delete(localSettings)..where((s) => s.key.equals(key))).go();
}

/// Overridden in tests with an in-memory database.
final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final database = AppDatabase.onDevice();
  ref.onDispose(database.close);
  return database;
});
