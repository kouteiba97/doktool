import 'package:dio/dio.dart';

import 'api_error.dart';

/// How a failed provider tries again. A request that never reached the server (no network) is not
/// retried: the screen says « Connexion requise » at once and offers « Réessayer », instead of a
/// skeleton that waits through Riverpod's default ten attempts. A timeout or a server error (5xx)
/// may be passing, so it gets two quick attempts. A refusal (4xx) is an answer, never retried.
Duration? providerRetry(int retryCount, Object error) {
  if (retryCount >= 2) return null;
  if (error is ApiError) return (error.statusCode ?? 0) >= 500 ? _delay(retryCount) : null;
  if (error is! DioException) return null;
  final transient = switch (error.type) {
    DioExceptionType.connectionTimeout || DioExceptionType.receiveTimeout || DioExceptionType.sendTimeout => true,
    DioExceptionType.badResponse => (error.response?.statusCode ?? 0) >= 500,
    _ => false,
  };
  return transient ? _delay(retryCount) : null;
}

/// Waits a little longer before each new attempt (0.4 s, 0.8 s, 1.2 s…).
Duration _delay(int retryCount) => Duration(milliseconds: 400 * (retryCount + 1));
