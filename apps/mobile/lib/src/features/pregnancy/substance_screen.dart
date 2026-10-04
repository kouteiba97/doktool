import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/models/access_state.dart';
import '../../core/api/generated/models/clinical_source_dto.dart';
import '../../core/api/generated/models/conduct.dart';
import '../../core/api/generated/models/lactation_block_dto.dart';
import '../../core/api/generated/models/pregnancy_block_dto.dart';
import '../../core/api/generated/models/pregnancy_period_dto.dart';
import '../../core/api/generated/models/profile_conflict_dto.dart';
import '../../core/api/generated/models/profile_evidence_dto.dart';
import '../../core/api/generated/models/profile_text_dto.dart';
import '../../core/api/generated/models/substance_profile_dto.dart';
import '../../core/api/generated/models/substance_ref_dto.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/content_row.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_badge.dart';
import '../../ui/dt_button.dart';
import '../../ui/error_text.dart';
import '../../ui/hero.dart';
import '../../ui/locks.dart';
import '../../ui/pill_tabs.dart';
import '../../ui/segmented_control.dart';
import '../../ui/skeleton.dart';
import '../../ui/tokens.dart';
import '../analytics/analytics_event.dart';
import '../analytics/analytics_recorder.dart';
import 'report_sheet.dart';

/// One substance's published profile, with the server's access decision (ADR-019).
final substanceProvider = FutureProvider.autoDispose.family<SubstanceProfileDto, String>(
  (ref, id) => ref.watch(apiProvider).pregnancy.pregnancyControllerGet(id: id),
);

enum _Period { t1, t2, t3, peripartum }

/// « Grossesse · Allaitement » for one substance (ScreenPregnancyDesktop, ScreenLactationMobile,
/// EvidenceBlock): conduct and evidence level side by side but never merged, no safe/unsafe verdict,
/// « Absence de données » as a full block, the evidence footer under every block.
class SubstanceScreen extends ConsumerStatefulWidget {
  const SubstanceScreen({required this.id, super.key});

  final String id;

  @override
  ConsumerState<SubstanceScreen> createState() => _SubstanceScreenState();
}

class _SubstanceScreenState extends ConsumerState<SubstanceScreen> {
  PregnancySection _section = PregnancySection.pregnancy;
  final Set<PregnancySection> _recorded = {};

  void _record(SubstanceProfileDto profile) {
    if (profile.access.state != AccessState.available || !_recorded.add(_section)) return;
    ref
        .read(analyticsRecorderProvider)
        .record(AnalyticsEvent.pregnancyViewed(id: profile.id, section: _section, version: profile.version.toInt()));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final profile = ref.watch(substanceProvider(widget.id));
    ref.listen(substanceProvider(widget.id), (_, next) {
      final value = next.value;
      if (value != null) _record(value);
    });
    final item = profile.value;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: DtHeroAppBar(
        titleWidget: item == null
            ? null
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    localizedTitle(context, item.nameFr, item.nameEn),
                    overflow: TextOverflow.ellipsis,
                    style: DtType.heading.copyWith(color: colors.onHero),
                  ),
                  Text(
                    l10n.pregnancyMeta('${item.version}'),
                    overflow: TextOverflow.ellipsis,
                    style: DtType.caption.copyWith(color: colors.onHero),
                  ),
                ],
              ),
      ),
      body: profile.when(
        loading: () => const SkeletonRows(count: 6),
        error: (error, _) =>
            _Failure(error: ApiError.from(error), onRetry: () => ref.invalidate(substanceProvider(widget.id))),
        data: (value) => _Profile(
          profile: value,
          section: _section,
          onSection: (section) {
            setState(() => _section = section);
            _record(value);
          },
        ),
      ),
    );
  }
}

class _Failure extends StatelessWidget {
  const _Failure({required this.error, required this.onRetry});

  final ApiError error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final gone = error.code == 'CONTENT_UNAVAILABLE';
    return Padding(
      padding: const EdgeInsets.all(DtSpace.s4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DtAlert(
            severity: error.isNetwork ? DtAlertSeverity.offline : DtAlertSeverity.neutral,
            title: error.isNetwork ? l10n.commonConnectionRequired : null,
            body: gone
                ? l10n.pregnancyGone
                : error.isNetwork
                ? l10n.pregnancyOnline
                : commonErrorText(context, error),
          ),
          if (!gone) ...[
            const SizedBox(height: DtSpace.s3),
            DtButton(label: l10n.commonRetry, variant: DtButtonVariant.secondary, onPressed: onRetry),
          ],
        ],
      ),
    );
  }
}

class _Profile extends StatelessWidget {
  const _Profile({required this.profile, required this.section, required this.onSection});

  final SubstanceProfileDto profile;
  final PregnancySection section;
  final ValueChanged<PregnancySection> onSection;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final content = profile.content;
    if (profile.access.state == AccessState.locked || content == null) {
      return ListView(
        padding: const EdgeInsets.all(DtSpace.s4),
        children: [
          DtAlert(
            severity: DtAlertSeverity.neutral,
            title: lockWord(l10n, profile.access.lockReason),
            body: lockExplanation(l10n, profile.access.lockReason),
          ),
          const SizedBox(height: DtSpace.s3),
          DtButton(
            label: l10n.pregnancyUnlock,
            variant: DtButtonVariant.secondary,
            onPressed: () =>
                showLockSheet(context, profile.access, title: localizedTitle(context, profile.nameFr, profile.nameEn)),
          ),
        ],
      );
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(DtSpace.s4, 0, DtSpace.s4, DtSpace.s8),
      children: [
        if (profile.underReview) ...[
          DtAlert(severity: DtAlertSeverity.info, body: l10n.pregnancyUnderReview),
          const SizedBox(height: DtSpace.s3),
        ],
        DtSegmentedControl<PregnancySection>(
          semanticLabel: l10n.typesPregnancy,
          selected: section,
          onChanged: onSection,
          segments: [
            DtSegment(value: PregnancySection.pregnancy, label: l10n.pregnancySectionPregnancy),
            DtSegment(value: PregnancySection.lactation, label: l10n.pregnancySectionLactation),
          ],
        ),
        const SizedBox(height: DtSpace.s4),
        if (section == PregnancySection.pregnancy)
          content.pregnancy == null
              ? DtAlert(severity: DtAlertSeverity.neutral, body: l10n.pregnancyBlockMissing)
              : _PregnancyBlock(block: content.pregnancy!, profile: profile)
        else
          content.lactation == null
              ? DtAlert(severity: DtAlertSeverity.neutral, body: l10n.pregnancyBlockMissing)
              : _LactationBlock(block: content.lactation!, profile: profile),
        _EvidenceFooter(profile: profile, section: section),
      ],
    );
  }
}

/// The author's text in the interface language, French when no English was written.
String? _text(BuildContext context, ProfileTextDto? text) {
  if (text == null) return null;
  final english = Localizations.localeOf(context).languageCode == 'en';
  return english && text.en != null && text.en!.isNotEmpty ? text.en : text.fr;
}

String _evidenceWord(AppLocalizations l10n, num level) => switch (level.toInt()) {
  4 => l10n.pregnancyEvidence4,
  3 => l10n.pregnancyEvidence3,
  2 => l10n.pregnancyEvidence2,
  1 => l10n.pregnancyEvidence1,
  _ => l10n.pregnancyEvidence0,
};

/// A clinical instruction as icon + word; never a « safe » verdict.
class ConductBadge extends StatelessWidget {
  const ConductBadge({required this.conduct, super.key});

  final Conduct conduct;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return switch (conduct) {
      Conduct.contraindicated => DtBadge(
        text: l10n.pregnancyConductContraindicated,
        variant: DtBadgeVariant.critical,
        icon: LucideIcons.ban,
      ),
      Conduct.avoid => DtBadge(
        text: l10n.pregnancyConductAvoid,
        variant: DtBadgeVariant.critical,
        icon: LucideIcons.circleOff,
      ),
      _ => DtBadge(text: l10n.pregnancyConductOccasional, variant: DtBadgeVariant.warning, icon: LucideIcons.clock3),
    };
  }
}

/// Four neutral segments, the level word and the population — the word carries the meaning.
class EvidenceMeter extends StatelessWidget {
  const EvidenceMeter({required this.evidence, super.key});

  final ProfileEvidenceDto evidence;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final level = evidence.level.toInt();
    final word = _evidenceWord(l10n, level);
    final population = _text(context, evidence.population);
    return Semantics(
      container: true,
      label: l10n.pregnancyMeterLabel(word, '$level'),
      excludeSemantics: true,
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: DtSpace.s2,
        runSpacing: DtSpace.s1,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var segment = 1; segment <= 4; segment++)
                Container(
                  width: DtSpace.s5,
                  height: DtSpace.s1 + DtSpace.s1 / 2,
                  margin: const EdgeInsetsDirectional.only(end: DtSpace.s1 / 2),
                  decoration: BoxDecoration(
                    color: segment <= level ? colors.inkSecondary : colors.border,
                    borderRadius: BorderRadius.circular(DtRadius.full),
                  ),
                ),
            ],
          ),
          Text(word, style: DtType.label.copyWith(color: colors.ink)),
          if (population != null) Text(population, style: DtType.caption.copyWith(color: colors.inkMuted)),
        ],
      ),
    );
  }
}

class _Labelled extends StatelessWidget {
  const _Labelled({required this.label, required this.text});

  final String label;
  final String? text;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    if (text == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: DtSpace.s4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text(label, style: DtType.label.copyWith(color: colors.inkMuted)),
          ),
          const SizedBox(height: DtSpace.s1),
          Text(text!, style: DtType.body.copyWith(color: colors.ink)),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(DtSpace.s4),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(DtRadius.xl),
        border: Border.all(color: colors.glassHighlight, width: DtBorder.hairline),
        boxShadow: context.elevation.glass,
      ),
      child: child,
    );
  }
}

class _EvidenceLine extends StatelessWidget {
  const _EvidenceLine({required this.evidence});

  final ProfileEvidenceDto evidence;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: DtSpace.s4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.pregnancyEvidence, style: DtType.label.copyWith(color: colors.inkMuted)),
          const SizedBox(height: DtSpace.s1),
          EvidenceMeter(evidence: evidence),
        ],
      ),
    );
  }
}

class _Alternatives extends StatelessWidget {
  const _Alternatives({required this.ids, required this.profile});

  final List<String> ids;
  final SubstanceProfileDto profile;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final refs = <SubstanceRefDto>[
      for (final id in ids) ...profile.alternatives.where((alternative) => alternative.id == id),
    ];
    if (refs.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(l10n.pregnancyAlternatives, style: DtType.label.copyWith(color: colors.inkMuted)),
        const SizedBox(height: DtSpace.s2),
        Wrap(
          spacing: DtSpace.s2,
          runSpacing: DtSpace.s2,
          children: [
            for (final alternative in refs)
              ActionChip(
                label: Text(
                  localizedTitle(context, alternative.nameFr, alternative.nameEn),
                  style: DtType.label.copyWith(color: colors.brandStrong),
                ),
                backgroundColor: colors.brandSoft,
                side: BorderSide(color: colors.brandSoft, width: DtBorder.hairline),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(DtRadius.full)),
                onPressed: () => context.push(Routes.substance(alternative.id)),
              ),
          ],
        ),
      ],
    );
  }
}

/// « Absence de données — ce n'est pas une preuve d'innocuité »: a full block with alternatives.
class _NoData extends StatelessWidget {
  const _NoData({required this.alternatives, required this.profile});

  final List<String> alternatives;
  final SubstanceProfileDto profile;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(LucideIcons.searchX, color: colors.inkSecondary, size: DtSpace.s5),
            const SizedBox(width: DtSpace.s2),
            Expanded(
              child: Text(l10n.pregnancyNoDataTitle, style: DtType.heading.copyWith(color: colors.ink)),
            ),
          ],
        ),
        const SizedBox(height: DtSpace.s1),
        Text(l10n.pregnancyNoDataBody, style: DtType.body.copyWith(color: colors.inkSecondary)),
        const SizedBox(height: DtSpace.s4),
        _Alternatives(ids: alternatives, profile: profile),
      ],
    );
  }
}

class _ConflictAlert extends StatelessWidget {
  const _ConflictAlert({required this.conflict, required this.sources});

  final ProfileConflictDto? conflict;
  final List<ClinicalSourceDto> sources;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    if (conflict == null) return const SizedBox.shrink();
    String title(String id) => sources.where((source) => source.id == id).firstOrNull?.title ?? '—';
    return Padding(
      padding: const EdgeInsets.only(bottom: DtSpace.s3),
      child: DtAlert(
        severity: DtAlertSeverity.info,
        title: l10n.pregnancyConflict(title(conflict!.sourceIds.first), title(conflict!.sourceIds.last)),
        body: _text(context, conflict!.synthesis) ?? '',
      ),
    );
  }
}

class _PregnancyBlock extends StatefulWidget {
  const _PregnancyBlock({required this.block, required this.profile});

  final PregnancyBlockDto block;
  final SubstanceProfileDto profile;

  @override
  State<_PregnancyBlock> createState() => _PregnancyBlockState();
}

class _PregnancyBlockState extends State<_PregnancyBlock> {
  _Period _period = _Period.t1;

  PregnancyPeriodDto? _of(_Period period) => switch (period) {
    _Period.t1 => widget.block.periods.t1,
    _Period.t2 => widget.block.periods.t2,
    _Period.t3 => widget.block.periods.t3,
    _Period.peripartum => widget.block.periods.peripartum,
  };

  String _label(AppLocalizations l10n, _Period period) => switch (period) {
    _Period.t1 => l10n.pregnancyT1,
    _Period.t2 => l10n.pregnancyT2,
    _Period.t3 => l10n.pregnancyT3,
    _Period.peripartum => l10n.pregnancyPeripartum,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final value = _of(_period);
    final alternatives = widget.block.alternatives;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _ConflictAlert(conflict: widget.block.conflict, sources: widget.profile.sources),
        DtPillTabs<_Period>(
          semanticLabel: l10n.pregnancyPeriods,
          selected: _period,
          padding: EdgeInsets.zero,
          onChanged: (period) => setState(() => _period = period),
          tabs: [for (final period in _Period.values) DtPillTab(value: period, label: _label(l10n, period))],
        ),
        const SizedBox(height: DtSpace.s3),
        _Section(
          child: value == null
              ? Text(l10n.pregnancyPeriodMissing, style: DtType.body.copyWith(color: colors.inkSecondary))
              : value.evidence.level == 0
              ? _NoData(alternatives: alternatives, profile: widget.profile)
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_label(l10n, _period), style: DtType.heading.copyWith(color: colors.ink)),
                    const SizedBox(height: DtSpace.s3),
                    if (value.conduct != null && value.conduct != Conduct.$unknown) ...[
                      ConductBadge(conduct: value.conduct!),
                      const SizedBox(height: DtSpace.s2),
                      if (_text(context, value.conductDetail) != null)
                        Text(
                          _text(context, value.conductDetail)!,
                          style: DtType.bodyStrong.copyWith(color: colors.ink),
                        ),
                      const SizedBox(height: DtSpace.s4),
                    ],
                    _Labelled(label: l10n.pregnancyRiskContext, text: _text(context, value.riskContext)),
                    _EvidenceLine(evidence: value.evidence),
                    _Labelled(label: l10n.pregnancyConsiderations, text: _text(context, value.considerations)),
                    _Alternatives(ids: alternatives, profile: widget.profile),
                  ],
                ),
        ),
        const SizedBox(height: DtSpace.s4),
        Semantics(
          header: true,
          child: Text(l10n.pregnancyByPeriod, style: DtType.label.copyWith(color: colors.inkMuted)),
        ),
        const SizedBox(height: DtSpace.s2),
        for (final period in _Period.values)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: DtSpace.s1),
            child: Row(
              children: [
                Expanded(
                  child: Text(_label(l10n, period), style: DtType.body.copyWith(color: colors.ink)),
                ),
                Text(
                  _of(period) == null ? '—' : _evidenceWord(l10n, _of(period)!.evidence.level),
                  style: DtType.caption.copyWith(color: colors.inkSecondary),
                ),
                if (_of(period)?.conduct != null && _of(period)!.conduct != Conduct.$unknown) ...[
                  const SizedBox(width: DtSpace.s2),
                  ConductBadge(conduct: _of(period)!.conduct!),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class _LactationBlock extends StatelessWidget {
  const _LactationBlock({required this.block, required this.profile});

  final LactationBlockDto block;
  final SubstanceProfileDto profile;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    Widget figure(String label, String? value) => value == null
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.only(bottom: DtSpace.s2),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(label, style: DtType.body.copyWith(color: colors.inkSecondary)),
                ),
                Text(value, style: DtType.mono.copyWith(color: colors.ink)),
              ],
            ),
          );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _ConflictAlert(conflict: block.conflict, sources: profile.sources),
        _Section(
          child: block.evidence.level == 0
              ? _NoData(alternatives: block.alternatives, profile: profile)
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(l10n.pregnancyConduct, style: DtType.label.copyWith(color: colors.inkMuted)),
                        ),
                        if (block.conduct != null && block.conduct != Conduct.$unknown)
                          ConductBadge(conduct: block.conduct!),
                      ],
                    ),
                    const SizedBox(height: DtSpace.s1),
                    if (_text(context, block.conductText) != null)
                      Text(_text(context, block.conductText)!, style: DtType.bodyStrong.copyWith(color: colors.ink)),
                    const SizedBox(height: DtSpace.s4),
                    if (block.relativeInfantDose != null ||
                        block.maternalHalfLife != null ||
                        block.reportedEffects != null) ...[
                      Text(l10n.pregnancyInfantExposure, style: DtType.label.copyWith(color: colors.inkMuted)),
                      const SizedBox(height: DtSpace.s2),
                      figure(l10n.pregnancyRid, block.relativeInfantDose),
                      figure(l10n.pregnancyHalfLife, block.maternalHalfLife),
                      const SizedBox(height: DtSpace.s2),
                      _Labelled(label: l10n.pregnancyReportedEffects, text: _text(context, block.reportedEffects)),
                    ],
                    _Labelled(label: l10n.pregnancySpecialPopulations, text: _text(context, block.specialPopulations)),
                    _EvidenceLine(evidence: block.evidence),
                    _Labelled(label: l10n.pregnancyConsiderations, text: _text(context, block.considerations)),
                    _Alternatives(ids: block.alternatives, profile: profile),
                  ],
                ),
        ),
      ],
    );
  }
}

/// Sources (title · edition), reviewer and date, version, « Signaler une erreur » (section 25).
class _EvidenceFooter extends StatelessWidget {
  const _EvidenceFooter({required this.profile, required this.section});

  final SubstanceProfileDto profile;
  final PregnancySection section;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final style = DtType.caption.copyWith(color: colors.inkMuted);
    final sources = profile.sources
        .map((source) => [source.title, source.edition ?? source.year?.toString()].whereType<String>().join(' '))
        .join(' · ');
    return Padding(
      padding: const EdgeInsets.only(top: DtSpace.s4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Divider(height: DtBorder.hairline, thickness: DtBorder.hairline, color: colors.border),
          const SizedBox(height: DtSpace.s3),
          Text(l10n.pregnancySources(sources), style: style),
          const SizedBox(height: DtSpace.s1),
          Text(l10n.pregnancyReviewed(dateText(context, profile.reviewedAt), profile.reviewerName), style: style),
          const SizedBox(height: DtSpace.s1),
          Text('v${profile.version}', style: DtType.mono.copyWith(color: colors.inkMuted)),
          TextButton.icon(
            style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, DtSize.touchMin)),
            onPressed: () => showReportSheet(context, profile: profile, section: section),
            icon: Icon(LucideIcons.flag, size: DtSpace.s4, color: colors.brand),
            label: Text(l10n.pregnancyReport, style: DtType.label.copyWith(color: colors.brand)),
          ),
        ],
      ),
    );
  }
}
