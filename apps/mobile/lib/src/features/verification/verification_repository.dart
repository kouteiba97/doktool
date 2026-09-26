import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/generated/dok_tool_api.dart';
import '../../core/api/generated/models/attach_verification_document_dto.dart';
import '../../core/api/generated/models/start_verification_dto.dart';
import '../../core/api/generated/models/start_verification_dto_professional_type.dart';
import '../../core/api/generated/models/verification_case_dto.dart';
import '../../core/api/generated/models/verification_details_dto.dart';
import '../../core/api/generated/models/verification_overview_dto.dart';
import '../../core/api/generated/models/verification_step_type.dart';
import '../../core/api/generated/models/verification_type.dart';
import '../../core/api/generated/models/verification_upload_request_dto.dart';

/// Largest verification file the API accepts (ADR-011).
const maxVerificationFileBytes = 10 * 1024 * 1024;

/// Verification calls of the user API, and the direct upload of files to private storage.
class VerificationRepository {
  VerificationRepository(this._api, this._uploads);

  final DokToolApi _api;

  /// Plain client for signed storage URLs: no API headers, no bearer token.
  final Dio _uploads;

  Future<VerificationOverviewDto> overview() => _api.verification.verificationControllerOverview();

  Future<VerificationCaseDto> start(VerificationType type, {StartVerificationDtoProfessionalType? target}) =>
      _api.verification.verificationControllerStart(
        body: StartVerificationDto(type: type, professionalType: target),
      );

  Future<VerificationCaseDto> saveDetails(String caseId, VerificationDetailsDto details) =>
      _api.verification.verificationControllerSaveDetails(id: caseId, body: details);

  /// Signs, uploads and attaches one step's file. The SHA-256 is declared up front; the signed PUT
  /// fixes the type and exact size.
  Future<VerificationCaseDto> upload({
    required String caseId,
    required VerificationStepType stepType,
    required Uint8List bytes,
    required String contentType,
    void Function(double progress)? onProgress,
  }) async {
    final start = await _api.verification.verificationControllerRequestUpload(
      id: caseId,
      body: VerificationUploadRequestDto(
        stepType: stepType,
        contentType: contentType,
        sizeBytes: bytes.length,
        sha256: sha256.convert(bytes).toString(),
      ),
    );
    await _uploads.put<void>(
      start.upload.url,
      data: Stream.fromIterable([bytes]),
      options: Options(
        headers: {
          Headers.contentTypeHeader: start.upload.headers.contentType,
          Headers.contentLengthHeader: start.upload.headers.contentLength,
        },
      ),
      onSendProgress: onProgress == null ? null : (sent, total) => onProgress(total <= 0 ? 0 : sent / total),
    );
    return _api.verification.verificationControllerAttach(
      id: caseId,
      body: AttachVerificationDocumentDto(
        intentId: start.upload.intentId,
        documentId: start.documentId,
        stepType: stepType,
      ),
    );
  }

  Future<VerificationCaseDto> removeDocument(String caseId, String documentId) =>
      _api.verification.verificationControllerRemoveDocument(id: caseId, documentId: documentId);

  Future<VerificationCaseDto> submit(String caseId) => _api.verification.verificationControllerSubmit(id: caseId);

  Future<VerificationCaseDto> appeal(String caseId) => _api.verification.verificationControllerAppeal(id: caseId);

  Future<VerificationCaseDto> erase(String caseId) => _api.verification.verificationControllerErase(id: caseId);
}

final _uploadDioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      sendTimeout: const Duration(minutes: 2),
      receiveTimeout: const Duration(seconds: 30),
    ),
  );
  ref.onDispose(dio.close);
  return dio;
});

final verificationRepositoryProvider = Provider<VerificationRepository>(
  (ref) => VerificationRepository(ref.watch(apiProvider), ref.watch(_uploadDioProvider)),
);
