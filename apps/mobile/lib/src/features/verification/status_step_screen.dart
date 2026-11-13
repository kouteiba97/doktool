import '../../core/api/generated/models/specialty_dto.dart';
import '../../core/api/generated/models/place_dto.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_error.dart';
import '../../core/api/generated/models/professional_type.dart';
import '../../core/api/generated/models/verification_case_dto.dart';
import '../../core/api/generated/models/verification_details_dto.dart';
import '../../core/api/generated/models/verification_step_type.dart';
import '../../l10n/generated/app_localizations.dart';
import '../../router/app_router.dart';
import '../../theme/doktool_tokens.dart';
import '../../ui/dt_alert.dart';
import '../../ui/dt_button.dart';
import '../../ui/dt_page.dart';
import '../../ui/dt_picker.dart';
import '../../ui/dt_text_field.dart';
import '../../ui/error_text.dart';
import '../../ui/tokens.dart';
import '../account/reference_data.dart';
import '../onboarding/validators.dart';
import 'case_draft_builder.dart';
import 'document_slot.dart';
import 'verification_controller.dart';
import 'verification_repository.dart';

/// ScreenVerifyProfessional: step 2 of 3, the status case. Doctors give their Ordre number, an
/// attestation or diploma and their specialty; residents their residency year, institution and
/// specialty in progress; students their university and year. Pickers only, never free text.
class StatusStepScreen extends ConsumerWidget {
  const StatusStepScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(verificationControllerProvider);
    final type = overview.value?.professionalType;
    if (type == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return CaseDraftBuilder(
      type: statusCaseFor(type),
      builder: (context, draft) => _StatusStep(draft: draft, role: type),
    );
  }
}

/// The professional status step: order number, specialty, institution or university, year.
class _StatusStep extends ConsumerStatefulWidget {
  const _StatusStep({required this.draft, required this.role});

  final VerificationCaseDto draft;
  final ProfessionalType role;

  @override
  ConsumerState<_StatusStep> createState() => _StatusStepState();
}

/// The details being typed, progress and error.
class _StatusStepState extends ConsumerState<_StatusStep> {
  late final _orderNumber = TextEditingController(text: widget.draft.details.orderNumber ?? '');
  late String? _specialtyId = widget.draft.details.specialtyId;
  late String? _institutionId = widget.draft.details.institutionId;
  late String? _universityId = widget.draft.details.universityId;
  late int? _residencyYear = widget.draft.details.residencyYear?.toInt();
  late int? _academicYear = widget.draft.details.academicYear?.toInt();
  bool _orderTouched = false;
  bool _saving = false;
  ApiError? _error;

  /// Frees the text controller.
  @override
  void dispose() {
    _orderNumber.dispose();
    super.dispose();
  }

  VerificationStepType get _step => switch (widget.role) {
    ProfessionalType.resident => VerificationStepType.residencyAttestation,
    ProfessionalType.student => VerificationStepType.studentProof,
    _ => VerificationStepType.orderProof,
  };

  bool get _orderValid => orderNumberPattern.hasMatch(_orderNumber.text.trim());

  bool get _detailsComplete => switch (widget.role) {
    ProfessionalType.resident => _residencyYear != null && _institutionId != null && _specialtyId != null,
    ProfessionalType.student => _universityId != null && _academicYear != null,
    _ => _orderValid && _specialtyId != null,
  };

  bool get _fileProvided => widget.draft.documents.any((document) => document.stepType == _step);

  VerificationDetailsDto get _details => switch (widget.role) {
    ProfessionalType.resident => VerificationDetailsDto(
      residencyYear: _residencyYear,
      institutionId: _institutionId,
      specialtyId: _specialtyId,
    ),
    ProfessionalType.student => VerificationDetailsDto(universityId: _universityId, academicYear: _academicYear),
    _ => VerificationDetailsDto(orderNumber: _orderNumber.text.trim(), specialtyId: _specialtyId),
  };

  /// « Continuer »: saves the details and goes to the summary.
  Future<void> _continue() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final updated = await ref.read(verificationRepositoryProvider).saveDetails(widget.draft.id, _details);
      ref.read(verificationControllerProvider.notifier).replace(updated);
      if (mounted) await context.push(Routes.verificationSummary);
    } catch (error) {
      if (mounted) setState(() => _error = ApiError.from(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = context.colors;
    final (title, intro, proofLabel) = switch (widget.role) {
      ProfessionalType.resident => (
        l10n.verificationStatusTitleResident,
        l10n.verificationStatusIntroResident,
        l10n.verificationStatusResidencyProof,
      ),
      ProfessionalType.student => (
        l10n.verificationStatusTitleStudent,
        l10n.verificationStatusIntroStudent,
        l10n.verificationStatusStudentProof,
      ),
      _ => (l10n.verificationStatusTitleDoctor, l10n.verificationStatusIntroDoctor, l10n.verificationStatusOrderProof),
    };
    final required = l10n.commonRequired;
    final noOptions = l10n.verificationStatusNoOptions;
    final specialties = ref.watch(specialtiesProvider).value ?? const <SpecialtyDto>[];
    final language = Localizations.localeOf(context).languageCode;

    DtPickerField<String> specialtyPicker(String label) => DtPickerField<String>(
      label: label,
      placeholder: l10n.verificationStatusPickSpecialty,
      requiredMark: required,
      emptyMessage: noOptions,
      selected: _specialtyId,
      options: [
        for (final specialty in specialties)
          DtPickerOption(value: specialty.id, label: language == 'en' ? specialty.nameEn : specialty.nameFr),
      ],
      onSelected: (id) => setState(() => _specialtyId = id),
    );

    DtPickerField<int> yearPicker(String label, int max, int? selected, ValueChanged<int> onSelected) =>
        DtPickerField<int>(
          label: label,
          placeholder: label,
          requiredMark: required,
          searchable: false,
          selected: selected,
          options: [
            for (var year = 1; year <= max; year++)
              DtPickerOption(value: year, label: l10n.verificationStatusYear(year)),
          ],
          onSelected: onSelected,
        );

    final fields = <Widget>[
      if (widget.role == ProfessionalType.doctor) ...[
        DtTextField(
          label: l10n.verificationStatusOrderNumber,
          requiredMark: required,
          controller: _orderNumber,
          keyboardType: TextInputType.number,
          maxLength: 30,
          helper: l10n.verificationStatusOrderNumberHelper,
          error: _orderTouched && !_orderValid ? l10n.verificationStatusOrderNumberInvalid : null,
          onChanged: (_) => setState(() {}),
          onEditingComplete: () => setState(() => _orderTouched = true),
        ),
        const SizedBox(height: DtSpace.s4),
        specialtyPicker(l10n.verificationStatusSpecialty),
      ],
      if (widget.role == ProfessionalType.resident) ...[
        yearPicker(
          l10n.verificationStatusResidencyYear,
          10,
          _residencyYear,
          (year) => setState(() => _residencyYear = year),
        ),
        const SizedBox(height: DtSpace.s4),
        DtPickerField<String>(
          label: l10n.verificationStatusInstitution,
          placeholder: l10n.verificationStatusPickInstitution,
          requiredMark: required,
          emptyMessage: noOptions,
          selected: _institutionId,
          options: [
            for (final place in ref.watch(institutionsProvider).value ?? const <PlaceDto>[])
              DtPickerOption(value: place.id, label: place.name, detail: '${place.wilayaCode}'),
          ],
          onSelected: (id) => setState(() => _institutionId = id),
        ),
        const SizedBox(height: DtSpace.s4),
        specialtyPicker(l10n.verificationStatusSpecialtyInProgress),
      ],
      if (widget.role == ProfessionalType.student) ...[
        DtPickerField<String>(
          label: l10n.verificationStatusUniversity,
          placeholder: l10n.verificationStatusPickUniversity,
          requiredMark: required,
          emptyMessage: noOptions,
          selected: _universityId,
          options: [
            for (final place in ref.watch(universitiesProvider).value ?? const <PlaceDto>[])
              DtPickerOption(value: place.id, label: place.name, detail: '${place.wilayaCode}'),
          ],
          onSelected: (id) => setState(() => _universityId = id),
        ),
        const SizedBox(height: DtSpace.s4),
        yearPicker(
          l10n.verificationStatusAcademicYear,
          7,
          _academicYear,
          (year) => setState(() => _academicYear = year),
        ),
      ],
    ];

    return DtPage(
      eyebrow: '${l10n.commonStepOf('2', '3')} · ${l10n.verificationStatusStep}',
      title: title,
      intro: intro,
      // « Plus tard »: back to Home, the draft is kept.
      trailing: TextButton(
        onPressed: () => context.go(Routes.home),
        child: Text(l10n.commonLater, style: DtType.bodyStrong.copyWith(color: colors.onHero)),
      ),
      actions: [
        if (_error != null) DtAlert(severity: DtAlertSeverity.critical, body: commonErrorText(context, _error!)),
        // « Continuer »: needs the details and the proof document.
        DtButton(
          label: l10n.commonContinue,
          loading: _saving,
          onPressed: _detailsComplete && _fileProvided ? _continue : null,
        ),
      ],
      children: [
        ...fields,
        const SizedBox(height: DtSpace.s4),
        DocumentSlot(
          key: ValueKey(_step),
          caseId: widget.draft.id,
          stepType: _step,
          label: proofLabel,
          requiredMark: required,
          document: widget.draft.documents.where((document) => document.stepType == _step).firstOrNull,
        ),
        const SizedBox(height: DtSpace.s6),
        Text(l10n.verificationPrivacy, style: DtType.caption.copyWith(color: colors.inkMuted)),
      ],
    );
  }
}
