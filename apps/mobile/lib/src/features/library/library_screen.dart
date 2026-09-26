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
import '../../ui/segmented_control.dart';
import '../../ui/skeleton.dart';
import '../../ui/text_match.dart';
import '../../ui/tokens.dart';
import 'library_data.dart';
import '../../core/api/generated/models/favorite_target_type.dart';
import '../activity/favorites_controller.dart';

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

  @override
  void didUpdateWidget(LibraryScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.section != widget.section) _query.clear();
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
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
    };
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(
        backgroundColor: colors.bg,
        surfaceTintColor: colors.bg,
        elevation: 0,
        automaticallyImplyLeading: false,
        title: Text(l10n.libraryTitle, style: DtType.title.copyWith(color: colors.ink)),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(DtSpace.s4, 0, DtSpace.s4, DtSpace.s3),
            child: DtSegmentedControl<LibrarySection>(
              semanticLabel: l10n.libraryTitle,
              selected: section,
              onChanged: (next) => context.go(Routes.library(next)),
              segments: [
                DtSegment(value: LibrarySection.ordonnances, label: l10n.typesOrdonnances),
                DtSegment(value: LibrarySection.certificates, label: l10n.typesCertificates),
                DtSegment(value: LibrarySection.calculators, label: l10n.typesCalculators),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(DtSpace.s4, 0, DtSpace.s4, DtSpace.s2),
            child: TextField(
              controller: _query,
              onChanged: (_) => setState(() {}),
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
            child: section == LibrarySection.calculators
                ? _CalculatorList(query: _query.text)
                : _ReferenceList(section: section, query: _query.text),
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
              onOpen: () => context.push(Routes.reference(item.id)),
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
        padding: const EdgeInsets.only(bottom: DtSize.bottomnav + DtSpace.s6),
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
          for (final (index, row) in rows.indexed) ...[
            if (index > 0) Divider(height: DtBorder.hairline, thickness: DtBorder.hairline, color: colors.border),
            row,
          ],
        ],
      ),
    );
  }
}
