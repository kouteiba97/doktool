import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_client.dart';
import '../../core/api/generated/models/activity_dto.dart';
import '../../core/api/generated/models/activity_kind.dart';
import '../../core/api/generated/models/calculator_summary_dto.dart';
import '../../core/api/generated/models/favorite_item_dto.dart';
import '../../core/api/generated/models/favorite_item_dto_kind.dart';
import '../../core/api/generated/models/favorite_target_type.dart';
import '../../core/api/generated/models/item_access_dto.dart';
import '../../core/api/generated/models/reference_document_type.dart';
import '../../core/api/generated/models/reference_item_dto.dart';
import '../../core/api/generated/models/substance_item_dto.dart';
import '../../core/auth/session.dart';
import '../../core/auth/session_controller.dart';
import '../library/library_data.dart';
import '../offline/offline_store.dart';
import 'favorites_controller.dart';

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

  /// What the server says about an opened or starred item (history entries and favorites carry it).
  /// Null for a kind this version of the app does not know.
  static ContentRef? fromItem(String id, FavoriteItemDto item) => switch (item.kind) {
    FavoriteItemDtoKind.$unknown => null,
    final kind => ContentRef(
      id: id,
      titleFr: item.titleFr,
      titleEn: item.titleEn,
      access: item.access,
      slug: kind == FavoriteItemDtoKind.calculator ? item.slug : null,
      referenceType: switch (kind) {
        FavoriteItemDtoKind.ordonnance => ReferenceDocumentType.ordonnance,
        FavoriteItemDtoKind.certificate => ReferenceDocumentType.certificate,
        _ => null,
      },
      isSubstance: kind == FavoriteItemDtoKind.substance,
    ),
  };

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

/// The models and calculators the viewer sees and the profiles kept on this device, by id. Used
/// to look through what the device holds when the server search is out of reach, and to name a
/// demo's favorites.
///
/// It never downloads the list of « Grossesse · Allaitement » substances (thousands of rows):
/// history entries and favorites come from the server with their own title and access.
final contentIndexProvider = FutureProvider<Map<String, ContentRef>>((ref) async {
  final ordonnances = await ref.watch(referenceListProvider(ReferenceDocumentType.ordonnance).future);
  final certificates = await ref.watch(referenceListProvider(ReferenceDocumentType.certificate).future);
  final calculators = await ref.watch(calculatorListProvider.future);
  // Profiles are optional here: a failure to read them never hides models and calculators.
  final substances = await ref
      .read(offlineStoreProvider)
      .substanceItems()
      .catchError((Object _) => <SubstanceItemDto>[]);

  /// A reference model as a content row.
  ContentRef reference(ReferenceItemDto item) => ContentRef(
    id: item.id,
    titleFr: item.titleFr,
    titleEn: item.titleEn,
    access: item.access,
    referenceType: item.type,
  );

  /// A calculator as a content row.
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

/// What a history entry opened, as the server describes it now; null for a search and for an
/// item that is no longer available.
ContentRef? contentOfEntry(ActivityDto entry) {
  final id = entry.targetId;
  final item = entry.item;
  return id == null || item == null ? null : ContentRef.fromItem(id, item);
}

/// Home « Récents »: the last distinct models, calculators and profiles opened, still published.
final recentContentProvider = FutureProvider<List<ContentRef>>((ref) async {
  final history = await ref.watch(activityHistoryProvider(null).future);
  final seen = <String>{};
  return [
    for (final entry in history)
      if (entry.kind != ActivityKind.search && entry.targetId != null && seen.add(entry.targetId!))
        ?contentOfEntry(entry),
  ].take(5).toList();
});

/// Home « Favoris »: the first five favorites that can still be shown.
///
/// A real account's favorites come from the server with their title and access. A demo's favorites
/// live on the device only (section 27): they are named from the lists already loaded, and a
/// starred profile is read on its own.
final favoriteContentProvider = FutureProvider<List<ContentRef>>((ref) async {
  const shown = 5;
  final favorites = await ref.watch(favoritesProvider.future);
  final fromServer = {
    for (final entry in favorites.entries)
      if (entry.item case final item?) entry.targetId: ContentRef.fromItem(entry.targetId, item),
  };
  final resolved = <ContentRef>[];
  Map<String, ContentRef>? index;
  for (final key in favorites.keys) {
    if (resolved.length == shown) break;
    var content = fromServer[key.id];
    if (content == null && !fromServer.containsKey(key.id)) {
      index ??= await ref.watch(contentIndexProvider.future).catchError((Object _) => <String, ContentRef>{});
      content = index[key.id];
      if (content == null && key.type == FavoriteTargetType.substance) content = await _substanceRef(ref, key.id);
    }
    if (content != null) resolved.add(content);
  }
  return resolved;
});

/// One « Grossesse · Allaitement » profile as a content row, or null when it cannot be read.
Future<ContentRef?> _substanceRef(Ref ref, String id) async {
  try {
    final profile = await ref.read(apiProvider).pregnancy.pregnancyControllerGet(id: id);
    return ContentRef(
      id: profile.id,
      titleFr: profile.nameFr,
      titleEn: profile.nameEn,
      access: profile.access,
      isSubstance: true,
    );
  } catch (_) {
    return null;
  }
}
