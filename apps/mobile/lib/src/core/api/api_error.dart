import 'package:dio/dio.dart';

/// A failed API call, read from the backend error envelope `{ error: { code, message, details } }`.
///
/// Screens translate [code]; they never show [message], which is for developers and logs.
class ApiError implements Exception {
  const ApiError({required this.code, this.statusCode, this.fields = const {}, this.retryAt, this.attemptsRemaining});

  /// No response reached the app (offline, timeout, DNS…).
  const ApiError.network() : this(code: networkCode);

  static const networkCode = 'NETWORK';
  static const unknownCode = 'UNKNOWN';

  final String code;
  final int? statusCode;

  /// Field name → messages, for VALIDATION_FAILED.
  final Map<String, List<String>> fields;
  final DateTime? retryAt;
  final int? attemptsRemaining;

  bool get isNetwork => code == networkCode;

  /// The session can no longer be used; the person must sign in again.
  bool get isSessionEnded => code == 'UNAUTHENTICATED' || code == 'SESSION_INVALID';

  /// Turns any failure (network, timeout, HTTP error body) into one ApiError with a stable code.
  static ApiError from(Object error) {
    if (error is ApiError) return error;
    if (error is! DioException) return const ApiError(code: unknownCode);
    switch (error.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.transformTimeout:
        return const ApiError.network();
      case DioExceptionType.badResponse:
      case DioExceptionType.badCertificate:
      case DioExceptionType.cancel:
      case DioExceptionType.unknown:
        break;
    }
    final response = error.response;
    if (response == null) return const ApiError.network();
    final data = response.data;
    final body = data is Map ? data['error'] : null;
    if (body is! Map) return ApiError(code: unknownCode, statusCode: response.statusCode);
    final details = body['details'];
    return ApiError(
      code: body['code'] is String ? body['code'] as String : unknownCode,
      statusCode: response.statusCode,
      fields: details is Map ? _fields(details['fields']) : const {},
      retryAt: details is Map && details['retryAt'] is String
          ? DateTime.tryParse(details['retryAt'] as String)?.toLocal()
          : null,
      attemptsRemaining: details is Map && details['attemptsRemaining'] is num
          ? (details['attemptsRemaining'] as num).toInt()
          : null,
    );
  }

  /// Reads the per-field validation messages of a 400 answer.
  static Map<String, List<String>> _fields(Object? raw) {
    if (raw is! Map) return const {};
    return {
      for (final entry in raw.entries)
        if (entry.key is String && entry.value is List)
          entry.key as String: [for (final message in entry.value as List) '$message'],
    };
  }

  /// Short text for logs (never shown to the user).
  @override
  String toString() => 'ApiError($code, status: $statusCode)';
}
