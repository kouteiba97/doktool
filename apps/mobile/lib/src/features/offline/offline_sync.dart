import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart' show Value;
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/models/access_state.dart';
import '../../core/api/generated/models/favorite_target_type.dart';
import '../../core/api/generated/models/feature_key.dart';
import '../../core/api/generated/models/manifest_calculator_dto.dart';
import '../../core/api/generated/models/manifest_reference_dto.dart';
import '../../core/auth/session.dart';
import '../../core/auth/session_controller.dart';
import '../../core/database/app_database.dart';
import '../../core/network/connectivity.dart';
import '../access/access_controller.dart';
import '../activity/favorites_controller.dart';
import '../calculators/calculator_runtime.dart';
import '../calculators/engine/definition.dart';
import '../calculators/engine/self_test.dart';
import '../reference/reference_files.dart';
import 'offline_store.dart';

enum OfflineScope { all, favorites }

enum SyncPhase { idle, syncing, failed }

/// What the offline indicators show (OfflineBar, DataVersionChip, Données et hors ligne).
@immutable
class OfflineStatus {
  const OfflineStatus({
    this.enabled = false,
    this.phase = SyncPhase.idle,
    this.progress,
    this.dataVersion,
    this.syncedAt,
    this.failure,
    this.documents = 0,
    this.calculators = 0,
    this.storageBytes = 0,
    this.pendingDocuments = 0,
    this.scope = OfflineScope.all,
    this.mobileData = false,
    this.lostEntitlement = false,
  });

  /// Offline is open for this account (never for a demo).
  final bool enabled;
  final SyncPhase phase;
  final double? progress;
  final String? dataVersion;
  final DateTime? syncedAt;
  final ApiError? failure;
  final int documents;
  final int calculators;
  final int storageBytes;

  /// Models waiting for Wi-Fi (or for « Tous les modèles »): « Mise à jour disponible ».
  final int pendingDocuments;
  final OfflineScope scope;
  final bool mobileData;

  /// Protected copies were removed because the account no longer opens them.
  final bool lostEntitlement;

  /// Section 18: data older than 30 days shows a warning.
  bool get outdated => syncedAt != null && DateTime.now().difference(syncedAt!) > const Duration(days: 30);

  OfflineStatus copyWith({
    SyncPhase? phase,
    double? progress,
    bool clearProgress = false,
    ApiError? failure,
    bool clearFailure = false,
  }) => OfflineStatus(
    enabled: enabled,
    phase: phase ?? this.phase,
    progress: clearProgress ? null : progress ?? this.progress,
    dataVersion: dataVersion,
    syncedAt: syncedAt,
    failure: clearFailure ? null : failure ?? this.failure,
    documents: documents,
    calculators: calculators,
    storageBytes: storageBytes,
    pendingDocuments: pendingDocuments,
    scope: scope,
    mobileData: mobileData,
    lostEntitlement: lostEntitlement,
  );
}

/// Keeps the device's offline store in line with the manifest of the account (section 18): new or
/// changed models are downloaded and checksum-verified, calculator versions are installed after
/// their test cases pass on the device, and anything no longer listed is removed.
class OfflineSyncController extends AsyncNotifier<OfflineStatus> {
  static const _dataVersionKey = 'offline.data_version';
  static const _syncedAtKey = 'offline.synced_at';
  static const _scopeKey = 'offline.scope';
  static const _mobileDataKey = 'offline.mobile_data';
  static const _lostKey = 'offline.lost_entitlement';
  static const _pendingKey = 'offline.pending';

  /// A sync runs on launch, then again on resume after this long.
  static const staleAfter = Duration(hours: 6);

  AppDatabase get _database => ref.read(appDatabaseProvider);
  OfflineStore get _store => ref.read(offlineStoreProvider);
  Future<void>? _running;

  @override
  Future<OfflineStatus> build() async {
    final session = ref.watch(sessionControllerProvider).value;
    if (session is! UserSession) {
      if (session != null) await _forget();
      return const OfflineStatus();
    }
    return _load(enabled: true);
  }

  /// Signed out or demo: the store and its markers are removed.
  Future<void> _forget() async {
    await _store.purge();
    for (final key in [_dataVersionKey, _syncedAtKey, _lostKey, _pendingKey]) {
      await _database.deleteSetting(key);
    }
  }

  Future<OfflineStatus> _load({required bool enabled}) async {
    final syncedAt = await _database.readSetting(_syncedAtKey);
    return OfflineStatus(
      enabled: enabled,
      dataVersion: await _database.readSetting(_dataVersionKey),
      syncedAt: syncedAt == null ? null : DateTime.tryParse(syncedAt),
      documents: (await _store.documents()).length,
      calculators: (await _store.calculators()).length,
      storageBytes: await _store.storageBytes(),
      pendingDocuments: int.tryParse(await _database.readSetting(_pendingKey) ?? '') ?? 0,
      scope: await _database.readSetting(_scopeKey) == OfflineScope.favorites.name
          ? OfflineScope.favorites
          : OfflineScope.all,
      mobileData: await _database.readSetting(_mobileDataKey) == 'true',
      lostEntitlement: await _database.readSetting(_lostKey) == 'true',
    );
  }

  /// Syncs now unless one is already running; [ifStale] skips a recent sync (resume).
  Future<void> sync({bool ifStale = false}) {
    final current = state.value;
    if (current == null || !current.enabled) return Future.value();
    if (ifStale && current.syncedAt != null && DateTime.now().difference(current.syncedAt!) < staleAfter) {
      return Future.value();
    }
    return _running ??= _sync().whenComplete(() => _running = null);
  }

  Future<void> _sync() async {
    if (!ref.read(isOnlineProvider)) return;
    state = AsyncData(state.value!.copyWith(phase: SyncPhase.syncing, progress: 0, clearFailure: true));
    try {
      final access = await ref.read(accessControllerProvider.notifier).future;
      final offline = access?.feature(FeatureKey.offlineSync);
      if (offline == null || offline.state != AccessState.available) {
        final hadCopies = (await _store.documents()).isNotEmpty || (await _store.calculators()).isNotEmpty;
        await _store.purge();
        if (hadCopies) await _database.writeSetting(_lostKey, 'true');
        state = AsyncData(await _load(enabled: true));
        return;
      }
      await _database.deleteSetting(_lostKey);
      final manifest = await ref.read(apiProvider).offline.offlineControllerManifest();
      final status = state.value!;
      final onMobile = ref.read(networkProvider).value == NetworkKind.mobile;
      final favorites = (await ref.read(favoritesProvider.future)).keys;
      bool wanted(ManifestReferenceDto item) {
        final favorite = favorites.contains(FavoriteKey(FavoriteTargetType.referenceDocument, item.id));
        if (favorite) return true;
        if (status.scope == OfflineScope.favorites) return false;
        return !onMobile || status.mobileData;
      }

      final pending = await _syncDocuments(manifest.referenceDocuments, wanted);
      await _syncCalculators(manifest.calculators);
      await _database.writeSetting(_dataVersionKey, manifest.dataVersion);
      await _database.writeSetting(_syncedAtKey, DateTime.now().toIso8601String());
      await _database.writeSetting(_pendingKey, '$pending');
      state = AsyncData(await _load(enabled: true));
    } catch (error) {
      final current = state.value ?? const OfflineStatus(enabled: true);
      state = AsyncData(current.copyWith(phase: SyncPhase.failed, clearProgress: true, failure: ApiError.from(error)));
    }
  }

  /// Returns how many wanted models are waiting (Wi-Fi only, favorites only).
  Future<int> _syncDocuments(List<ManifestReferenceDto> items, bool Function(ManifestReferenceDto) wanted) async {
    final listed = {for (final item in items) item.id: item};
    final local = await _store.documents();
    for (final document in local) {
      final item = listed[document.id];
      if (item == null) await _store.deleteDocument(document);
    }
    final existing = {for (final document in await _store.documents()) document.id: document};
    final toDownload = [
      for (final item in items)
        if (existing[item.id]?.sha256 != item.sha256 && wanted(item)) item,
    ];
    final skipped = items.where((item) => existing[item.id]?.sha256 != item.sha256 && !wanted(item)).length;
    final directory = await _store.filesDirectory();
    for (final (index, item) in toDownload.indexed) {
      final file = await ref.read(referenceFilesProvider).download(item.id);
      final path = '${directory.path}${Platform.pathSeparator}${item.id}-v${file.fileVersion}.pdf';
      await File(path).writeAsBytes(file.bytes, flush: true);
      final previous = existing[item.id];
      if (previous != null && previous.filePath != path) {
        final old = File(previous.filePath);
        if (old.existsSync()) await old.delete();
      }
      await _store.saveDocument(
        OfflineDocumentsCompanion.insert(
          id: item.id,
          type: item.type.toJson(),
          titleFr: item.titleFr,
          titleEn: Value(item.titleEn),
          fileVersion: file.fileVersion,
          sha256: file.sha256,
          sizeBytes: item.sizeBytes.toInt(),
          pageCount: item.pageCount.toInt(),
          updatedAt: item.updatedAt,
          filePath: path,
          downloadedAt: DateTime.now(),
        ),
      );
      state = AsyncData(state.value!.copyWith(progress: (index + 1) / toDownload.length));
    }
    return skipped;
  }

  /// Installs each new calculator version only if its reference cases pass on this device.
  Future<void> _syncCalculators(List<ManifestCalculatorDto> items) async {
    final listed = {for (final item in items) item.id};
    for (final calculator in await _store.calculators()) {
      if (!listed.contains(calculator.id)) await _store.deleteCalculator(calculator.id);
    }
    final installed = {for (final calculator in await _store.calculators()) calculator.id: calculator};
    for (final item in items) {
      if (installed[item.id]?.definitionSha256 == item.published.definitionSha256) continue;
      final CalculatorDefinition definition;
      try {
        definition = CalculatorDefinition.parse(item.published.definition);
      } on DefinitionFormatException {
        continue;
      }
      if (!passesReferenceCases(definition, referenceCasesOf(item.testCases))) continue;
      await _store.saveCalculator(
        OfflineCalculatorsCompanion.insert(
          id: item.id,
          slug: item.slug,
          nameFr: item.nameFr,
          nameEn: item.nameEn,
          category: Value(item.category),
          version: item.published.version.toInt(),
          definitionSha256: item.published.definitionSha256,
          published: jsonEncode(item.published.toJson()),
          testCases: jsonEncode([for (final testCase in item.testCases) testCase.toJson()]),
          installedAt: DateTime.now(),
        ),
      );
    }
  }

  Future<void> setScope(OfflineScope scope) async {
    await _database.writeSetting(_scopeKey, scope.name);
    state = AsyncData(await _load(enabled: true));
    unawaited(sync());
  }

  Future<void> setMobileData(bool allowed) async {
    await _database.writeSetting(_mobileDataKey, '$allowed');
    state = AsyncData(await _load(enabled: true));
    if (allowed) unawaited(sync());
  }

  /// « Supprimer les modèles téléchargés »: calculators stay installed (they are tiny).
  Future<void> removeDocuments() async {
    await _store.purge(calculators: false);
    await _database.writeSetting(_scopeKey, OfflineScope.favorites.name);
    state = AsyncData(await _load(enabled: true));
  }
}

final offlineSyncProvider = AsyncNotifierProvider<OfflineSyncController, OfflineStatus>(OfflineSyncController.new);
