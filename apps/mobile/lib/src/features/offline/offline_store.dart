import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/api/generated/models/access_state.dart';
import '../../core/api/generated/models/calculator_detail_dto.dart';
import '../../core/api/generated/models/calculator_summary_dto.dart';
import '../../core/api/generated/models/conduct.dart';
import '../../core/api/generated/models/item_access_dto.dart';
import '../../core/api/generated/models/period_summaries_dto.dart';
import '../../core/api/generated/models/period_summary_dto.dart';
import '../../core/api/generated/models/profile_content_dto.dart';
import '../../core/api/generated/models/published_test_case_dto.dart';
import '../../core/api/generated/models/published_version_dto.dart';
import '../../core/api/generated/models/reference_document_type.dart';
import '../../core/api/generated/models/reference_item_dto.dart';
import '../../core/api/generated/models/substance_hit_dto.dart';
import '../../core/api/generated/models/substance_item_dto.dart';
import '../../core/api/generated/models/substance_profile_dto.dart';
import '../../core/database/app_database.dart';

/// The per-period summary the search endpoint gives, rebuilt from a stored profile.
PeriodSummariesDto? periodSummaries(ProfileContentDto? content) {
  if (content == null) return null;
  // One period's summary, only when the profile has that period.
  PeriodSummaryDto? of(Conduct? conduct, num? level, bool present) =>
      present ? PeriodSummaryDto(conduct: conduct, evidenceLevel: level) : null;
  final periods = content.pregnancy?.periods;
  final lactation = content.lactation;
  return PeriodSummariesDto(
    t1: of(periods?.t1?.conduct, periods?.t1?.evidence.level, periods?.t1 != null),
    t2: of(periods?.t2?.conduct, periods?.t2?.evidence.level, periods?.t2 != null),
    t3: of(periods?.t3?.conduct, periods?.t3?.evidence.level, periods?.t3 != null),
    peripartum: of(periods?.peripartum?.conduct, periods?.peripartum?.evidence.level, periods?.peripartum != null),
    lactation: of(lactation?.conduct, lactation?.evidence.level, lactation != null),
  );
}

const _available = ItemAccessDto(state: AccessState.available, lockReason: null, unlockPath: null);

/// Read side of the offline store: what the device can open without a connection (section 18).
/// Everything here was entitled at the last sync; a lost entitlement purges it at the next online
/// launch.
class OfflineStore {
  /// The folder is injectable for tests; on a phone it is the app's private support folder.
  OfflineStore(this._database, {Future<Directory> Function()? directory})
    : _directory = directory ?? getApplicationSupportDirectory;

  final AppDatabase _database;
  final Future<Directory> Function() _directory;

  /// The private folder where offline PDFs are written (created if missing).
  Future<Directory> filesDirectory() async {
    final base = await _directory();
    final folder = Directory('${base.path}${Platform.pathSeparator}offline');
    if (!folder.existsSync()) await folder.create(recursive: true);
    return folder;
  }

  /// The reference models kept offline, optionally of one type.
  Future<List<OfflineDocument>> documents({ReferenceDocumentType? type}) {
    final query = _database.select(_database.offlineDocuments);
    if (type != null) query.where((row) => row.type.equals(type.toJson()));
    return query.get();
  }

  /// One reference model kept offline, if any.
  Future<OfflineDocument?> document(String id) =>
      (_database.select(_database.offlineDocuments)..where((row) => row.id.equals(id))).getSingleOrNull();

  /// The PDF bytes, checked again against their SHA-256 (a damaged file is never shown).
  Future<Uint8List?> bytesOf(OfflineDocument document) async {
    final file = File(document.filePath);
    if (!file.existsSync()) return null;
    final bytes = await file.readAsBytes();
    return sha256.convert(bytes).toString() == document.sha256 ? bytes : null;
  }

  /// The calculator versions kept offline.
  Future<List<OfflineCalculator>> calculators() => _database.select(_database.offlineCalculators).get();

  /// One calculator kept offline, by its slug.
  Future<OfflineCalculator?> calculatorBySlug(String slug) =>
      (_database.select(_database.offlineCalculators)..where((row) => row.slug.equals(slug))).getSingleOrNull();

  /// The pregnancy · lactation profiles kept offline.
  Future<List<OfflineSubstance>> substances() => _database.select(_database.offlineSubstances).get();

  /// A profile kept for offline reading, as the API gave it.
  Future<SubstanceProfileDto?> substance(String id) async {
    final row = await (_database.select(
      _database.offlineSubstances,
    )..where((row) => row.id.equals(id))).getSingleOrNull();
    return row == null ? null : SubstanceProfileDto.fromJson(jsonDecode(row.profile) as Map<String, Object?>);
  }

  /// « Grossesse » rows built from the store.
  Future<List<SubstanceItemDto>> substanceItems() async => [
    for (final row in await substances())
      if (await substance(row.id) case final profile?)
        SubstanceItemDto(
          access: _available,
          id: profile.id,
          nameEn: profile.nameEn,
          nameFr: profile.nameFr,
          publishedAt: profile.publishedAt,
          synonyms: profile.synonyms,
          version: profile.version,
        ),
  ]..sort((a, b) => a.nameFr.compareTo(b.nameFr));

  /// Profiles kept offline as search results, each with its periods (ADR-025 offline fallback).
  Future<List<SubstanceHitDto>> substanceHits() async => [
    for (final row in await substances())
      if (await substance(row.id) case final profile?)
        SubstanceHitDto(
          access: _available,
          id: profile.id,
          nameEn: profile.nameEn,
          nameFr: profile.nameFr,
          periods: periodSummaries(profile.content),
          publishedAt: profile.publishedAt,
          synonyms: profile.synonyms,
          version: profile.version,
        ),
  ]..sort((a, b) => a.nameFr.compareTo(b.nameFr));

  /// Keeps a profile for offline reading (replacing an older copy).
  Future<void> saveSubstance(SubstanceProfileDto profile) => _database
      .into(_database.offlineSubstances)
      .insertOnConflictUpdate(
        OfflineSubstancesCompanion.insert(
          id: profile.id,
          nameFr: profile.nameFr,
          nameEn: Value(profile.nameEn),
          version: profile.version.toInt(),
          profile: jsonEncode(profile.toJson()),
          savedAt: DateTime.now(),
        ),
      );

  /// Removes a profile from offline storage.
  Future<void> deleteSubstance(String id) =>
      (_database.delete(_database.offlineSubstances)..where((row) => row.id.equals(id))).go();

  /// Library rows built from the store, with the access they had at sync time.
  Future<List<ReferenceItemDto>> referenceItems(ReferenceDocumentType type) async => [
    for (final document in await documents(type: type))
      ReferenceItemDto(
        access: _available,
        fileDate: document.updatedAt,
        fileVersion: document.fileVersion,
        id: document.id,
        pageCount: document.pageCount,
        sizeBytes: document.sizeBytes,
        titleEn: document.titleEn,
        titleFr: document.titleFr,
        type: type,
      ),
  ]..sort((a, b) => a.titleFr.compareTo(b.titleFr));

  /// Calculator rows built from the store, for the library when offline.
  Future<List<CalculatorSummaryDto>> calculatorItems() async => [
    for (final calculator in await calculators())
      CalculatorSummaryDto(
        access: _available,
        category: calculator.category,
        id: calculator.id,
        nameEn: calculator.nameEn,
        nameFr: calculator.nameFr,
        purposeEn: null,
        purposeFr: null,
        slug: calculator.slug,
        version: calculator.version,
      ),
  ]..sort((a, b) => a.nameFr.compareTo(b.nameFr));

  /// The installed version as the calculator screen expects it (computed on the device).
  CalculatorDetailDto detailOf(OfflineCalculator calculator) => CalculatorDetailDto(
    access: _available,
    category: calculator.category,
    id: calculator.id,
    nameEn: calculator.nameEn,
    nameFr: calculator.nameFr,
    published: PublishedVersionDto.fromJson(jsonDecode(calculator.published) as Map<String, Object?>),
    purposeEn: null,
    purposeFr: null,
    slug: calculator.slug,
    testCases: [
      for (final item in jsonDecode(calculator.testCases) as List)
        PublishedTestCaseDto.fromJson((item as Map).cast<String, Object?>()),
    ],
    version: calculator.version,
  );

  /// Removes every protected copy (lost entitlement, sign-out, or « Supprimer les modèles »).
  Future<void> purge({bool calculators = true}) async {
    for (final document in await documents()) {
      final file = File(document.filePath);
      if (file.existsSync()) await file.delete();
    }
    await _database.delete(_database.offlineDocuments).go();
    if (calculators) {
      await _database.delete(_database.offlineCalculators).go();
      await _database.delete(_database.offlineSubstances).go();
    }
  }

  /// Space used by the offline PDFs, shown in « Données et hors ligne ».
  Future<int> storageBytes() async => (await documents()).fold<int>(0, (total, document) => total + document.sizeBytes);

  /// Records a downloaded PDF.
  Future<void> saveDocument(OfflineDocumentsCompanion row) =>
      _database.into(_database.offlineDocuments).insertOnConflictUpdate(row);

  /// Deletes a PDF file and its record.
  Future<void> deleteDocument(OfflineDocument document) async {
    final file = File(document.filePath);
    if (file.existsSync()) await file.delete();
    await (_database.delete(_database.offlineDocuments)..where((row) => row.id.equals(document.id))).go();
  }

  /// Records a calculator version for offline use.
  Future<void> saveCalculator(OfflineCalculatorsCompanion row) =>
      _database.into(_database.offlineCalculators).insertOnConflictUpdate(row);

  /// Removes a calculator version from offline storage.
  Future<void> deleteCalculator(String id) =>
      (_database.delete(_database.offlineCalculators)..where((row) => row.id.equals(id))).go();
}

final offlineStoreProvider = Provider<OfflineStore>((ref) => OfflineStore(ref.watch(appDatabaseProvider)));
