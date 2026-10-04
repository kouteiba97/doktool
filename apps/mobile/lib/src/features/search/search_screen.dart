import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_client.dart';
import '../../core/api/generated/models/reference_document_type.dart';
import '../../core/api/generated/models/search_hit_dto.dart';
import '../../core/api/generated/models/search_result_dto.dart';
import '../../core/api/generated/models/search_type.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/content_row.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/skeleton.dart';
import '../../ui/tokens.dart';
import '../library/library_data.dart';
import 'recent_searches.dart';
import '../activity/activity_recorder.dart';
import '../../ui/text_match.dart';
import '../activity/activity_data.dart';
import '../activity/activity_screen.dart';
import '../analytics/analytics_event.dart';
import '../analytics/analytics_recorder.dart';

/// ScreenSearchMobile: full-screen overlay, keyboard up. Grouped results (Ordonnances,
/// Certificats, Calculateurs — the only V1 types), 3 rows per group, chips with counts filtering in
/// place; locked results stay in place with their lock (never hidden).
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _query = TextEditingController();
  Timer? _debounce;

  /// A search counts once its results have stayed on screen briefly, not per keystroke.
  Timer? _report;
  SearchType? _filter;
  SearchResultDto? _result;

  /// Totals of the unfiltered search, so the chips keep their counts while filtering.
  Map<SearchType, int> _totals = const {};
  bool _loading = false;
  bool _failed = false;

  /// Local results shown when the full search is unavailable.
  List<ContentRef> _local = const [];
  int _request = 0;

  @override
  void dispose() {
    _debounce?.cancel();
    _report?.cancel();
    _query.dispose();
    super.dispose();
  }

  void _changed(String value) {
    _debounce?.cancel();
    if (value.trim().length < 2) {
      setState(() {
        _result = null;
        _totals = const {};
        _failed = false;
        _loading = false;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 250), _run);
  }

  Future<void> _run() async {
    final query = _query.text.trim();
    if (query.length < 2) return;
    _report?.cancel();
    final request = ++_request;
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final api = ref.read(apiProvider).search;
      final result = await api.searchControllerQuery(q: query, type: _filter);
      final totals = _filter == null
          ? {for (final group in result.groups) group.type: group.total.toInt()}
          : _totals.isEmpty
          ? {for (final group in (await api.searchControllerQuery(q: query)).groups) group.type: group.total.toInt()}
          : _totals;
      if (!mounted || request != _request) return;
      setState(() {
        _result = result;
        _totals = totals;
        _loading = false;
      });
      _report = Timer(const Duration(seconds: 1), () {
        ref
            .read(analyticsRecorderProvider)
            .record(
              AnalyticsEvent.searchPerformed(
                resultCount: totals.values.fold(0, (sum, total) => sum + total),
                groups: [
                  for (final entry in totals.entries)
                    if (entry.value > 0) entry.key,
                ],
              ),
            );
      });
    } catch (_) {
      // Without the full search, look through what the device holds (offline store included).
      List<ContentRef> local = const [];
      try {
        final index = await ref.read(contentIndexProvider.future);
        local = [
          for (final content in index.values)
            if (matchesAllWords(query, [content.titleFr, content.titleEn])) content,
        ]..sort((a, b) => a.titleFr.compareTo(b.titleFr));
      } catch (_) {
        local = const [];
      }
      if (!mounted || request != _request) return;
      setState(() {
        _loading = false;
        _failed = true;
        _local = local;
      });
    }
  }

  void _setFilter(SearchType? type) {
    setState(() => _filter = type);
    _run();
  }

  void _useQuery(String query) {
    _query.text = query;
    _query.selection = TextSelection.collapsed(offset: query.length);
    _run();
  }

  void _open(SearchHitDto hit) {
    ref.read(recentSearchesProvider.notifier).add(_query.text);
    ref.read(activityRecorderProvider).search(_query.text);
    if (hit.type == SearchType.calculator && hit.slug != null) {
      context.push(Routes.calculator(hit.slug!));
    } else if (hit.type == SearchType.pregnancy) {
      context.push(Routes.substance(hit.id));
    } else {
      openReference(
        context,
        hit.id,
        hit.type == SearchType.certificate ? ReferenceDocumentType.certificate : ReferenceDocumentType.ordonnance,
      );
    }
  }

  String _typeLabel(AppLocalizations l10n, SearchType type) => switch (type) {
    SearchType.ordonnance => l10n.typesOrdonnances,
    SearchType.certificate => l10n.typesCertificates,
    SearchType.pregnancy => l10n.typesPregnancy,
    _ => l10n.typesCalculators,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final query = _query.text.trim();
    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(DtSpace.s2, DtSpace.s2, DtSpace.s4, DtSpace.s2),
              child: Row(
                children: [
                  IconButton(
                    tooltip: l10n.searchClose,
                    icon: Icon(LucideIcons.chevronLeft, color: colors.ink),
                    onPressed: () => context.pop(),
                  ),
                  Expanded(
                    child: TextField(
                      controller: _query,
                      autofocus: true,
                      onChanged: _changed,
                      onSubmitted: (value) {
                        ref.read(recentSearchesProvider.notifier).add(value);
                        _run();
                      },
                      textInputAction: TextInputAction.search,
                      style: DtType.body.copyWith(color: colors.ink),
                      decoration: InputDecoration(
                        hintText: l10n.searchHint,
                        prefixIcon: Icon(LucideIcons.search, color: colors.inkMuted),
                        suffixIcon: query.isEmpty
                            ? null
                            : IconButton(
                                tooltip: l10n.commonClose,
                                icon: Icon(LucideIcons.x, color: colors.inkMuted),
                                onPressed: () {
                                  _query.clear();
                                  _changed('');
                                },
                              ),
                        filled: true,
                        fillColor: colors.surfaceSunken,
                        isDense: true,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(DtRadius.full),
                          borderSide: BorderSide.none,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            if (query.length >= 2 && _totals.isNotEmpty)
              SizedBox(
                height: DtSize.touchMin,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: DtSpace.s4),
                  children: [
                    _Chip(label: l10n.searchAll, selected: _filter == null, onTap: () => _setFilter(null)),
                    for (final type in [
                      SearchType.ordonnance,
                      SearchType.certificate,
                      SearchType.calculator,
                      SearchType.pregnancy,
                    ])
                      if ((_totals[type] ?? 0) > 0)
                        _Chip(
                          label: '${_typeLabel(l10n, type)} · ${_totals[type]}',
                          selected: _filter == type,
                          onTap: () => _setFilter(type),
                        ),
                  ],
                ),
              ),
            Expanded(child: _body(context, l10n, query)),
          ],
        ),
      ),
    );
  }

  Widget _body(BuildContext context, AppLocalizations l10n, String query) {
    final colors = context.colors;
    if (query.length < 2) return _EmptyQuery(onPick: _useQuery);
    if (_failed && _local.isNotEmpty) {
      return ListView(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(DtSpace.s4, DtSpace.s3, DtSpace.s4, DtSpace.s1),
            child: Text(l10n.offlineSearchLocal, style: DtType.caption.copyWith(color: colors.inkMuted)),
          ),
          for (final content in _local)
            ContentRow(
              icon: content.isCalculator ? LucideIcons.calculator : LucideIcons.fileText,
              title: localizedTitle(context, content.titleFr, content.titleEn),
              access: content.access,
              actionLabel: content.isCalculator ? l10n.libraryOpen : l10n.libraryViewModel,
              highlight: query,
              onOpen: () => openContent(context, content),
            ),
        ],
      );
    }
    if (_failed) {
      return Padding(
        padding: const EdgeInsets.all(DtSpace.s4),
        child: Column(
          children: [
            DtAlert(severity: DtAlertSeverity.neutral, body: l10n.searchUnavailable),
            const SizedBox(height: DtSpace.s3),
            DtButton(label: l10n.commonRetry, variant: DtButtonVariant.secondary, onPressed: _run),
          ],
        ),
      );
    }
    final result = _result;
    if (result == null || (_loading && result.groups.isEmpty)) return const SkeletonRows(count: 5);
    if (result.groups.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(DtSpace.s4),
        children: [
          Text(l10n.searchNoResults(query), style: DtType.body.copyWith(color: colors.inkSecondary)),
          if (result.suggestions.isNotEmpty) ...[
            const SizedBox(height: DtSpace.s4),
            Text(l10n.searchDidYouMean, style: DtType.label.copyWith(color: colors.inkMuted)),
            for (final suggestion in result.suggestions)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(LucideIcons.cornerDownRight, color: colors.brand),
                title: Text(suggestion, style: DtType.body.copyWith(color: colors.brand)),
                onTap: () => _useQuery(suggestion),
              ),
          ],
        ],
      );
    }
    return ListView(
      padding: const EdgeInsets.only(bottom: DtSpace.s8),
      children: [
        for (final group in result.groups) ...[
          Padding(
            padding: const EdgeInsets.fromLTRB(DtSpace.s4, DtSpace.s4, DtSpace.s4, DtSpace.s1),
            child: Text(_typeLabel(l10n, group.type), style: DtType.label.copyWith(color: colors.inkMuted)),
          ),
          for (final hit in group.hits)
            ContentRow(
              icon: switch (hit.type) {
                SearchType.calculator => LucideIcons.calculator,
                SearchType.certificate => LucideIcons.fileBadge,
                SearchType.pregnancy => LucideIcons.baby,
                _ => LucideIcons.fileText,
              },
              title: localizedTitle(context, hit.titleFr, hit.titleEn),
              subtitle: hit.purposeFr == null ? null : localizedTitle(context, hit.purposeFr!, hit.purposeEn),
              access: hit.access,
              actionLabel: hit.type == SearchType.calculator || hit.type == SearchType.pregnancy
                  ? l10n.libraryOpen
                  : l10n.libraryViewModel,
              highlight: query,
              onOpen: () => _open(hit),
            ),
          if (_filter == null && group.total > group.hits.length)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton(
                onPressed: () => _setFilter(group.type),
                child: Text(l10n.searchSeeAll('${group.total}'), style: DtType.label.copyWith(color: colors.brand)),
              ),
            ),
        ],
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Padding(
      padding: const EdgeInsets.only(right: DtSpace.s2),
      child: ChoiceChip(
        label: Text(label, style: DtType.label.copyWith(color: selected ? colors.brandStrong : colors.inkSecondary)),
        selected: selected,
        onSelected: (_) => onTap(),
        showCheckmark: false,
        selectedColor: colors.brandSoft,
        backgroundColor: colors.surface,
        side: BorderSide(color: selected ? colors.brand : colors.border, width: DtBorder.hairline),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(DtRadius.full)),
      ),
    );
  }
}

/// Empty query: recent searches (removable) and the browse chips of the three V1 types.
class _EmptyQuery extends ConsumerWidget {
  const _EmptyQuery({required this.onPick});

  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final recent = ref.watch(recentSearchesProvider).value ?? const [];
    return ListView(
      padding: const EdgeInsets.all(DtSpace.s4),
      children: [
        if (recent.isNotEmpty) ...[
          Row(
            children: [
              Expanded(
                child: Text(l10n.searchRecent, style: DtType.label.copyWith(color: colors.inkMuted)),
              ),
              TextButton(
                onPressed: () => ref.read(recentSearchesProvider.notifier).clear(),
                child: Text(l10n.searchClearRecent, style: DtType.label.copyWith(color: colors.brand)),
              ),
            ],
          ),
          for (final item in recent)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(LucideIcons.history, color: colors.inkMuted),
              title: Text(item, style: DtType.body.copyWith(color: colors.ink)),
              onTap: () => onPick(item),
              trailing: IconButton(
                tooltip: l10n.searchRemoveRecent(item),
                icon: Icon(LucideIcons.x, color: colors.inkMuted, size: DtSpace.s4),
                onPressed: () => ref.read(recentSearchesProvider.notifier).remove(item),
              ),
            ),
          const SizedBox(height: DtSpace.s4),
        ],
        Text(l10n.searchBrowse, style: DtType.label.copyWith(color: colors.inkMuted)),
        const SizedBox(height: DtSpace.s2),
        Wrap(
          spacing: DtSpace.s2,
          runSpacing: DtSpace.s2,
          children: [
            for (final (section, label) in [
              (LibrarySection.ordonnances, l10n.typesOrdonnances),
              (LibrarySection.certificates, l10n.typesCertificates),
              (LibrarySection.calculators, l10n.typesCalculators),
              (LibrarySection.pregnancy, l10n.typesPregnancy),
            ])
              ActionChip(
                label: Text(label, style: DtType.label.copyWith(color: colors.inkSecondary)),
                backgroundColor: colors.surface,
                side: BorderSide(color: colors.border, width: DtBorder.hairline),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(DtRadius.full)),
                onPressed: () => context.go(Routes.library(section)),
              ),
          ],
        ),
      ],
    );
  }
}
