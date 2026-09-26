import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/dok_tool_api.dart';
import '../../core/api/generated/models/reference_item_dto.dart';

/// Fetches reference PDFs through short-lived signed URLs (10 minutes, ADR-011) and checks each
/// against its published SHA-256 before it is shown.
class ReferenceFiles {
  ReferenceFiles(this._api, this._download);

  /// Error code of a file whose bytes do not match the published SHA-256.
  static const integrityCode = 'FILE_INTEGRITY';

  final DokToolApi _api;
  final Dio _download;

  Future<Uint8List> bytesOf(ReferenceItemDto item) async {
    final signed = await _api.referenceLibrary.referenceLibraryControllerFileUrl(id: item.id);
    final Response<List<int>> response;
    try {
      response = await _download.get<List<int>>(signed.url, options: Options(responseType: ResponseType.bytes));
    } on DioException catch (error) {
      throw ApiError.from(error);
    }
    final bytes = Uint8List.fromList(response.data ?? const []);
    if (sha256.convert(bytes).toString() != signed.sha256) {
      throw const ApiError(code: integrityCode);
    }
    return bytes;
  }
}

final _downloadDioProvider = Provider<Dio>((ref) {
  final dio = Dio(BaseOptions(connectTimeout: const Duration(seconds: 15), receiveTimeout: const Duration(minutes: 2)));
  ref.onDispose(dio.close);
  return dio;
});

final referenceFilesProvider = Provider<ReferenceFiles>(
  (ref) => ReferenceFiles(ref.watch(apiProvider), ref.watch(_downloadDioProvider)),
);
