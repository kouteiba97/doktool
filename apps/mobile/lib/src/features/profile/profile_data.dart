import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/generated/models/attach_photo_dto.dart';
import '../../core/api/generated/models/me_dto.dart';
import '../../core/api/generated/models/photo_upload_request_dto.dart';
import '../../core/api/generated/models/update_profile_dto.dart';
import '../../core/auth/session.dart';
import '../../core/auth/session_controller.dart';
import '../account/account_controller.dart';

/// The full account (profile header, edit screen); null for a demo.
class MeController extends AsyncNotifier<MeDto?> {
  /// Loads /v1/me for a real account (null for a demo).
  @override
  Future<MeDto?> build() async {
    final session = ref.watch(sessionControllerProvider).value;
    if (session is! UserSession) return null;
    return ref.read(apiProvider).account.usersControllerMe();
  }

  /// An empty [bio] clears it (requests never carry null fields).
  Future<void> save({required String firstName, required String lastName, required String bio}) async {
    final me = await ref
        .read(apiProvider)
        .account
        .usersControllerUpdateProfile(
          body: UpdateProfileDto(firstName: firstName, lastName: lastName, bio: bio),
        );
    state = AsyncData(me);
    ref.invalidate(accountControllerProvider);
  }

  /// Uploads a JPEG or PNG; the API re-encodes it without metadata.
  Future<void> uploadPhoto(File file, String contentType) async {
    final bytes = await file.readAsBytes();
    final api = ref.read(apiProvider).account;
    final start = await api.usersControllerRequestPhotoUpload(
      body: PhotoUploadRequestDto(
        contentType: contentType,
        sizeBytes: bytes.length,
        sha256: sha256.convert(bytes).toString(),
      ),
    );
    await Dio().put<void>(
      start.upload.url,
      data: Stream.fromIterable([bytes]),
      options: Options(
        headers: {
          Headers.contentTypeHeader: start.upload.headers.contentType,
          Headers.contentLengthHeader: start.upload.headers.contentLength,
        },
      ),
    );
    state = AsyncData(
      await api.usersControllerAttachPhoto(
        body: AttachPhotoDto(intentId: start.upload.intentId, imageId: start.imageId),
      ),
    );
  }

  /// Removes the profile photo.
  Future<void> removePhoto() async {
    state = AsyncData(await ref.read(apiProvider).account.usersControllerRemovePhoto());
  }
}

final meProvider = AsyncNotifierProvider<MeController, MeDto?>(MeController.new);
