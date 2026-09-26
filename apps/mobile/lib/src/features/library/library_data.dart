import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/generated/models/calculator_summary_dto.dart';
import '../../core/api/generated/models/reference_document_type.dart';
import '../../core/api/generated/models/reference_item_dto.dart';
import '../../core/auth/session_controller.dart';

/// The three V1 library sections (Lock L32): nothing else is ever listed.
enum LibrarySection {
  ordonnances('ordonnances'),
  certificates('certificates'),
  calculators('calculators');

  const LibrarySection(this.slug);

  final String slug;

  static LibrarySection fromSlug(String? slug) =>
      values.where((section) => section.slug == slug).firstOrNull ?? LibrarySection.ordonnances;

  ReferenceDocumentType? get documentType => switch (this) {
    LibrarySection.ordonnances => ReferenceDocumentType.ordonnance,
    LibrarySection.certificates => ReferenceDocumentType.certificate,
    LibrarySection.calculators => null,
  };
}

/// A–Z reference models of one type, each with the server's access decision. Reloads when the
/// session changes.
final referenceListProvider = FutureProvider.family<List<ReferenceItemDto>, ReferenceDocumentType>((ref, type) {
  ref.watch(sessionControllerProvider);
  return ref.watch(apiProvider).referenceLibrary.referenceLibraryControllerList(type: type);
});

/// Published calculators, each with the server's access decision.
final calculatorListProvider = FutureProvider<List<CalculatorSummaryDto>>((ref) {
  ref.watch(sessionControllerProvider);
  return ref.watch(apiProvider).calculators.calculatorsControllerList();
});
