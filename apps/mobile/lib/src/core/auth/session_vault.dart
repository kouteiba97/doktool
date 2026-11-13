import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_error.dart';
import '../api/generated/dok_tool_api.dart';
import '../api/generated/models/auth_tokens_dto.dart';
import '../api/generated/models/demo_context.dart';
import '../api/generated/models/demo_session_dto.dart';
import '../api/generated/models/refresh_dto.dart';
import '../api/generated/models/renew_demo_token_dto.dart';
import '../config/app_config.dart';
import '../storage/secure_store.dart';
import 'session.dart';

/// Holds the credentials of the current [Session].
///
/// - Refresh and renewal tokens are kept in secure storage.
/// - Access tokens are kept in memory only.
///
/// A new access token is obtained with a single-flight refresh: concurrent requests wait for the
/// same refresh (refresh tokens are single use and rotated, ADR-009).
class SessionVault {
  SessionVault({required this.store, required this.bareApi});

  final SecureStore store;

  /// Client without the auth interceptor, used for refresh and renewal calls.
  final DokToolApi bareApi;

  static const _userSessionId = 'user.session_id';
  static const _userRefreshToken = 'user.refresh_token';
  static const _demoSessionId = 'demo.session_id';
  static const _demoRenewalToken = 'demo.renewal_token';
  static const _demoContext = 'demo.context';

  /// A token is renewed this long before it expires.
  static const _expiryMargin = Duration(seconds: 30);

  Session _session = const SignedOut();
  String? _accessToken;
  DateTime? _accessExpiresAt;
  Future<String?>? _inFlight;

  /// Called when the server ends the session (revoked, expired, reused refresh token).
  /// `openedElsewhere` is true when the account was opened on another device.
  void Function({required bool openedElsewhere})? onSessionEnded;

  Session get session => _session;

  /// Reads which session (account or demo) was saved on this device; signed out when none.
  Future<Session> restore() async {
    final userSessionId = await store.read(_userSessionId);
    if (userSessionId != null && await store.read(_userRefreshToken) != null) {
      return _session = UserSession(sessionId: userSessionId);
    }
    final demoSessionId = await store.read(_demoSessionId);
    final demoContext = DemoContext.fromJson(await store.read(_demoContext) ?? '');
    if (demoSessionId != null && demoContext != DemoContext.$unknown && await store.read(_demoRenewalToken) != null) {
      return _session = DemoSession(demoSessionId: demoSessionId, demoContext: demoContext);
    }
    return _session = const SignedOut();
  }

  /// After sign-in: stores the refresh token in the secure store and keeps the access token in memory.
  Future<UserSession> saveUser(AuthTokensDto tokens) async {
    await _clearStored();
    await store.write(_userSessionId, tokens.sessionId);
    await store.write(_userRefreshToken, tokens.refreshToken);
    _remember(tokens.accessToken, tokens.accessTokenExpiresAt);
    final session = UserSession(sessionId: tokens.sessionId);
    _session = session;
    return session;
  }

  /// After « Essayer la démo »: stores the demo's renewal token and context.
  Future<DemoSession> saveDemo(DemoSessionDto demo) async {
    await _clearStored();
    await store.write(_demoSessionId, demo.demoSessionId);
    await store.write(_demoRenewalToken, demo.renewalToken);
    await store.write(_demoContext, demo.demoContext.toJson());
    _remember(demo.accessToken, demo.accessTokenExpiresAt);
    final session = DemoSession(demoSessionId: demo.demoSessionId, demoContext: demo.demoContext);
    _session = session;
    return session;
  }

  /// Forgets every token (sign-out).
  Future<void> clear() async {
    await _clearStored();
    _session = const SignedOut();
  }

  /// A valid access token for the current session, or null when signed out.
  ///
  /// Throws [ApiError.network] when a refresh was needed but the server could not be reached. The
  /// session is kept in that case, so the person stays signed in offline.
  Future<String?> accessToken({bool forceRefresh = false}) {
    if (_session is SignedOut) return Future.value();
    final expiresAt = _accessExpiresAt;
    if (!forceRefresh &&
        _accessToken != null &&
        expiresAt != null &&
        DateTime.now().isBefore(expiresAt.subtract(_expiryMargin))) {
      return Future.value(_accessToken);
    }
    return _inFlight ??= _renew().whenComplete(() => _inFlight = null);
  }

  /// Gets a new access token with the refresh (or demo renewal) token; ends the session if refused.
  Future<String?> _renew() async {
    final session = _session;
    final deviceId = await store.installationId();
    try {
      switch (session) {
        case SignedOut():
          return null;
        case UserSession():
          final refreshToken = await store.read(_userRefreshToken);
          if (refreshToken == null) return await _end();
          final tokens = await bareApi.auth.authControllerRefresh(
            body: RefreshDto(refreshToken: refreshToken, deviceId: deviceId),
          );
          await store.write(_userRefreshToken, tokens.refreshToken);
          _remember(tokens.accessToken, tokens.accessTokenExpiresAt);
          return tokens.accessToken;
        case DemoSession():
          final renewalToken = await store.read(_demoRenewalToken);
          if (renewalToken == null) return await _end();
          final token = await bareApi.demo.demoControllerRenew(
            body: RenewDemoTokenDto(renewalToken: renewalToken, deviceId: deviceId),
          );
          _remember(token.accessToken, token.accessTokenExpiresAt);
          return token.accessToken;
      }
    } on DioException catch (error) {
      final apiError = ApiError.from(error);
      final status = apiError.statusCode ?? 0;
      if (apiError.isNetwork || status >= 500 || apiError.code == 'RATE_LIMITED') throw apiError;
      return _end(openedElsewhere: apiError.openedElsewhere);
    }
  }

  /// The session is over (revoked, expired): clears it and tells the app to show the welcome screen.
  Future<String?> _end({bool openedElsewhere = false}) async {
    await clear();
    onSessionEnded?.call(openedElsewhere: openedElsewhere);
    return null;
  }

  /// Keeps the access token and its expiry in memory only (never written to disk).
  void _remember(String token, DateTime expiresAt) {
    _accessToken = token;
    _accessExpiresAt = expiresAt;
  }

  /// Deletes every stored token of both account and demo sessions.
  Future<void> _clearStored() async {
    _accessToken = null;
    _accessExpiresAt = null;
    for (final key in [_userSessionId, _userRefreshToken, _demoSessionId, _demoRenewalToken, _demoContext]) {
      await store.delete(key);
    }
  }
}

/// Dio without the auth interceptor: token refresh, demo renewal and signed storage uploads.
final bareDioProvider = Provider<Dio>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 20),
      headers: const {'Accept': 'application/json'},
    ),
  );
  ref.onDispose(dio.close);
  return dio;
});

final sessionVaultProvider = Provider<SessionVault>(
  (ref) => SessionVault(store: ref.watch(secureStoreProvider), bareApi: DokToolApi(ref.watch(bareDioProvider))),
);
