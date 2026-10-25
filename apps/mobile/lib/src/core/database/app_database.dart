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

/// Pregnancy · lactation profiles kept for offline reading (ADR-019): the API's opened profile as
/// JSON, replaced when a newer version is published.
class OfflineSubstances extends Table {
  TextColumn get id => text()();
  TextColumn get nameFr => text()();
  TextColumn get nameEn => text().nullable()();
  IntColumn get version => integer()();

  /// SubstanceProfileDto as JSON.
  TextColumn get profile => text()();
  DateTimeColumn get savedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

/// Analytics events waiting to be sent (section 16): at most 5 000, kept with their original time,
/// and only for the session that recorded them. Codes, counts and flags only — never free text.
@DataClassName('QueuedAnalyticsEvent')
class AnalyticsQueue extends Table {
  IntColumn get id => integer().autoIncrement()();

  /// The user or demo session the event belongs to; another session never sends it.
  TextColumn get sessionKey => text()();

  /// ClientAnalyticsEventType as sent to the API.
  TextColumn get type => text()();
  TextColumn get entityId => text().nullable()();

  /// The event's properties as JSON.
  TextColumn get properties => text()();
  DateTimeColumn get occurredAt => dateTime()();
}

/// The app's SQLite store (drift).
@DriftDatabase(tables: [LocalSettings, OfflineDocuments, OfflineCalculators, OfflineSubstances, AnalyticsQueue])
class AppDatabase extends _$AppDatabase {
  AppDatabase(super.executor);

  /// The on-device database file.
  factory AppDatabase.onDevice() => AppDatabase(driftDatabase(name: 'doktool'));

  @override
  int get schemaVersion => 4;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onUpgrade: (migrator, from, to) async {
      if (from < 2) {
        await migrator.createTable(offlineDocuments);
        await migrator.createTable(offlineCalculators);
      }
      if (from < 3) await migrator.createTable(analyticsQueue);
      if (from < 4) await migrator.createTable(offlineSubstances);
    },
  );

  /// Reads one local setting (null when never written).
  Future<String?> readSetting(String key) async {
    final row = await (select(localSettings)..where((s) => s.key.equals(key))).getSingleOrNull();
    return row?.value;
  }

  /// Writes one local setting, replacing the old value.
  Future<void> writeSetting(String key, String value) =>
      into(localSettings).insertOnConflictUpdate(LocalSettingsCompanion.insert(key: key, value: value));

  /// Removes one local setting.
  Future<void> deleteSetting(String key) => (delete(localSettings)..where((s) => s.key.equals(key))).go();

  /// Settings that belong to the person signed in, not to the device: their cached account (name,
  /// profession), unsent research history and recent searches. Removed when the session ends, so
  /// the next person on a shared phone neither sees them nor sends them under their own account —
  /// nor gets the previous person's account as an offline fallback after signing in.
  static const personalSettings = ['account.summary', 'activity.queue', 'search.recent'];

  /// The last values typed in each calculator (`calculator.inputs.<slug>`): a patient's values,
  /// never left for the next person either.
  static const calculatorInputsPrefix = 'calculator.inputs.';

  /// Forgets [personalSettings] and the remembered calculator inputs (sign-out, session ended,
  /// account deleted).
  Future<void> forgetPersonalSettings() async {
    for (final key in personalSettings) {
      await deleteSetting(key);
    }
    await (delete(localSettings)..where((s) => s.key.like('$calculatorInputsPrefix%'))).go();
  }

  /// After an account deletion: everything the account left on the device goes — cached account,
  /// recent searches, queued history and analytics, last calculator inputs, the remembered
  /// identifier — except the device preferences in [keep].
  Future<void> forgetAccountData({required Set<String> keep}) => transaction(() async {
    await (delete(localSettings)..where((s) => s.key.isNotIn(keep))).go();
    await delete(analyticsQueue).go();
  });
}

/// Overridden in tests with an in-memory database.
final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final database = AppDatabase.onDevice();
  ref.onDispose(database.close);
  return database;
});
