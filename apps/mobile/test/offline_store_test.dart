// Phase 15: the offline store serves only intact files and forgets everything on purge.
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:doktool/src/core/api/generated/models/access_state.dart';
import 'package:doktool/src/core/api/generated/models/reference_document_type.dart';
import 'package:doktool/src/core/database/app_database.dart';
import 'package:doktool/src/features/offline/offline_store.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter_test/flutter_test.dart';

import 'support/test_app.dart';

void main() {
  late AppDatabase database;
  late Directory directory;
  late OfflineStore store;

  setUp(() async {
    database = memoryDatabase();
    directory = await Directory.systemTemp.createTemp('doktool-offline-');
    store = OfflineStore(database, directory: () async => directory);
  });

  tearDown(() async {
    await database.close();
    if (directory.existsSync()) await directory.delete(recursive: true);
  });

  Future<OfflineDocument> saveDocument(String id, Uint8List bytes, {String type = 'ORDONNANCE'}) async {
    final folder = await store.filesDirectory();
    final path = '${folder.path}${Platform.pathSeparator}$id.pdf';
    await File(path).writeAsBytes(bytes);
    await store.saveDocument(
      OfflineDocumentsCompanion.insert(
        id: id,
        type: type,
        titleFr: 'Modèle $id',
        titleEn: const Value(null),
        fileVersion: 1,
        sha256: sha256.convert(bytes).toString(),
        sizeBytes: bytes.length,
        pageCount: 1,
        updatedAt: DateTime.utc(2026, 9, 20),
        filePath: path,
        downloadedAt: DateTime.utc(2026, 9, 21),
      ),
    );
    return (await store.document(id))!;
  }

  test('serves a stored file only while it matches its checksum', () async {
    final bytes = Uint8List.fromList('%PDF-1.7 test'.codeUnits);
    final document = await saveDocument('a', bytes);
    expect(await store.bytesOf(document), bytes);

    await File(document.filePath).writeAsBytes(Uint8List.fromList('%PDF-1.7 tampered'.codeUnits));
    expect(await store.bytesOf(document), isNull);
  });

  test('lists stored models as available library rows of their type', () async {
    await saveDocument('b', Uint8List.fromList([1, 2, 3]));
    await saveDocument('c', Uint8List.fromList([4, 5, 6]), type: 'CERTIFICATE');
    final ordonnances = await store.referenceItems(ReferenceDocumentType.ordonnance);
    expect(ordonnances.map((item) => item.id), ['b']);
    expect(ordonnances.single.access.state, AccessState.available);
    expect(await store.storageBytes(), 6);
  });

  test('purge removes the files and the rows', () async {
    final document = await saveDocument('d', Uint8List.fromList([7, 8, 9]));
    await store.purge();
    expect(File(document.filePath).existsSync(), isFalse);
    expect(await store.documents(), isEmpty);
    expect(await store.calculators(), isEmpty);
  });
}
