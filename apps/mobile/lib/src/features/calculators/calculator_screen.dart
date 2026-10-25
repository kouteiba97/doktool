import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/api/api_error.dart';
import '../../core/api/generated/models/calculator_detail_dto.dart';
import '../../core/api/generated/models/calculator_source_role.dart';
import '../../core/api/generated/models/source_dto.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/content_row.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_badge.dart';
import '../../ui/dt_button.dart';
import '../../ui/error_text.dart';
import '../../ui/hero.dart';
import '../../ui/locks.dart';
import '../../ui/choice_list.dart';
import '../../ui/segmented_control.dart';
import '../../ui/skeleton.dart';
import '../../ui/tokens.dart';
import 'calculator_runtime.dart';
import 'engine/definition.dart';
import 'engine/evaluate.dart';
import 'engine/formula_text.dart';
import '../../core/api/generated/models/favorite_target_type.dart';
import '../activity/activity_recorder.dart';
import '../activity/favorite_button.dart';
import '../analytics/analytics_event.dart';
import '../analytics/analytics_recorder.dart';

/// ScreenCalculatorMobile: select tool → enter validated inputs → calculate → review result +
/// source → done (section 28). Computed on the device with the published, self-tested version.
class CalculatorScreen extends ConsumerWidget {
  const CalculatorScreen({required this.slug, super.key});

  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final runtime = ref.watch(calculatorRuntimeProvider(slug));
    return runtime.when(
      loading: () => Scaffold(backgroundColor: colors.bg, appBar: const DtHeroAppBar(), body: const SkeletonRows()),
      error: (error, _) {
        final apiError = ApiError.from(error);
        final gone = apiError.code == 'CONTENT_UNAVAILABLE' || apiError.code == 'NOT_FOUND';
        return Scaffold(
          backgroundColor: colors.bg,
          appBar: const DtHeroAppBar(),
          body: Padding(
            padding: const EdgeInsets.all(DtSpace.s4),
            child: Column(
              children: [
                DtAlert(
                  severity: DtAlertSeverity.neutral,
                  body: gone ? l10n.lockNoLongerAvailable : commonErrorText(context, apiError),
                ),
                if (!gone) ...[
                  const SizedBox(height: DtSpace.s3),
                  DtButton(
                    label: l10n.commonRetry,
                    variant: DtButtonVariant.secondary,
                    onPressed: () => ref.invalidate(calculatorRuntimeProvider(slug)),
                  ),
                ],
              ],
            ),
          ),
        );
      },
      data: (runtime) => switch (runtime.state) {
        RuntimeState.ready => _Calculator(runtime: runtime),
        RuntimeState.locked => _Message(
          detail: runtime.detail,
          severity: DtAlertSeverity.neutral,
          title: lockWord(l10n, runtime.detail.access.lockReason),
          body: lockExplanation(l10n, runtime.detail.access.lockReason),
        ),
        RuntimeState.unsupported => _Message(
          detail: runtime.detail,
          severity: DtAlertSeverity.warning,
          body: l10n.calculatorDefinitionUnsupported,
        ),
        RuntimeState.selfTestFailed => _Message(
          detail: runtime.detail,
          severity: DtAlertSeverity.warning,
          body: l10n.calculatorSelfTestFailed,
        ),
      },
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.detail, required this.severity, required this.body, this.title});

  final CalculatorDetailDto detail;
  final DtAlertSeverity severity;
  final String? title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: DtHeroAppBar(title: localizedTitle(context, detail.nameFr, detail.nameEn)),
      body: Padding(
        padding: const EdgeInsets.all(DtSpace.s4),
        child: DtAlert(severity: severity, title: title, body: body),
      ),
    );
  }
}

/// What the person typed in one field, before it is committed to the engine.
class _Field {
  _Field(this.input, String languageCode)
    : unit = (languageCode == 'en' ? input.defaultUnitEn : input.defaultUnitFr) ?? input.canonicalUnit;

  final CalculatorInput input;
  final text = TextEditingController();
  final focus = FocusNode();
  String unit;
  Object? choice;

  /// Text that could not be read as a number (shown as « Nombre attendu »).
  bool unreadable = false;
}

class _Calculator extends ConsumerStatefulWidget {
  const _Calculator({required this.runtime});

  final CalculatorRuntime runtime;

  @override
  ConsumerState<_Calculator> createState() => _CalculatorState();
}

class _CalculatorState extends ConsumerState<_Calculator> {
  late final CalculatorDefinition _definition = widget.runtime.definition!;
  final Map<String, _Field> _fields = {};

  /// Values committed to the engine (field commit: next/done, focus change, or 400 ms idle).
  final Map<String, InputValue?> _committed = {};
  final Set<String> _touched = {};
  Timer? _idle;
  Evaluation? _evaluation;

  /// A use is recorded once per opening, at the first result (never the values).
  bool _useRecorded = false;

  /// CALCULATOR_COMPLETED is counted at the first result, and again after « Réinitialiser ».
  bool _completionRecorded = false;

  CalculatorDetailDto get _detail => widget.runtime.detail;

  int get _version => _detail.published!.version.toInt();

  @override
  void initState() {
    super.initState();
    ref
        .read(analyticsRecorderProvider)
        .record(AnalyticsEvent.calculatorStarted(id: widget.runtime.detail.id, version: _version));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_fields.isNotEmpty) return;
    final language = Localizations.localeOf(context).languageCode;
    for (final input in _definition.inputs) {
      final field = _Field(input, language);
      field.focus.addListener(() {
        if (!field.focus.hasFocus) _commit(field);
      });
      _fields[input.key] = field;
    }
    _restore();
  }

  Future<void> _restore() async {
    final last = await ref.read(lastInputsProvider).read(_detail.slug);
    if (!mounted || last.isEmpty) return;
    setState(() {
      for (final entry in last.entries) {
        final field = _fields[entry.key];
        final value = entry.value;
        if (field == null || value == null) continue;
        if (field.input.isNumeric && value.value is num) {
          if (value.unit != null && field.input.unitCodes.contains(value.unit)) field.unit = value.unit!;
          field.text.text = _formatInput(value.value! as num);
        } else {
          field.choice = value.value;
        }
        _committed[entry.key] = value;
        _touched.add(entry.key);
      }
      _evaluate();
    });
  }

  @override
  void dispose() {
    _idle?.cancel();
    for (final field in _fields.values) {
      field.text.dispose();
      field.focus.dispose();
    }
    super.dispose();
  }

  String _formatInput(num value) {
    final text = value.toString();
    final plain = text.endsWith('.0') ? text.substring(0, text.length - 2) : text;
    return Localizations.localeOf(context).languageCode == 'fr' ? plain.replaceAll('.', ',') : plain;
  }

  void _typed(_Field field) {
    _idle?.cancel();
    _idle = Timer(const Duration(milliseconds: 400), () => _commit(field));
  }

  void _commit(_Field field) {
    if (!mounted) return;
    final input = field.input;
    InputValue? value;
    field.unreadable = false;
    if (input.isNumeric) {
      final raw = field.text.text.trim().replaceAll(' ', '').replaceAll(',', '.');
      if (raw.isNotEmpty) {
        final number = double.tryParse(raw);
        if (number == null) {
          field.unreadable = true;
        } else {
          value = InputValue(number, unit: field.unit);
        }
      }
    } else if (field.choice != null) {
      value = InputValue(field.choice);
    }
    setState(() {
      _committed[input.key] = value;
      _touched.add(input.key);
      _evaluate();
    });
    unawaited(ref.read(lastInputsProvider).write(_detail.slug, _committed));
  }

  void _evaluate() {
    final given = {
      for (final entry in _committed.entries)
        if (entry.value != null) entry.key: entry.value,
    };
    _evaluation = evaluate(_definition, given);
    if (_evaluation!.outcome != Outcome.result) return;
    if (!_useRecorded) {
      _useRecorded = true;
      unawaited(ref.read(activityRecorderProvider).calculatorUsed(_detail.id));
    }
    if (!_completionRecorded) {
      _completionRecorded = true;
      ref
          .read(analyticsRecorderProvider)
          .record(
            AnalyticsEvent.calculatorCompleted(
              id: _detail.id,
              version: _version,
              resultBand: _evaluation!.band?.code,
              engine: engineVersion,
            ),
          );
    }
  }

  void _reset() {
    _idle?.cancel();
    setState(() {
      for (final field in _fields.values) {
        field.text.clear();
        field.choice = null;
        field.unreadable = false;
      }
      _committed.clear();
      _touched.clear();
      _evaluation = null;
      _completionRecorded = false;
    });
    unawaited(ref.read(lastInputsProvider).write(_detail.slug, const {}));
  }

  // ─────────────────────────────── formatting ───────────────────────────────

  String get _locale => Localizations.localeOf(context).toLanguageTag();

  String _number(num value, {int? decimals}) {
    final format = NumberFormat.decimalPattern(_locale);
    if (decimals != null) {
      format
        ..minimumFractionDigits = decimals
        ..maximumFractionDigits = decimals;
    } else {
      format.maximumFractionDigits = 6;
    }
    return format.format(value);
  }

  String _range(AppLocalizations l10n, Range? range, String unit) {
    if (range == null) return '';
    if (range.min != null && range.max != null) {
      return l10n.calculatorRangeBetween(_number(range.min!), _number(range.max!), unit).trim();
    }
    if (range.min != null) return l10n.calculatorRangeMin(_number(range.min!), unit).trim();
    return l10n.calculatorRangeMax(_number(range.max!), unit).trim();
  }

  String _label(CalculatorInput input) => input.label.of(Localizations.localeOf(context).languageCode);

  /// The error under a field, only once the person has committed it (never per keystroke).
  String? _fieldError(AppLocalizations l10n, _Field field) {
    if (!_touched.contains(field.input.key)) return null;
    if (field.unreadable) return l10n.calculatorErrorNumber;
    final issue = _evaluation?.issues
        .where((issue) => issue.input == field.input.key && issue.code != 'REQUIRED')
        .firstOrNull;
    if (issue == null || _evaluation?.outcome != Outcome.invalid) return null;
    return switch (issue.code) {
      'WRONG_TYPE' => l10n.calculatorErrorNumber,
      'NOT_AN_INTEGER' => l10n.calculatorErrorInteger,
      'HARD_RANGE' => l10n.calculatorErrorImpossible(_range(l10n, issue.range, issue.rangeUnit ?? '')),
      'UNKNOWN_UNIT' => l10n.calculatorErrorUnit,
      'UNKNOWN_CHOICE' => l10n.calculatorErrorChoice,
      _ => null,
    };
  }

  String? _fieldNote(AppLocalizations l10n, _Field field) {
    final evaluation = _evaluation;
    if (evaluation == null || evaluation.outcome != Outcome.result) return null;
    final parts = <String>[
      for (final note in evaluation.notes)
        if (note.input == field.input.key) l10n.calculatorCheckValue(_range(l10n, note.range, note.unit)),
      for (final conversion in evaluation.conversions)
        if (conversion.input == field.input.key)
          l10n.calculatorConverted(
            '${_number(conversion.fromValue)} ${conversion.fromUnit}',
            '${_number(conversion.toValue)} ${conversion.toUnit}',
          ),
    ];
    return parts.isEmpty ? null : parts.join('\n');
  }

  // ───────────────────────────────── build ─────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final language = Localizations.localeOf(context).languageCode;
    final name = localizedTitle(context, _detail.nameFr, _detail.nameEn);
    final version = _version;
    final evaluation = _evaluation;
    final result = evaluation?.outcome == Outcome.result ? evaluation : null;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: DtHeroAppBar(
        titleWidget: Row(
          children: [
            Flexible(
              child: Text(
                name,
                overflow: TextOverflow.ellipsis,
                style: DtType.heading.copyWith(color: colors.onHero),
              ),
            ),
            const SizedBox(width: DtSpace.s2),
            DtBadge(
              text: widget.runtime.offline
                  ? '${l10n.calculatorVersion('$version')} · ${l10n.offlineChipOffline}'
                  : l10n.calculatorVersion('$version'),
              variant: DtBadgeVariant.teal,
            ),
          ],
        ),
        actions: [
          FavoriteButton(type: FavoriteTargetType.calculator, id: _detail.id, onHero: true),
          IconButton(
            tooltip: l10n.calculatorSourceSheet,
            icon: Icon(LucideIcons.bookOpenText, color: colors.onHero),
            onPressed: () => _showSourceSheet(context),
          ),
        ],
      ),
      body: Stack(
        children: [
          ListView(
            padding: const EdgeInsets.fromLTRB(DtSpace.s4, DtSpace.s2, DtSpace.s4, DtSize.controlLg * 3),
            children: [
              if (_detail.purposeFr != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: DtSpace.s4),
                  child: Text(
                    localizedTitle(context, _detail.purposeFr!, _detail.purposeEn),
                    style: DtType.body.copyWith(color: colors.inkSecondary),
                  ),
                ),
              for (final field in _fields.values) ...[
                _InputField(
                  field: field,
                  label: _label(field.input),
                  requiredWord: field.input.required ? l10n.commonRequired : l10n.commonOptional,
                  help: field.input.help?.of(language),
                  error: _fieldError(l10n, field),
                  note: _fieldNote(l10n, field),
                  yes: l10n.calculatorYes,
                  no: l10n.calculatorNo,
                  unitLabel: l10n.calculatorUnit,
                  onTyped: () => _typed(field),
                  onCommit: () => _commit(field),
                ),
                const SizedBox(height: DtSpace.s4),
              ],
              _ResultBlock(
                name: name,
                version: version,
                label: _definition.resultLabel.of(language),
                evaluation: evaluation,
                valueText: result == null ? null : _number(result.value!, decimals: result.decimals),
                pendingCount: evaluation == null
                    ? _definition.inputs.where((input) => input.required).length
                    : evaluation.issues.where((issue) => issue.code == 'REQUIRED').length,
                describe: (issue) => _describeIssue(l10n, issue, language),
              ),
              if (result != null) ...[
                const SizedBox(height: DtSpace.s4),
                _Detail(
                  title: l10n.calculatorFormula,
                  child: Text(
                    formulaText(
                      _definition.formula,
                      values: {
                        for (final entry in _committed.entries)
                          if (entry.value?.value is num)
                            entry.key: _number(
                              result.conversions.where((c) => c.input == entry.key).firstOrNull?.toValue ??
                                  (entry.value!.value! as num),
                            ),
                      },
                      labelOf: (key) => _fields[key] == null ? key : _label(_fields[key]!.input),
                    ),
                    style: DtType.mono.copyWith(color: colors.ink),
                  ),
                ),
              ],
              const SizedBox(height: DtSpace.s3),
              _Detail(
                title: l10n.calculatorSource,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final source in _detail.published!.sources.where(
                      (s) => s.role == CalculatorSourceRole.primary,
                    ))
                      Text(_citation(source), style: DtType.body.copyWith(color: colors.inkSecondary)),
                  ],
                ),
              ),
              const SizedBox(height: DtSpace.s3),
              _Detail(
                title: l10n.calculatorReview,
                child: Text(
                  l10n.calculatorReviewLine(
                    _detail.published!.review.reviewedBy,
                    dateText(context, _detail.published!.review.reviewedAt),
                    _detail.published!.review.testsPassed,
                  ),
                  style: DtType.body.copyWith(color: colors.inkSecondary),
                ),
              ),
              const SizedBox(height: DtSpace.s3),
              _Detail(
                title: l10n.calculatorLimitations,
                child: Text(
                  _definition.limitations.of(language),
                  style: DtType.body.copyWith(color: colors.inkSecondary),
                ),
              ),
            ],
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: _ResultBar(
              valueText: result == null
                  ? null
                  : '${_number(result.value!, decimals: result.decimals)} ${result.unit}'.trim(),
              onCopy: result == null
                  ? null
                  : () async {
                      final text =
                          '$name v$version : ${_number(result.value!, decimals: result.decimals)} ${result.unit}'
                              .trim();
                      await Clipboard.setData(ClipboardData(text: text));
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.calculatorCopied)));
                      }
                    },
              onReset: _reset,
            ),
          ),
        ],
      ),
    );
  }

  String _describeIssue(AppLocalizations l10n, Issue issue, String language) {
    final input = issue.input == null ? null : _fields[issue.input!]?.input;
    return switch (issue.code) {
      'VALIDATED_RANGE' => l10n.calculatorUnavailableRange(
        input == null ? '' : _label(input),
        _range(l10n, issue.range, issue.rangeUnit ?? ''),
      ),
      'CROSS_FIELD' => issue.message?.of(language) ?? l10n.calculatorErrorComputation,
      'NON_FINITE_RESULT' || 'MISSING_INPUT' => l10n.calculatorErrorComputation,
      _ =>
        input == null
            ? l10n.calculatorErrorComputation
            : '${_label(input)} — ${_fieldError(l10n, _fields[input.key]!) ?? l10n.calculatorErrorComputation}',
    };
  }

  String _citation(SourceDto source) => [
    source.authors,
    source.title,
    [source.publisher, if (source.edition != null) source.edition, '${source.year}'].join(', '),
    source.formulaLocation,
  ].join('. ');

  void _showSourceSheet(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final published = _detail.published!;
    final language = Localizations.localeOf(context).languageCode;
    String role(CalculatorSourceRole value) => switch (value) {
      CalculatorSourceRole.primary => l10n.calculatorSource,
      CalculatorSourceRole.unitConversion => l10n.calculatorRoleUnitConversion,
      _ => l10n.calculatorRoleValidation,
    };
    showModalBottomSheet<void>(
      // Above the floating tab bar (ADR-020), never under it.
      useRootNavigator: true,
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: colors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(DtRadius.xl))),
      builder: (context) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.7,
        builder: (context, controller) => ListView(
          controller: controller,
          padding: const EdgeInsets.all(DtSpace.s5),
          children: [
            Text(l10n.calculatorSourceSheet, style: DtType.title.copyWith(color: colors.ink)),
            const SizedBox(height: DtSpace.s2),
            Text(
              l10n.calculatorPublished('${published.version}', dateText(context, published.publishedAt)),
              style: DtType.caption.copyWith(color: colors.inkMuted),
            ),
            for (final source in published.sources) ...[
              const SizedBox(height: DtSpace.s4),
              Text(role(source.role), style: DtType.label.copyWith(color: colors.inkMuted)),
              Text(_citation(source), style: DtType.body.copyWith(color: colors.ink)),
              if (source.doi != null)
                Text('DOI ${source.doi}', style: DtType.mono.copyWith(color: colors.inkSecondary)),
              if (source.url != null) Text(source.url!, style: DtType.caption.copyWith(color: colors.inkSecondary)),
            ],
            const SizedBox(height: DtSpace.s4),
            Text(l10n.calculatorValidatedRanges, style: DtType.label.copyWith(color: colors.inkMuted)),
            for (final input in _definition.inputs.where((input) => input.validatedRange != null))
              Text(
                '${_label(input)} : ${_range(l10n, input.validatedRange, input.canonicalUnit)}',
                style: DtType.body.copyWith(color: colors.ink),
              ),
            for (final input in _definition.inputs)
              for (final unit in input.units)
                Text(
                  '1 ${unit.code} = ${_number(unit.factorToCanonical)} ${input.canonicalUnit} · ${unit.source}',
                  style: DtType.caption.copyWith(color: colors.inkSecondary),
                ),
            const SizedBox(height: DtSpace.s4),
            Text(l10n.calculatorReview, style: DtType.label.copyWith(color: colors.inkMuted)),
            Text(
              l10n.calculatorReviewLine(
                published.review.reviewedBy,
                dateText(context, published.review.reviewedAt),
                published.review.testsPassed,
              ),
              style: DtType.body.copyWith(color: colors.ink),
            ),
            const SizedBox(height: DtSpace.s4),
            Text(l10n.calculatorLimitations, style: DtType.label.copyWith(color: colors.inkMuted)),
            Text(_definition.limitations.of(language), style: DtType.body.copyWith(color: colors.ink)),
          ],
        ),
      ),
    );
  }
}

class _InputField extends StatelessWidget {
  const _InputField({
    required this.field,
    required this.label,
    required this.requiredWord,
    required this.help,
    required this.error,
    required this.note,
    required this.yes,
    required this.no,
    required this.unitLabel,
    required this.onTyped,
    required this.onCommit,
  });

  final _Field field;
  final String label;
  final String requiredWord;
  final String? help;
  final String? error;
  final String? note;
  final String yes;
  final String no;
  final String unitLabel;
  final VoidCallback onTyped;
  final VoidCallback onCommit;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final input = field.input;
    final language = Localizations.localeOf(context).languageCode;
    final hasError = error != null;

    Widget control;
    switch (input.kind) {
      case InputKind.number:
      case InputKind.integer:
        final border = OutlineInputBorder(
          borderRadius: BorderRadius.circular(DtRadius.md),
          borderSide: BorderSide(
            color: hasError ? colors.critical : colors.borderStrong,
            width: hasError ? DtBorder.focus : DtBorder.control,
          ),
        );
        control = TextField(
          controller: field.text,
          focusNode: field.focus,
          keyboardType: TextInputType.numberWithOptions(decimal: input.kind == InputKind.number, signed: true),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,\-]'))],
          textInputAction: TextInputAction.next,
          style: DtType.numeric.copyWith(color: colors.ink),
          onChanged: (_) => onTyped(),
          onSubmitted: (_) => onCommit(),
          decoration: InputDecoration(
            isDense: true,
            filled: true,
            fillColor: colors.surface,
            constraints: const BoxConstraints(minHeight: DtSize.controlLg),
            enabledBorder: border,
            focusedBorder: border.copyWith(
              borderSide: BorderSide(color: hasError ? colors.critical : colors.focus, width: DtBorder.focus),
            ),
            suffixIcon: input.units.isEmpty
                ? Padding(
                    padding: const EdgeInsets.symmetric(horizontal: DtSpace.s3),
                    child: Text(
                      input.canonicalUnit == '1' ? '' : input.canonicalUnit,
                      style: DtType.body.copyWith(color: colors.inkMuted),
                    ),
                  )
                : Padding(
                    padding: const EdgeInsetsDirectional.only(end: DtSpace.s2),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value: field.unit,
                        hint: Text(unitLabel),
                        style: DtType.body.copyWith(color: colors.ink),
                        items: [for (final code in input.unitCodes) DropdownMenuItem(value: code, child: Text(code))],
                        onChanged: (unit) {
                          if (unit == null) return;
                          field.unit = unit;
                          onCommit();
                        },
                      ),
                    ),
                  ),
            suffixIconConstraints: const BoxConstraints(minHeight: DtSize.controlLg),
          ),
        );
      case InputKind.boolean:
        control = DtSegmentedControl<Object?>(
          semanticLabel: label,
          selected: field.choice,
          segments: [
            DtSegment(value: false, label: no),
            DtSegment(value: true, label: yes),
          ],
          onChanged: (value) {
            field.choice = value;
            onCommit();
          },
        );
      case InputKind.choice:
        final segments = [
          for (final choice in input.choices) DtSegment<Object?>(value: choice.value, label: choice.label.of(language)),
        ];
        void choose(Object? value) {
          field.choice = value;
          onCommit();
        }
        // Short answers (up to four) stay a segmented control; long ones, or more than four, become a
        // list of full rows so no answer is ever cut (ADR-026).
        control = LayoutBuilder(
          builder: (context, constraints) =>
              segmentsFit(context, [for (final segment in segments) segment.label], constraints.maxWidth)
              ? DtSegmentedControl<Object?>(
                  semanticLabel: label,
                  selected: field.choice,
                  segments: segments,
                  onChanged: choose,
                )
              : DtChoiceList<Object?>(
                  semanticLabel: label,
                  selected: field.choice,
                  segments: segments,
                  onChanged: choose,
                ),
        );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text.rich(
          TextSpan(
            text: label,
            children: [
              TextSpan(
                text: ' · $requiredWord',
                style: DtType.caption.copyWith(color: colors.inkMuted),
              ),
            ],
          ),
          style: DtType.label.copyWith(color: colors.inkSecondary),
        ),
        if (help != null) Text(help!, style: DtType.caption.copyWith(color: colors.inkMuted)),
        const SizedBox(height: DtSpace.s1),
        control,
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: DtSpace.s1),
            child: Semantics(
              liveRegion: true,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(LucideIcons.circleAlert, size: DtSpace.s4, color: colors.critical),
                  const SizedBox(width: DtSpace.s1),
                  Expanded(
                    child: Text(error!, style: DtType.caption.copyWith(color: colors.critical)),
                  ),
                ],
              ),
            ),
          )
        else if (note != null)
          Padding(
            padding: const EdgeInsets.only(top: DtSpace.s1),
            child: Text(note!, style: DtType.caption.copyWith(color: colors.inkSecondary)),
          ),
      ],
    );
  }
}

class _ResultBlock extends StatelessWidget {
  const _ResultBlock({
    required this.name,
    required this.version,
    required this.label,
    required this.evaluation,
    required this.valueText,
    required this.pendingCount,
    required this.describe,
  });

  final String name;
  final int version;
  final String label;
  final Evaluation? evaluation;
  final String? valueText;
  final int pendingCount;
  final String Function(Issue issue) describe;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final language = Localizations.localeOf(context).languageCode;
    final evaluation = this.evaluation;
    final onlyMissing =
        evaluation == null ||
        (evaluation.outcome == Outcome.invalid && evaluation.issues.every((issue) => issue.code == 'REQUIRED'));

    Widget content;
    if (evaluation != null && evaluation.outcome == Outcome.result) {
      final band = evaluation.band;
      content = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            liveRegion: true,
            label: '$label ${valueText ?? ''} ${evaluation.unit ?? ''}',
            excludeSemantics: true,
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: valueText,
                    style: DtType.result.copyWith(color: colors.tealStrong),
                  ),
                  TextSpan(
                    text: ' ${evaluation.unit ?? ''}',
                    style: DtType.heading.copyWith(color: colors.tealStrong),
                  ),
                ],
              ),
            ),
          ),
          if (band != null) ...[
            const SizedBox(height: DtSpace.s2),
            DtBadge(
              text: band.label.of(language),
              icon: LucideIcons.info,
              variant: switch (band.severity) {
                'critical' => DtBadgeVariant.critical,
                'warning' || 'caution' => DtBadgeVariant.warning,
                _ => DtBadgeVariant.info,
              },
            ),
          ],
        ],
      );
    } else if (onlyMissing) {
      content = Text(l10n.calculatorPending(pendingCount), style: DtType.body.copyWith(color: colors.inkSecondary));
    } else {
      final unavailable = evaluation.outcome == Outcome.outOfValidatedRange;
      content = Semantics(
        liveRegion: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              unavailable ? l10n.calculatorUnavailableTitle : l10n.calculatorInvalidTitle,
              style: DtType.bodyStrong.copyWith(color: colors.ink),
            ),
            for (final issue in evaluation.issues.where((issue) => issue.code != 'REQUIRED'))
              Text(describe(issue), style: DtType.body.copyWith(color: colors.inkSecondary)),
          ],
        ),
      );
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(DtSpace.s4),
      decoration: BoxDecoration(color: colors.tealSoft, borderRadius: BorderRadius.circular(DtRadius.md)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$label · $name v$version', style: DtType.label.copyWith(color: colors.tealStrong)),
          const SizedBox(height: DtSpace.s2),
          content,
        ],
      ),
    );
  }
}

class _Detail extends StatelessWidget {
  const _Detail({required this.title, required this.child});

  final String title;
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: DtType.label.copyWith(color: colors.inkMuted)),
          const SizedBox(height: DtSpace.s1),
          child,
        ],
      ),
    );
  }
}

/// Sticky glass result bar: value + unit, Copier, Réinitialiser.
class _ResultBar extends StatelessWidget {
  const _ResultBar({required this.valueText, required this.onCopy, required this.onReset});

  final String? valueText;
  final VoidCallback? onCopy;
  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    return ClipRRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: DtBlur.glass, sigmaY: DtBlur.glass),
        child: Container(
          decoration: BoxDecoration(
            color: colors.glass,
            border: Border(
              top: BorderSide(color: colors.glassBorder, width: DtBorder.hairline),
            ),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: DtSpace.s4, vertical: DtSpace.s2),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      valueText ?? '—',
                      style: DtType.heading.copyWith(
                        color: colors.ink,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                  DtButton(
                    label: l10n.calculatorCopy,
                    icon: LucideIcons.copy,
                    variant: DtButtonVariant.teal,
                    size: DtButtonSize.md,
                    expand: false,
                    onPressed: onCopy,
                  ),
                  const SizedBox(width: DtSpace.s2),
                  DtButton(
                    label: l10n.calculatorReset,
                    variant: DtButtonVariant.ghost,
                    size: DtButtonSize.md,
                    expand: false,
                    onPressed: onReset,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
