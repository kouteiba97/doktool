import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_client.dart';
import '../../core/api/generated/models/activity_dto.dart';
import '../../core/api/generated/models/activity_kind.dart';
import '../../core/api/generated/models/calculator_summary_dto.dart';
import '../../core/api/generated/models/item_access_dto.dart';
import '../../core/api/generated/models/reference_document_type.dart';
import '../../core/api/generated/models/reference_item_dto.dart';
import '../../core/api/generated/models/substance_item_dto.dart';
import '../../core/auth/session.dart';
import '../../core/auth/session_controller.dart';
import '../library/library_data.dart';

/// A model or calculator the person opened, resolved to what the app shows.
@immutable
class ContentRef {
  const ContentRef({
    required this.id,
    required this.titleFr,
    required this.titleEn,
    required this.access,
    this.slug,
    this.referenceType,
    this.isSubstance = false,
  });

  final String id;
  final String titleFr;
  final String? titleEn;
  final ItemAccessDto access;

  /// Calculators open by slug.
  final String? slug;
  final ReferenceDocumentType? referenceType;

  /// A « Grossesse · Allaitement » profile (ADR-019).
  final bool isSubstance;

  bool get isCalculator => slug != null;

  IconData get icon => isSubstance
      ? LucideIcons.baby
      : isCalculator
      ? LucideIcons.calculator
      : referenceType == ReferenceDocumentType.certificate
      ? LucideIcons.fileBadge
      : LucideIcons.fileText;

  /// Calculators and profiles « Ouvrir », models « Voir le modèle ».
  bool get opens => isCalculator || isSubstance;
}

/// Every published model and calculator the viewer sees, by id (from the cached library lists).
final contentIndexProvider = FutureProvider<Map<String, ContentRef>>((ref) async {
  final ordonnances = await ref.watch(referenceListProvider(ReferenceDocumentType.ordonnance).future);
  final certificates = await ref.watch(referenceListProvider(ReferenceDocumentType.certificate).future);
  final calculators = await ref.watch(calculatorListProvider.future);
  // Profiles are optional here: a failure to list them never hides models and calculators.
  final substances = await ref.watch(substanceListProvider.future).catchError((Object _) => <SubstanceItemDto>[]);
  ContentRef reference(ReferenceItemDto item) => ContentRef(
    id: item.id,
    titleFr: item.titleFr,
    titleEn: item.titleEn,
    access: item.access,
    referenceType: item.type,
  );
  ContentRef calculator(CalculatorSummaryDto item) =>
      ContentRef(id: item.id, titleFr: item.nameFr, titleEn: item.nameEn, access: item.access, slug: item.slug);
  return {
    for (final item in ordonnances) item.id: reference(item),
    for (final item in certificates) item.id: reference(item),
    for (final item in calculators) item.id: calculator(item),
    for (final item in substances)
      item.id: ContentRef(
        id: item.id,
        titleFr: item.nameFr,
        titleEn: item.nameEn,
        access: item.access,
        isSubstance: true,
      ),
  };
});

/// The person's history, newest first (one page), optionally of one kind.
final activityHistoryProvider = FutureProvider.family<List<ActivityDto>, ActivityKind?>((ref, kind) async {
  final session = ref.watch(sessionControllerProvider).value;
  if (session is! UserSession) return const [];
  return ref.read(apiProvider).activity.activityControllerHistory(kind: kind);
});

/// Home « Récents »: the last distinct models and calculators opened, still published.
final recentContentProvider = FutureProvider<List<ContentRef>>((ref) async {
  final history = await ref.watch(activityHistoryProvider(null).future);
  final index = await ref.watch(contentIndexProvider.future);
  final seen = <String>{};
  return [
    for (final entry in history)
      if (entry.kind != ActivityKind.search && entry.targetId != null && seen.add(entry.targetId!))
        ?index[entry.targetId],
  ].take(5).toList();
});
