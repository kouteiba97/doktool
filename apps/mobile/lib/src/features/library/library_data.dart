import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/models/calculator_summary_dto.dart';
import '../../core/api/generated/models/reference_document_type.dart';
import '../../core/api/generated/models/reference_item_dto.dart';
import '../../core/api/generated/models/substance_item_dto.dart';
import '../../core/auth/session_controller.dart';
import '../offline/offline_store.dart';

/// The library sections: the three V1 types and « Grossesse · Allaitement » (ADR-019).
enum LibrarySection {
  ordonnances('ordonnances'),
  certificates('certificates'),
  calculators('calculators'),
  pregnancy('grossesse');

  const LibrarySection(this.slug);

  final String slug;

  static LibrarySection fromSlug(String? slug) =>
      values.where((section) => section.slug == slug).firstOrNull ?? LibrarySection.ordonnances;

  ReferenceDocumentType? get documentType => switch (this) {
    LibrarySection.ordonnances => ReferenceDocumentType.ordonnance,
    LibrarySection.certificates => ReferenceDocumentType.certificate,
    LibrarySection.calculators || LibrarySection.pregnancy => null,
  };
}

/// Where a list came from: the server, or the offline store when there is no connection.
enum ListSource { live, offline }

/// A–Z reference models of one type, each with the server's access decision; without a
/// connection, the models downloaded for offline use.
final referenceListProvider = FutureProvider.family<List<ReferenceItemDto>, ReferenceDocumentType>((ref, type) async {
  ref.watch(sessionControllerProvider);
  try {
    return await ref.watch(apiProvider).referenceLibrary.referenceLibraryControllerList(type: type);
  } catch (error) {
    if (!ApiError.from(error).isNetwork) rethrow;
    final offline = await ref.read(offlineStoreProvider).referenceItems(type);
    if (offline.isEmpty) rethrow;
    return offline;
  }
});

/// Published calculators; without a connection, the versions installed for offline use.
final calculatorListProvider = FutureProvider<List<CalculatorSummaryDto>>((ref) async {
  ref.watch(sessionControllerProvider);
  try {
    return await ref.watch(apiProvider).calculators.calculatorsControllerList();
  } catch (error) {
    if (!ApiError.from(error).isNetwork) rethrow;
    final offline = await ref.read(offlineStoreProvider).calculatorItems();
    if (offline.isEmpty) rethrow;
    return offline;
  }
});

/// « Grossesse · Allaitement »: substances with a published profile, each with the server's access
/// decision; without a connection, the profiles kept for offline reading (ADR-019).
final substanceListProvider = FutureProvider<List<SubstanceItemDto>>((ref) async {
  ref.watch(sessionControllerProvider);
  try {
    return await ref.watch(apiProvider).pregnancy.pregnancyControllerList();
  } catch (error) {
    if (!ApiError.from(error).isNetwork) rethrow;
    final offline = await ref.read(offlineStoreProvider).substanceItems();
    if (offline.isEmpty) rethrow;
    return offline;
  }
});
