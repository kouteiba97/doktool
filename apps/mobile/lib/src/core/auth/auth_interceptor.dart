import 'package:dio/dio.dart';

import '../api/api_error.dart';
import 'session_vault.dart';

/// Adds the session's bearer token to API calls. After a 401 it refreshes once and replays the
/// call; if the refresh is refused, the vault ends the session.
class AuthInterceptor extends Interceptor {
  AuthInterceptor(this._vault, this._dio);

  final SessionVault _vault;

  /// The client this interceptor belongs to, used to replay a request after a refresh.
  final Dio Function() _dio;

  static const _retried = 'doktool.auth.retried';

  /// Before each request: attaches the current access token, renewing it first when it has expired.
  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    try {
      final token = await _vault.accessToken();
      if (token != null) options.headers['Authorization'] = 'Bearer $token';
    } on ApiError {
      // Offline refresh: send without a token; public endpoints still work, others fail as usual.
    }
    handler.next(options);
  }

  /// On a 401: renews the token once and replays the request; a second 401 ends the session.
  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    final options = err.requestOptions;
    final unauthorised = err.response?.statusCode == 401;
    if (!unauthorised || options.extra[_retried] == true || !options.headers.containsKey('Authorization')) {
      return handler.next(err);
    }
    try {
      final token = await _vault.accessToken(forceRefresh: true);
      if (token == null) return handler.next(err);
      options
        ..headers['Authorization'] = 'Bearer $token'
        ..extra[_retried] = true;
      return handler.resolve(await _dio().fetch<Object?>(options));
    } on ApiError {
      return handler.next(err);
    } on DioException catch (retryError) {
      return handler.next(retryError);
    }
  }
}
