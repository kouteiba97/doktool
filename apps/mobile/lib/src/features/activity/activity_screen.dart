import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_client.dart';
import '../../core/api/generated/models/activity_dto.dart';
import '../../core/api/generated/models/activity_kind.dart';
import '../../core/api/generated/models/favorite_dto.dart';
import '../../core/api/generated/models/favorite_item_dto_kind.dart';
import '../../core/api/generated/models/reference_document_type.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/glass.dart';
import '../../ui/hero.dart';
import '../../ui/content_row.dart';
import '../../ui/dt_button.dart';
import '../../ui/segmented_control.dart';
import '../../ui/skeleton.dart';
import '../../ui/tokens.dart';
import '../analytics/analytics_event.dart';
import '../analytics/analytics_recorder.dart';
import 'activity_data.dart';
import 'favorites_controller.dart';

enum _Segment { favorites, activity }

/// ScreenFavoritesRecents (Profil › Activité et favoris): favorites grouped by type, and the
/// person's own research history grouped by day. Private: admins only ever see counts.
class ActivityScreen extends ConsumerStatefulWidget {
  const ActivityScreen({super.key});

  @override
  ConsumerState<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends ConsumerState<ActivityScreen> {
  _Segment _segment = _Segment.favorites;
  ActivityKind? _filter;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: DtHeroAppBar(title: l10n.activityTitle),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(DtSpace.s4, 0, DtSpace.s4, DtSpace.s3),
            child: DtSegmentedControl<_Segment>(
              semanticLabel: l10n.activityTitle,
              selected: _segment,
              onChanged: (segment) => setState(() => _segment = segment),
              segments: [
                DtSegment(value: _Segment.favorites, label: l10n.favoritesTitle),
                DtSegment(value: _Segment.activity, label: l10n.activitySegment),
              ],
            ),
          ),
          Expanded(
            child: _segment == _Segment.favorites
                ? const _FavoritesList()
                : _History(filter: _filter, onFilter: (kind) => setState(() => _filter = kind)),
          ),
        ],
      ),
    );
  }
}

void openContent(BuildContext context, ContentRef content) {
  if (content.isSubstance) {
    context.push(Routes.substance(content.id));
  } else if (content.slug != null) {
    context.push(Routes.calculator(content.slug!));
  } else if (content.referenceType != null) {
    openReference(context, content.id, content.referenceType!);
  } else {
    context.push(Routes.reference(content.id));
  }
}

/// Opens a reference model from a tapped row, counted as REFERENCE_OPENED (section 16).
void openReference(BuildContext context, String id, ReferenceDocumentType type) {
  ProviderScope.containerOf(
    context,
    listen: false,
  ).read(analyticsRecorderProvider).record(AnalyticsEvent.referenceOpened(id: id, referenceType: type));
  context.push(Routes.reference(id));
}

class _FavoritesList extends ConsumerWidget {
  const _FavoritesList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final favorites = ref.watch(favoritesProvider);
    if (favorites.isLoading && !favorites.hasValue) return const SkeletonRows();
    final entries = favorites.value?.entries ?? const <FavoriteDto>[];
    if (entries.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(DtSpace.s8),
        child: Text(
          l10n.favoritesEmpty,
          textAlign: TextAlign.center,
          style: DtType.body.copyWith(color: colors.inkMuted),
        ),
      );
    }
    final groups = [
      (FavoriteItemDtoKind.ordonnance, l10n.typesOrdonnances, LucideIcons.fileText),
      (FavoriteItemDtoKind.certificate, l10n.typesCertificates, LucideIcons.fileBadge),
      (FavoriteItemDtoKind.calculator, l10n.typesCalculators, LucideIcons.calculator),
      (FavoriteItemDtoKind.substance, l10n.typesPregnancy, LucideIcons.baby),
    ];
    final unavailable = entries.where((entry) => entry.item == null).toList();
    return RefreshIndicator(
      onRefresh: () => ref.refresh(favoritesProvider.future),
      child: ListView(
        children: [
          for (final (kind, label, icon) in groups)
            if (entries.any((entry) => entry.item?.kind == kind)) ...[
              _GroupTitle(label),
              DtCardGroup(
                children: [
                  for (final entry in entries.where((entry) => entry.item?.kind == kind))
                    ContentRow(
                      icon: icon,
                      title: localizedTitle(context, entry.item!.titleFr, entry.item!.titleEn),
                      access: entry.item!.access,
                      actionLabel: kind == FavoriteItemDtoKind.calculator || kind == FavoriteItemDtoKind.substance
                          ? l10n.libraryOpen
                          : l10n.libraryViewModel,
                      onOpen: () => openContent(
                        context,
                        ContentRef(
                          id: entry.targetId,
                          titleFr: entry.item!.titleFr,
                          titleEn: entry.item!.titleEn,
                          access: entry.item!.access,
                          slug: entry.item!.slug,
                          isSubstance: kind == FavoriteItemDtoKind.substance,
                        ),
                      ),
                    ),
                ],
              ),
            ],
          if (unavailable.isNotEmpty) ...[
            _GroupTitle(l10n.favoritesUnavailable),
            DtCardGroup(
              children: [
                for (final entry in unavailable)
                  ListTile(
                    leading: Icon(LucideIcons.fileX, color: colors.inkMuted),
                    title: Text(l10n.favoritesUnavailable, style: DtType.body.copyWith(color: colors.inkSecondary)),
                    trailing: TextButton(
                      onPressed: () => ref.read(favoritesProvider.notifier).toggle(entry.targetType, entry.targetId),
                      child: Text(l10n.favoritesRemoveAction, style: DtType.label.copyWith(color: colors.brand)),
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _History extends ConsumerWidget {
  const _History({required this.filter, required this.onFilter});

  final ActivityKind? filter;
  final ValueChanged<ActivityKind?> onFilter;

  String _day(BuildContext context, AppLocalizations l10n, DateTime at) {
    final local = at.toLocal();
    final today = DateUtils.dateOnly(DateTime.now());
    final day = DateUtils.dateOnly(local);
    if (day == today) return l10n.activityToday;
    if (day == today.subtract(const Duration(days: 1))) return l10n.activityYesterday;
    return DateFormat.yMMMMEEEEd(Localizations.localeOf(context).toLanguageTag()).format(local);
  }

  Future<void> _clear(BuildContext context, WidgetRef ref) async {
    final l10n = AppLocalizations.of(context);
    final confirmed = await showModalBottomSheet<bool>(
      // Above the floating tab bar (ADR-020), never under it.
      useRootNavigator: true,
      context: context,
      useSafeArea: true,
      builder: (sheet) => Padding(
        padding: const EdgeInsets.all(DtSpace.s5),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(l10n.activityClearConfirm, style: DtType.body.copyWith(color: sheet.colors.ink)),
            const SizedBox(height: DtSpace.s4),
            DtButton(
              label: l10n.activityClear,
              variant: DtButtonVariant.danger,
              onPressed: () => Navigator.of(sheet).pop(true),
            ),
            const SizedBox(height: DtSpace.s2),
            DtButton(
              label: l10n.commonCancel,
              variant: DtButtonVariant.secondary,
              onPressed: () => Navigator.of(sheet).pop(false),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true) return;
    await ref.read(apiProvider).activity.activityControllerClear();
    ref.invalidate(activityHistoryProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final history = ref.watch(activityHistoryProvider(filter));
    final index = ref.watch(contentIndexProvider).value ?? const {};
    final entries = history.value ?? const <ActivityDto>[];

    // One lifted card per day (ADR-020).
    final days = <(String, List<Widget>)>[];
    for (final entry in entries) {
      final day = _day(context, l10n, entry.occurredAt);
      if (days.isEmpty || days.last.$1 != day) days.add((day, <Widget>[]));
      final rows = days.last.$2;
      final content = entry.targetId == null ? null : index[entry.targetId];
      if (entry.kind == ActivityKind.search) {
        rows.add(
          ListTile(
            leading: Icon(LucideIcons.search, color: colors.inkMuted),
            title: Text(l10n.activitySearched(entry.queryText ?? ''), style: DtType.body.copyWith(color: colors.ink)),
          ),
        );
      } else if (content != null) {
        rows.add(
          ContentRow(
            icon: content.icon,
            title: localizedTitle(context, content.titleFr, content.titleEn),
            access: content.access,
            actionLabel: content.opens ? l10n.libraryOpen : l10n.libraryViewModel,
            onOpen: () => openContent(context, content),
          ),
        );
      }
    }

    final rows = <Widget>[
      for (final (day, items) in days)
        if (items.isNotEmpty) ...[_GroupTitle(day), DtCardGroup(children: items)],
    ];

    return Column(
      children: [
        SizedBox(
          height: DtSize.touchMin,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: DtSpace.s4),
            children: [
              for (final (kind, label) in [
                (null, l10n.activityFilterAll),
                (ActivityKind.search, l10n.activityFilterSearches),
                (ActivityKind.referenceView, l10n.activityFilterModels),
                (ActivityKind.calculatorUse, l10n.activityFilterCalculations),
                (ActivityKind.pregnancyView, l10n.typesPregnancy),
              ])
                Padding(
                  padding: const EdgeInsets.only(right: DtSpace.s2),
                  child: ChoiceChip(
                    label: Text(label),
                    selected: filter == kind,
                    showCheckmark: false,
                    selectedColor: colors.brandSoft,
                    onSelected: (_) => onFilter(kind),
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: history.isLoading && !history.hasValue
              ? const SkeletonRows()
              : RefreshIndicator(
                  onRefresh: () => ref.refresh(activityHistoryProvider(filter).future),
                  child: ListView(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(DtSpace.s4, DtSpace.s2, DtSpace.s4, DtSpace.s2),
                        child: Text(l10n.activityPrivate, style: DtType.caption.copyWith(color: colors.inkMuted)),
                      ),
                      if (entries.isEmpty)
                        Padding(
                          padding: const EdgeInsets.all(DtSpace.s8),
                          child: Text(
                            l10n.activityEmpty,
                            textAlign: TextAlign.center,
                            style: DtType.body.copyWith(color: colors.inkMuted),
                          ),
                        ),
                      ...rows,
                      if (entries.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.all(DtSpace.s4),
                          child: DtButton(
                            label: l10n.activityClear,
                            variant: DtButtonVariant.secondary,
                            onPressed: () => _clear(context, ref),
                          ),
                        ),
                    ],
                  ),
                ),
        ),
      ],
    );
  }
}

class _GroupTitle extends StatelessWidget {
  const _GroupTitle(this.label);

  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(DtSpace.s4, DtSpace.s4, DtSpace.s4, DtSpace.s1),
    child: Text(label, style: DtType.label.copyWith(color: context.colors.inkMuted)),
  );
}
