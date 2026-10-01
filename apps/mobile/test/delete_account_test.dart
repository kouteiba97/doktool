// Phase 18: « Supprimer mon compte » — the password confirms it, a wrong one stays on the form, and
// after the deletion the device keeps only its own preferences.
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:doktool/src/app.dart';
import 'package:doktool/src/core/api/api_client.dart';
import 'package:doktool/src/core/api/generated/dok_tool_api.dart';
import 'package:doktool/src/core/auth/session.dart';
import 'package:doktool/src/core/auth/session_controller.dart';
import 'package:doktool/src/core/database/app_database.dart';
import 'package:doktool/src/features/settings/delete_account_screen.dart';
import 'package:doktool/src/router/app_router.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/test_app.dart';

/// Answers POST /v1/me/deletion like the API (400 on the password field, or 204); any other call
/// (the analytics upload) meets an unavailable server, so queued events stay on the device.
class _DeletionAdapter implements HttpClientAdapter {
  bool wrongPassword = false;
  final List<String> bodies = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (options.path != '/v1/me/deletion') return ResponseBody.fromString('', 503);
    bodies.add(jsonEncode(options.data));
    if (wrongPassword) {
      return ResponseBody.fromString(
        jsonEncode({
          'error': {
            'code': 'VALIDATION_FAILED',
            'message': 'Wrong password.',
            'details': {
              'fields': {
                'password': ['Wrong password.'],
              },
            },
          },
        }),
        400,
        headers: {
          Headers.contentTypeHeader: ['application/json'],
        },
      );
    }
    return ResponseBody.fromString('', 204);
  }

  @override
  void close({bool force = false}) {}
}

class _SignedIn extends SessionController {
  bool signedOut = false;

  @override
  Future<Session> build() async => const UserSession(sessionId: 'session-1');

  @override
  Future<void> signOut() async {
    signedOut = true;
    state = const AsyncData(SignedOut());
  }
}

void main() {
  late AppDatabase database;
  late _DeletionAdapter adapter;
  late _SignedIn session;

  setUp(() {
    database = memoryDatabase();
    adapter = _DeletionAdapter();
    session = _SignedIn();
  });
  tearDown(() => database.close());

  Future<void> pump(WidgetTester tester) async {
    final dio = Dio(BaseOptions(baseUrl: 'http://api.test'))..httpClientAdapter = adapter;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...testOverrides(database: database),
          apiProvider.overrideWithValue(DokToolApi(dio)),
          sessionControllerProvider.overrideWith(() => session),
          routerProvider.overrideWith((ref) => singleScreenRouter(const DeleteAccountScreen())),
        ],
        child: const DokToolApp(),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('says what is erased and kept, and needs the password', (tester) async {
    await pump(tester);
    expect(find.text('Ce qui est effacé'), findsOneWidget);
    expect(find.text('Ce qui est conservé'), findsOneWidget);
    expect(find.text('Un abonnement en cours prend fin aujourd’hui, sans remboursement.'), findsOneWidget);
    await tester.tap(find.text('Supprimer le compte').last);
    await tester.pumpAndSettle();
    expect(adapter.bodies, isEmpty);
  });

  testWidgets('keeps the person on the form after a wrong password', (tester) async {
    adapter.wrongPassword = true;
    await pump(tester);
    await tester.enterText(find.byType(TextField), 'not it');
    await tester.pump();
    await tester.tap(find.text('Supprimer le compte').last);
    await tester.pumpAndSettle();
    expect(find.text('Mot de passe incorrect.'), findsOneWidget);
    expect(session.signedOut, isFalse);
  });

  testWidgets('signs out and forgets the account on the device, keeping its preferences', (tester) async {
    await database.writeSetting('appearance', 'dark');
    await database.writeSetting('language', 'fr');
    await database.writeSetting('auth.last_identifier', 'amina@example.dz');
    await database.writeSetting('search.recent', '["angine"]');
    await database
        .into(database.analyticsQueue)
        .insert(
          AnalyticsQueueCompanion.insert(
            sessionKey: 'user:session-1',
            type: 'SUBSCRIPTION_VIEWED',
            properties: '{"screen":"plans"}',
            occurredAt: DateTime.utc(2026, 10, 1),
          ),
        );
    await pump(tester);
    await tester.enterText(find.byType(TextField), 'the password');
    await tester.pump();
    await tester.tap(find.text('Supprimer le compte').last);
    // In the app the router leaves for Welcome here; this test router stays, so time is advanced
    // explicitly rather than waiting for the button's spinner to settle.
    for (var step = 0; step < 10; step++) {
      await tester.pump(const Duration(milliseconds: 100));
    }

    expect(adapter.bodies.single, '{"password":"the password"}');
    expect(session.signedOut, isTrue);
    final keys = (await database.select(database.localSettings).get()).map((row) => row.key).toSet();
    expect(keys, {'appearance', 'language'});
    expect(await database.select(database.analyticsQueue).get(), isEmpty);
    expect(find.text('Votre compte a été supprimé.'), findsOneWidget);
  });
}
