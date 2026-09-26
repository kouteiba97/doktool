import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/generated/models/professional_type.dart';
import '../../core/api/generated/models/start_verification_dto_professional_type.dart';
import '../../core/api/generated/models/verification_case_dto.dart';
import '../../core/api/generated/models/verification_overview_dto.dart';
import '../../core/api/generated/models/verification_status.dart';
import '../../core/api/generated/models/verification_type.dart';
import '../../core/api/generated/models/verification_type_state_dto.dart';
import '../../core/auth/session.dart';
import '../../core/auth/session_controller.dart';
import 'verification_repository.dart';

/// The status case a professional type proves: students their enrolment, doctors and residents
/// their professional status.
VerificationType statusCaseFor(ProfessionalType type) =>
    type == ProfessionalType.student ? VerificationType.studentStatus : VerificationType.professionalStatus;

const openStatuses = {
  VerificationStatus.notStarted,
  VerificationStatus.submitted,
  VerificationStatus.inReview,
  VerificationStatus.appealed,
};

const pendingStatuses = {VerificationStatus.submitted, VerificationStatus.inReview, VerificationStatus.appealed};

extension VerificationOverviewX on VerificationOverviewDto {
  VerificationTypeStateDto stateOf(VerificationType type) => types.firstWhere(
    (state) => state.type == type,
    orElse: () => VerificationTypeStateDto(type: type, canStart: false),
  );

  /// The cases this person goes through: identity, then their status case.
  List<VerificationType> get relevantTypes => [
    VerificationType.identity,
    if (professionalType != null) statusCaseFor(professionalType!),
  ];
}

/// The person's verification overview (latest case of each type). Every change made through this
/// controller replaces the case it returns, so screens stay consistent without refetching.
class VerificationController extends AsyncNotifier<VerificationOverviewDto> {
  VerificationRepository get _repository => ref.read(verificationRepositoryProvider);

  @override
  Future<VerificationOverviewDto> build() {
    final session = ref.watch(sessionControllerProvider).value;
    if (session is! UserSession) throw StateError('Verification needs a signed-in account.');
    return ref.watch(verificationRepositoryProvider).overview();
  }

  Future<void> reload() async {
    state = AsyncData(await _repository.overview());
  }

  /// The case being prepared for [type]: the open draft if there is one, otherwise a new case.
  Future<VerificationCaseDto> draftFor(VerificationType type) async {
    final overview = await future;
    final latest = overview.stateOf(type).latest;
    if (latest != null && latest.status == VerificationStatus.notStarted) return latest;
    final professionalType = overview.professionalType;
    final target = type == VerificationType.professionalStatus && professionalType == ProfessionalType.resident
        ? StartVerificationDtoProfessionalType.resident
        : type == VerificationType.professionalStatus
        ? StartVerificationDtoProfessionalType.doctor
        : null;
    final created = await _repository.start(type, target: target);
    await reload();
    return created;
  }

  /// Replaces [updated] in the overview (it is the latest case of its type).
  void replace(VerificationCaseDto updated) {
    final overview = state.value;
    if (overview == null) return;
    state = AsyncData(
      VerificationOverviewDto(
        professionalType: overview.professionalType,
        types: [
          for (final item in overview.types)
            item.type == updated.type
                ? VerificationTypeStateDto(type: item.type, canStart: item.canStart, latest: updated)
                : item,
        ],
      ),
    );
  }

  /// « Envoyer »: sends every relevant case still being prepared, identity first.
  Future<void> submitDrafts() async {
    final overview = await future;
    for (final type in overview.relevantTypes) {
      final latest = overview.stateOf(type).latest;
      if (latest != null && latest.status == VerificationStatus.notStarted) {
        await _repository.submit(latest.id);
      }
    }
    await reload();
  }

  Future<void> appeal(String caseId) async {
    await _repository.appeal(caseId);
    await reload();
  }

  Future<void> erase(String caseId) async {
    replace(await _repository.erase(caseId));
  }
}

final verificationControllerProvider = AsyncNotifierProvider<VerificationController, VerificationOverviewDto>(
  VerificationController.new,
);
