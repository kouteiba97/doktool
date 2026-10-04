import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_error.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/content_row.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/error_text.dart';
import '../../ui/glass.dart';
import '../../ui/hero.dart';
import '../../ui/pill_tabs.dart';
import '../../ui/skeleton.dart';
import '../../ui/text_match.dart';
import '../../ui/tokens.dart';
import '../../core/api/generated/models/substance_item_dto.dart';
import 'library_data.dart';
import '../../core/api/generated/models/favorite_target_type.dart';
import '../activity/activity_screen.dart';
import '../activity/favorites_controller.dart';
import '../analytics/analytics_event.dart';
import '../analytics/analytics_recorder.dart';

/// ScreenReferenceLibrary: segmented Ordonnances · Certificats · Calculateurs, a search field
/// scoped to the section, an A–Z list. A row has one action; a locked row keeps its place with the
/// lock and its reason word. No « new », editor or floating button (Lock L31); no categories (Q8).
class LibraryScreen extends ConsumerStatefulWidget {
  const LibraryScreen({required this.section, super.key});

  final LibrarySection section;

  @override
  ConsumerState<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends ConsumerState<LibraryScreen> {
  final _query = TextEditingController();

  /// A library search counts once the typing has paused, not per keystroke.
  Timer? _report;

  @override
  void didUpdateWidget(LibraryScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.section != widget.section) {
      _report?.cancel();
      _query.clear();
    }
  }

  @override
  void dispose() {
    _report?.cancel();
    _query.dispose();
    super.dispose();
  }

  void _changed(String value) {
    setState(() {});
    _report?.cancel();
    final type = widget.section.documentType;
    final query = value.trim();
    if (type == null || query.length < 2) return;
    _report = Timer(const Duration(seconds: 1), () {
      final items = ref.read(referenceListProvider(type)).value;
      if (items == null) return;
      ref
          .read(analyticsRecorderProvider)
          .record(
            AnalyticsEvent.referenceSearched(
              referenceType: type,
              resultCount: items.where((item) => matchesAllWords(query, [item.titleFr, item.titleEn])).length,
            ),
          );
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final section = widget.section;
    final hint = switch (section) {
      LibrarySection.ordonnances => l10n.librarySearchOrdonnances,
      LibrarySection.certificates => l10n.librarySearchCertificates,
      LibrarySection.calculators => l10n.librarySearchCalculators,
      LibrarySection.pregnancy => l10n.librarySearchPregnancy,
    };
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: DtHeroAppBar(title: l10n.libraryTitle, showBack: false),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: DtSpace.s3),
            child: DtPillTabs<LibrarySection>(
              semanticLabel: l10n.libraryTitle,
              selected: section,
              onChanged: (next) => context.go(Routes.library(next)),
              tabs: [
                DtPillTab(value: LibrarySection.ordonnances, label: l10n.typesOrdonnances, icon: LucideIcons.fileText),
                DtPillTab(
                  value: LibrarySection.certificates,
                  label: l10n.typesCertificates,
                  icon: LucideIcons.fileBadge,
                ),
                DtPillTab(
                  value: LibrarySection.calculators,
                  label: l10n.typesCalculators,
                  icon: LucideIcons.calculator,
                ),
                DtPillTab(value: LibrarySection.pregnancy, label: l10n.typesPregnancy, icon: LucideIcons.baby),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(DtSpace.s4, 0, DtSpace.s4, DtSpace.s2),
            child: TextField(
              controller: _query,
              onChanged: _changed,
              textInputAction: TextInputAction.search,
              style: DtType.body.copyWith(color: colors.ink),
              decoration: InputDecoration(
                hintText: hint,
                prefixIcon: Icon(LucideIcons.search, color: colors.inkMuted),
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
          Expanded(
            child: switch (section) {
              LibrarySection.calculators => _CalculatorList(query: _query.text),
              LibrarySection.pregnancy => _SubstanceList(query: _query.text),
              _ => _ReferenceList(section: section, query: _query.text),
            },
          ),
        ],
      ),
    );
  }
}

class _ReferenceList extends ConsumerWidget {
  const _ReferenceList({required this.section, required this.query});

  final LibrarySection section;
  final String query;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final provider = referenceListProvider(section.documentType!);
    final items = ref.watch(provider);
    final favorites = ref.watch(favoritesProvider).value;
    final sorted = [...?items.value]
      ..sort((a, b) {
        final starredA = favorites?.contains(FavoriteTargetType.referenceDocument, a.id) ?? false;
        final starredB = favorites?.contains(FavoriteTargetType.referenceDocument, b.id) ?? false;
        return starredA == starredB ? 0 : (starredA ? -1 : 1);
      });
    return _ListState(
      loading: items.isLoading && !items.hasValue,
      error: items.hasError && !items.hasValue ? ApiError.from(items.error!) : null,
      onRetry: () => ref.invalidate(provider),
      onRefresh: () => ref.refresh(provider.future),
      emptyText: l10n.libraryEmpty,
      query: query,
      rows: [
        for (final item in sorted)
          if (matchesAllWords(query, [item.titleFr, item.titleEn]))
            ContentRow(
              icon: section == LibrarySection.ordonnances ? LucideIcons.fileText : LucideIcons.fileBadge,
              title: localizedTitle(context, item.titleFr, item.titleEn),
              access: item.access,
              actionLabel: l10n.libraryViewModel,
              highlight: query,
              onOpen: () => openReference(context, item.id, section.documentType!),
            ),
      ],
      total: items.value?.length ?? 0,
    );
  }
}

class _CalculatorList extends ConsumerWidget {
  const _CalculatorList({required this.query});

  final String query;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final items = ref.watch(calculatorListProvider);
    final favorites = ref.watch(favoritesProvider).value;
    final sorted = [...?items.value]
      ..sort((a, b) {
        final starredA = favorites?.contains(FavoriteTargetType.calculator, a.id) ?? false;
        final starredB = favorites?.contains(FavoriteTargetType.calculator, b.id) ?? false;
        return starredA == starredB ? 0 : (starredA ? -1 : 1);
      });
    return _ListState(
      loading: items.isLoading && !items.hasValue,
      error: items.hasError && !items.hasValue ? ApiError.from(items.error!) : null,
      onRetry: () => ref.invalidate(calculatorListProvider),
      onRefresh: () => ref.refresh(calculatorListProvider.future),
      emptyText: l10n.libraryEmptyCalculators,
      query: query,
      rows: [
        for (final item in sorted)
          if (matchesAllWords(query, [item.nameFr, item.nameEn, item.purposeFr, item.purposeEn]))
            ContentRow(
              icon: LucideIcons.calculator,
              title: localizedTitle(context, item.nameFr, item.nameEn),
              subtitle: localizedTitle(context, item.purposeFr ?? '', item.purposeEn),
              access: item.access,
              actionLabel: l10n.libraryOpen,
              highlight: query,
              onOpen: () => context.push(Routes.calculator(item.slug)),
            ),
      ],
      total: items.value?.length ?? 0,
    );
  }
}

/// « Grossesse · Allaitement »: substances A–Z, found by name or synonym (ADR-019).
class _SubstanceList extends ConsumerWidget {
  const _SubstanceList({required this.query});

  final String query;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final items = ref.watch(substanceListProvider);
    return _ListState(
      loading: items.isLoading && !items.hasValue,
      error: items.hasError && !items.hasValue ? ApiError.from(items.error!) : null,
      onRetry: () => ref.invalidate(substanceListProvider),
      onRefresh: () => ref.refresh(substanceListProvider.future),
      emptyText: l10n.libraryEmptyPregnancy,
      query: query,
      rows: [
        for (final item in items.value ?? const <SubstanceItemDto>[])
          if (matchesAllWords(query, [item.nameFr, item.nameEn, ...item.synonyms]))
            ContentRow(
              icon: LucideIcons.baby,
              title: localizedTitle(context, item.nameFr, item.nameEn),
              access: item.access,
              actionLabel: l10n.libraryOpen,
              highlight: query,
              onOpen: () => context.push(Routes.substance(item.id)),
            ),
      ],
      total: items.value?.length ?? 0,
    );
  }
}

class _ListState extends StatelessWidget {
  const _ListState({
    required this.loading,
    required this.error,
    required this.onRetry,
    required this.onRefresh,
    required this.emptyText,
    required this.query,
    required this.rows,
    required this.total,
  });

  final bool loading;
  final ApiError? error;
  final VoidCallback onRetry;
  final Future<void> Function() onRefresh;
  final String emptyText;
  final String query;
  final List<Widget> rows;
  final int total;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    if (loading) return const SkeletonRows();
    if (error != null) {
      return Padding(
        padding: const EdgeInsets.all(DtSpace.s4),
        child: Column(
          children: [
            DtAlert(severity: DtAlertSeverity.neutral, body: commonErrorText(context, error!)),
            const SizedBox(height: DtSpace.s3),
            DtButton(label: l10n.commonRetry, variant: DtButtonVariant.secondary, onPressed: onRetry),
          ],
        ),
      );
    }
    final message = total == 0
        ? emptyText
        : rows.isEmpty
        ? l10n.libraryNoResults(query.trim())
        : null;
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(DtSpace.s4, DtSpace.s2, DtSpace.s4, DtSize.bottomnav + DtSpace.s10),
        children: [
          if (message != null)
            Padding(
              padding: const EdgeInsets.all(DtSpace.s12),
              child: Text(
                message,
                textAlign: TextAlign.center,
                style: DtType.body.copyWith(color: colors.inkMuted),
              ),
            ),
          if (rows.isNotEmpty)
            DtLiftedCard(
              padding: EdgeInsets.zero,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(DtRadius.xl),
                child: Column(
                  children: [
                    for (final (index, row) in rows.indexed) ...[
                      if (index > 0)
                        Divider(height: DtBorder.hairline, thickness: DtBorder.hairline, color: colors.border),
                      row,
                    ],
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
