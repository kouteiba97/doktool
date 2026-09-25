import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/settings/settings_controller.dart';
import '../config/app_config.dart';
import 'generated/dok_tool_api.dart';

/// Sends the interface language, so server texts (e.g. OTP messages) match it.
class AcceptLanguageInterceptor extends Interceptor {
  AcceptLanguageInterceptor(this._language);

  final String Function() _language;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    options.headers['Accept-Language'] = _language();
    handler.next(options);
  }
}

/// HTTP client for the DokTool API. The auth interceptor (tokens, single-flight refresh) is
/// added with sign-in in Phase 9.
final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 20),
      headers: const {'Accept': 'application/json'},
    ),
  );
  dio.interceptors.add(
    AcceptLanguageInterceptor(() => ref.read(settingsControllerProvider).value?.language.name ?? 'fr'),
  );
  ref.onDispose(dio.close);
  return dio;
});

/// The generated client of the user API (packages/api-contract).
final apiProvider = Provider<DokToolApi>((ref) => DokToolApi(ref.watch(dioProvider)));
