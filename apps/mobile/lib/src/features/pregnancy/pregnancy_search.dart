import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/models/conduct.dart';
import '../../core/api/generated/models/period_summaries_dto.dart';
import '../../core/api/generated/models/period_summary_dto.dart';
import '../../core/api/generated/models/substance_hit_dto.dart';
import '../../core/auth/session_controller.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/content_row.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/error_text.dart';
import '../../ui/glass.dart';
import '../../ui/pill_tabs.dart';
import '../../ui/skeleton.dart';
import '../../ui/text_match.dart';
import '../../ui/tokens.dart';
import '../offline/offline_store.dart';
import 'substance_screen.dart';

/// The period a « Grossesse » search answers for; null = no period chosen.
enum SearchPeriod { t1, t2, t3, peripartum, lactation }

PeriodSummaryDto? summaryFor(PeriodSummariesDto? periods, SearchPeriod period) => switch (period) {
  SearchPeriod.t1 => periods?.t1,
  SearchPeriod.t2 => periods?.t2,
  SearchPeriod.t3 => periods?.t3,
  SearchPeriod.peripartum => periods?.peripartum,
  SearchPeriod.lactation => periods?.lactation,
};

String searchPeriodLabel(AppLocalizations l10n, SearchPeriod period) => switch (period) {
  SearchPeriod.t1 => l10n.pregnancyT1,
  SearchPeriod.t2 => l10n.pregnancyT2,
  SearchPeriod.t3 => l10n.pregnancyT3,
  SearchPeriod.peripartum => l10n.pregnancyPeripartum,
  SearchPeriod.lactation => l10n.pregnancySectionLactation,
};

/// One page of results; `offline` when it came from the profiles kept on the device.
typedef SubstanceResults = ({List<SubstanceHitDto> items, int total, bool offline});

const _pageSize = 20;

/// Server-side search (ADR-025): partial, accent-insensitive words, bounded pages. Without a
/// connection it searches only the profiles kept offline, and says so.
final substanceSearchProvider = FutureProvider.autoDispose.family<SubstanceResults, ({String q, int limit})>((
  ref,
  query,
) async {
  ref.watch(sessionControllerProvider);
  try {
    final page = await ref.watch(apiProvider).pregnancy.pregnancyControllerSearch(q: query.q, limit: query.limit);
    return (items: page.items, total: page.total.toInt(), offline: false);
  } catch (error) {
    if (!ApiError.from(error).isNetwork) rethrow;
    final kept = (await ref.read(offlineStoreProvider).substanceHits())
        .where((hit) => matchesAllWords(query.q, [hit.nameFr, hit.nameEn, ...hit.synonyms]))
        .toList();
    return (items: kept.take(query.limit).toList(), total: kept.length, offline: true);
  }
});

/// « Grossesse · Allaitement » in the library: type a few letters of the drug, pick the period,
/// read its conduct on the row. Locked rows keep their place with their reason.
class SubstanceSearch extends ConsumerStatefulWidget {
  const SubstanceSearch({required this.query, super.key});

  final String query;

  @override
  ConsumerState<SubstanceSearch> createState() => _SubstanceSearchState();
}

class _SubstanceSearchState extends ConsumerState<SubstanceSearch> {
  String _debounced = '';
  int _limit = _pageSize;
  SearchPeriod? _period;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _debounced = widget.query.trim();
  }

  @override
  void didUpdateWidget(SubstanceSearch oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.query == widget.query) return;
    _timer?.cancel();
    // A request once typing pauses, not per keystroke.
    _timer = Timer(const Duration(milliseconds: 300), () {
      if (!mounted) return;
      setState(() {
        _debounced = widget.query.trim();
        _limit = _pageSize;
      });
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final key = (q: _debounced, limit: _limit);
    final results = ref.watch(substanceSearchProvider(key));
    final data = results.value;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: DtSpace.s2),
          child: DtPillTabs<SearchPeriod?>(
            semanticLabel: l10n.pregnancySearchPeriod,
            selected: _period,
            onChanged: (period) => setState(() => _period = period),
            tabs: [
              DtPillTab(value: null, label: l10n.pregnancySearchAllPeriods),
              for (final period in SearchPeriod.values)
                DtPillTab(value: period, label: searchPeriodLabel(l10n, period)),
            ],
          ),
        ),
        Expanded(
          child: results.isLoading && data == null
              ? const SkeletonRows()
              : results.hasError && data == null
              ? Padding(
                  padding: const EdgeInsets.all(DtSpace.s4),
                  child: Column(
                    children: [
                      DtAlert(
                        severity: DtAlertSeverity.neutral,
                        body: commonErrorText(context, ApiError.from(results.error!)),
                      ),
                      const SizedBox(height: DtSpace.s3),
                      DtButton(
                        label: l10n.commonRetry,
                        variant: DtButtonVariant.secondary,
                        onPressed: () => ref.invalidate(substanceSearchProvider(key)),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  onRefresh: () => ref.refresh(substanceSearchProvider(key).future),
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(
                      DtSpace.s4,
                      DtSpace.s2,
                      DtSpace.s4,
                      DtSize.bottomnav + DtSpace.s10,
                    ),
                    children: [
                      if (data!.offline)
                        Padding(
                          padding: const EdgeInsets.only(bottom: DtSpace.s3),
                          child: DtAlert(severity: DtAlertSeverity.info, body: l10n.pregnancySearchOffline),
                        ),
                      if (data.items.isEmpty)
                        Padding(
                          padding: const EdgeInsets.all(DtSpace.s12),
                          child: Text(
                            _debounced.isEmpty ? l10n.libraryEmptyPregnancy : l10n.libraryNoResults(_debounced),
                            textAlign: TextAlign.center,
                            style: DtType.body.copyWith(color: colors.inkMuted),
                          ),
                        )
                      else
                        DtLiftedCard(
                          padding: EdgeInsets.zero,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(DtRadius.xl),
                            child: Column(
                              children: [
                                for (final (index, hit) in data.items.indexed) ...[
                                  if (index > 0)
                                    Divider(
                                      height: DtBorder.hairline,
                                      thickness: DtBorder.hairline,
                                      color: colors.border,
                                    ),
                                  _HitRow(hit: hit, period: _period, query: _debounced),
                                ],
                              ],
                            ),
                          ),
                        ),
                      if (data.items.length < data.total)
                        Padding(
                          padding: const EdgeInsets.only(top: DtSpace.s3),
                          child: DtButton(
                            label: l10n.pregnancySearchMore('${data.total - data.items.length}'),
                            variant: DtButtonVariant.secondary,
                            onPressed: () => setState(() => _limit += _pageSize),
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

class _HitRow extends StatelessWidget {
  const _HitRow({required this.hit, required this.period, required this.query});

  final SubstanceHitDto hit;
  final SearchPeriod? period;
  final String query;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final title = localizedTitle(context, hit.nameFr, hit.nameEn);
    Widget? detail;
    String? detailLabel;
    final chosen = period;
    if (chosen != null && hit.periods != null) {
      final summary = summaryFor(hit.periods, chosen);
      final periodName = searchPeriodLabel(l10n, chosen);
      if (summary == null) {
        // Nothing approved for this period: say so, never imply safe or unsafe.
        detailLabel = l10n.pregnancySearchNoData(periodName);
        detail = Text(detailLabel, style: DtType.caption.copyWith(color: colors.inkSecondary));
      } else {
        final conduct = summary.conduct;
        final level = summary.evidenceLevel;
        final evidence = level == null ? null : evidenceWord(l10n, level);
        final hasConduct = conduct != null && conduct != Conduct.$unknown;
        detailLabel = [
          periodName,
          if (hasConduct) conductWord(l10n, conduct) else l10n.pregnancySearchNoBadge,
          ?evidence,
        ].join(', ');
        detail = Wrap(
          spacing: DtSpace.s2,
          runSpacing: DtSpace.s1,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            if (hasConduct)
              ConductBadge(conduct: conduct)
            else
              Text(l10n.pregnancySearchNoBadge, style: DtType.caption.copyWith(color: colors.inkSecondary)),
            if (evidence != null) Text(evidence, style: DtType.caption.copyWith(color: colors.inkMuted)),
          ],
        );
      }
    }
    return ContentRow(
      icon: LucideIcons.baby,
      title: title,
      access: hit.access,
      actionLabel: l10n.libraryOpen,
      highlight: query,
      detail: detail,
      detailLabel: detailLabel,
      onOpen: () => context.push(Routes.substance(hit.id)),
    );
  }
}
