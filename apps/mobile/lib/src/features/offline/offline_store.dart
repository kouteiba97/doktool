import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/api/generated/models/access_state.dart';
import '../../core/api/generated/models/calculator_detail_dto.dart';
import '../../core/api/generated/models/calculator_summary_dto.dart';
import '../../core/api/generated/models/item_access_dto.dart';
import '../../core/api/generated/models/published_test_case_dto.dart';
import '../../core/api/generated/models/published_version_dto.dart';
import '../../core/api/generated/models/reference_document_type.dart';
import '../../core/api/generated/models/reference_item_dto.dart';
import '../../core/database/app_database.dart';

const _available = ItemAccessDto(state: AccessState.available, lockReason: null, unlockPath: null);

/// Read side of the offline store: what the device can open without a connection (section 18).
/// Everything here was entitled at the last sync; a lost entitlement purges it at the next online
/// launch.
class OfflineStore {
  OfflineStore(this._database, {Future<Directory> Function()? directory})
    : _directory = directory ?? getApplicationSupportDirectory;

  final AppDatabase _database;
  final Future<Directory> Function() _directory;

  Future<Directory> filesDirectory() async {
    final base = await _directory();
    final folder = Directory('${base.path}${Platform.pathSeparator}offline');
    if (!folder.existsSync()) await folder.create(recursive: true);
    return folder;
  }

  Future<List<OfflineDocument>> documents({ReferenceDocumentType? type}) {
    final query = _database.select(_database.offlineDocuments);
    if (type != null) query.where((row) => row.type.equals(type.toJson()));
    return query.get();
  }

  Future<OfflineDocument?> document(String id) =>
      (_database.select(_database.offlineDocuments)..where((row) => row.id.equals(id))).getSingleOrNull();

  /// The PDF bytes, checked again against their SHA-256 (a damaged file is never shown).
  Future<Uint8List?> bytesOf(OfflineDocument document) async {
    final file = File(document.filePath);
    if (!file.existsSync()) return null;
    final bytes = await file.readAsBytes();
    return sha256.convert(bytes).toString() == document.sha256 ? bytes : null;
  }

  Future<List<OfflineCalculator>> calculators() => _database.select(_database.offlineCalculators).get();

  Future<OfflineCalculator?> calculatorBySlug(String slug) =>
      (_database.select(_database.offlineCalculators)..where((row) => row.slug.equals(slug))).getSingleOrNull();

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
    if (calculators) await _database.delete(_database.offlineCalculators).go();
  }

  Future<int> storageBytes() async => (await documents()).fold<int>(0, (total, document) => total + document.sizeBytes);

  Future<void> saveDocument(OfflineDocumentsCompanion row) =>
      _database.into(_database.offlineDocuments).insertOnConflictUpdate(row);

  Future<void> deleteDocument(OfflineDocument document) async {
    final file = File(document.filePath);
    if (file.existsSync()) await file.delete();
    await (_database.delete(_database.offlineDocuments)..where((row) => row.id.equals(document.id))).go();
  }

  Future<void> saveCalculator(OfflineCalculatorsCompanion row) =>
      _database.into(_database.offlineCalculators).insertOnConflictUpdate(row);

  Future<void> deleteCalculator(String id) =>
      (_database.delete(_database.offlineCalculators)..where((row) => row.id.equals(id))).go();
}

final offlineStoreProvider = Provider<OfflineStore>((ref) => OfflineStore(ref.watch(appDatabaseProvider)));
