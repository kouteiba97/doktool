// Phase 9: session handling, onboarding rules and the router's guards.
import 'dart:async';
import 'dart:convert';

import 'package:doktool/src/core/api/generated/dok_tool_api.dart';
import 'package:doktool/src/core/api/generated/models/auth_tokens_dto.dart';
import 'package:doktool/src/core/api/generated/models/professional_type.dart';
import 'package:doktool/src/core/auth/session.dart';
import 'package:doktool/src/core/auth/session_vault.dart';
import 'package:doktool/src/core/storage/secure_store.dart';
import 'package:doktool/src/features/account/account_controller.dart';
import 'package:doktool/src/features/onboarding/validators.dart';
import 'package:doktool/src/features/verification/document_check.dart';
import 'package:doktool/src/router/app_router.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

/// Answers `/v1/auth/refresh` like the API, counting calls; [status] 401 refuses the token.
class _RefreshAdapter implements HttpClientAdapter {
  int calls = 0;
  int status = 200;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    calls += 1;
    await Future<void>.delayed(const Duration(milliseconds: 20));
    if (status != 200) {
      return ResponseBody.fromString(
        jsonEncode({
          'error': {'code': 'SESSION_INVALID', 'message': 'revoked', 'details': <String, Object>{}},
        }),
        status,
        headers: {
          Headers.contentTypeHeader: ['application/json'],
        },
      );
    }
    return ResponseBody.fromString(
      jsonEncode({
        'sessionId': 'session-1',
        'accessToken': 'access-$calls',
        'accessTokenExpiresAt': DateTime.now().add(const Duration(minutes: 15)).toIso8601String(),
        'refreshToken': 'refresh-$calls',
        'refreshTokenExpiresAt': DateTime.now().add(const Duration(days: 30)).toIso8601String(),
      }),
      200,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

AuthTokensDto _tokens({Duration expiresIn = const Duration(minutes: 15)}) => AuthTokensDto(
  sessionId: 'session-1',
  accessToken: 'access-initial',
  accessTokenExpiresAt: DateTime.now().add(expiresIn),
  refreshToken: 'refresh-initial',
  refreshTokenExpiresAt: DateTime.now().add(const Duration(days: 30)),
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('session vault', () {
    late _RefreshAdapter adapter;
    late SessionVault vault;

    setUp(() {
      FlutterSecureStorage.setMockInitialValues({});
      adapter = _RefreshAdapter();
      final dio = Dio(BaseOptions(baseUrl: 'http://api.test'))..httpClientAdapter = adapter;
      vault = SessionVault(store: SecureStore(const FlutterSecureStorage()), bareApi: DokToolApi(dio));
    });

    test('keeps a valid access token in memory and restores the session from secure storage', () async {
      await vault.saveUser(_tokens());
      expect(await vault.accessToken(), 'access-initial');
      expect(adapter.calls, 0);
      final restored = SessionVault(store: vault.store, bareApi: vault.bareApi);
      expect(await restored.restore(), isA<UserSession>());
    });

    test('refreshes once for concurrent requests (single flight) and rotates the refresh token', () async {
      await vault.saveUser(_tokens(expiresIn: Duration.zero));
      final tokens = await Future.wait([vault.accessToken(), vault.accessToken(), vault.accessToken()]);
      expect(tokens, ['access-1', 'access-1', 'access-1']);
      expect(adapter.calls, 1);
      expect(await vault.store.read('user.refresh_token'), 'refresh-1');
    });

    test('ends the session when the refresh is refused', () async {
      await vault.saveUser(_tokens(expiresIn: Duration.zero));
      adapter.status = 401;
      var ended = false;
      vault.onSessionEnded = () => ended = true;
      expect(await vault.accessToken(), isNull);
      expect(ended, isTrue);
      expect(vault.session, isA<SignedOut>());
      expect(await vault.store.read('user.refresh_token'), isNull);
    });
  });

  group('validators', () {
    test('accept e-mails, E.164 numbers and Algerian mobiles written locally', () {
      expect(isValidIdentifier('nom@domaine.dz'), isTrue);
      expect(isValidIdentifier('0550 12 34 56'), isTrue);
      expect(isValidIdentifier('+213550123456'), isTrue);
      expect(isValidIdentifier('00213550123456'), isTrue);
      expect(isValidIdentifier('nom@domaine'), isFalse);
      expect(isValidIdentifier('0450123456'), isFalse);
    });

    test('grade passwords the way the sign-up screen explains', () {
      expect(passwordStrength('short'), PasswordStrength.tooShort);
      expect(passwordStrength('abcdefgh'), PasswordStrength.weak);
      expect(passwordStrength('abcdefg1'), PasswordStrength.fair);
      expect(passwordStrength('abcdef12!x'), PasswordStrength.strong);
    });

    test('accept Ordre numbers of digits, letters, slashes and hyphens', () {
      expect(orderNumberPattern.hasMatch('12/4567'), isTrue);
      expect(orderNumberPattern.hasMatch('AB-123456'), isTrue);
      expect(orderNumberPattern.hasMatch('<script>'), isFalse);
    });
  });

  group('document name check', () {
    test('finds the account name in a document, MRZ fillers and accents included', () {
      expect(namePresent('REPUBLIQUE ALGERIENNE\nNom: BENALI\nPrénom: Samir', 'Samir', 'Benali'), isTrue);
      expect(namePresent('P<DZABENALI<<SAMIR<<<<<<<<', 'Samir', 'Benali'), isTrue);
      expect(namePresent('Nom: BÉNALI  Prénom: SAMIR', 'Samir', 'Benali'), isTrue);
      expect(namePresent('Nom: HAMIDI Prénom: Samir', 'Samir', 'Benali'), isFalse);
      expect(namePresent('Nom: BENALI Prénom: Karim', 'Samir', 'Benali'), isFalse);
    });
  });

  group('router guards', () {
    const signedIn = AsyncData<Session>(UserSession(sessionId: 's'));
    const withProfile = AsyncData<AccountSummary?>(
      AccountSummary(userId: 'u', firstName: 'A', lastName: 'B', professionalType: ProfessionalType.doctor),
    );
    const withoutProfile = AsyncData<AccountSummary?>(AccountSummary(userId: 'u', firstName: 'A', lastName: 'B'));

    String? go(String location, AsyncValue<Session> session, AsyncValue<AccountSummary?> account, [String? after]) =>
        redirectFor(location: location, session: session, account: account, afterSignIn: after);

    test('waits on the launch screen while the session is restored', () {
      expect(go(Routes.home, const AsyncLoading(), const AsyncData(null)), Routes.launch);
      expect(go(Routes.launch, const AsyncLoading(), const AsyncData(null)), isNull);
    });

    test('keeps signed-out people on public pages', () {
      const out = AsyncData<Session>(SignedOut());
      expect(go(Routes.launch, out, const AsyncData(null)), Routes.welcome);
      expect(go(Routes.home, out, const AsyncData(null)), Routes.welcome);
      expect(go(Routes.signUp, out, const AsyncData(null)), isNull);
      expect(go(Routes.role, out, const AsyncData(null)), isNull);
    });

    test('never lets a demo reach verification, notifications, checkout or the profile pages', () {
      const demo = AsyncData<Session>(DemoSession(demoSessionId: 'd', demoContext: .doctor));
      expect(go(Routes.verificationStatus, demo, const AsyncData(null)), Routes.home);
      expect(go(Routes.notifications, demo, const AsyncData(null)), Routes.home);
      expect(go(Routes.subscription, demo, const AsyncData(null)), Routes.home);
      expect(go(Routes.subscriptionReview('p'), demo, const AsyncData(null)), Routes.home);
      expect(go(Routes.profileActivity, demo, const AsyncData(null)), Routes.home);
      // The offers are shown to the demo (ScreenDemo « Voir les offres »).
      expect(go(Routes.plans, demo, const AsyncData(null)), isNull);
      expect(go(Routes.library(.ordonnances), demo, const AsyncData(null)), isNull);
    });

    test('asks « Qui êtes-vous ? » until the account has a professional type', () {
      expect(go(Routes.home, signedIn, withoutProfile), Routes.role);
      expect(go(Routes.role, signedIn, withoutProfile), isNull);
    });

    test('sends a signed-in person from public pages to home, or to verification after sign-up', () {
      expect(go(Routes.signIn, signedIn, withProfile), Routes.home);
      expect(go(Routes.otp, signedIn, withProfile, Routes.verificationIntro), Routes.verificationIntro);
      expect(go(Routes.verificationStatus, signedIn, withProfile), isNull);
    });

    test('waits for the account after sign-in, without bouncing deeper pages', () {
      const loading = AsyncLoading<AccountSummary?>();
      expect(go(Routes.signIn, signedIn, loading), Routes.launch);
      expect(go(Routes.verificationIntro, signedIn, loading), isNull);
    });
  });
}
