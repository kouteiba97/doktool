// ADR-023: « Accès perdu ? » leads to the shortest way back in; the assisted recovery proves the
// new contact before the photos; Settings shows both contacts and lets the owner stop a recovery
// someone else asked for; security and subscription notices are rendered.
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:doktool/src/app.dart';
import 'package:doktool/src/core/api/api_client.dart';
import 'package:doktool/src/core/api/generated/dok_tool_api.dart';
import 'package:doktool/src/core/api/generated/models/notification_dto.dart';
import 'package:doktool/src/core/auth/session.dart';
import 'package:doktool/src/core/auth/session_controller.dart';
import 'package:doktool/src/core/database/app_database.dart';
import 'package:doktool/src/features/notifications/notifications_screen.dart';
import 'package:doktool/src/features/recovery/access_help_screen.dart';
import 'package:doktool/src/features/recovery/recovery_screen.dart';
import 'package:doktool/src/features/settings/account_security_screen.dart';
import 'package:doktool/src/l10n/generated/app_localizations.dart';
import 'package:doktool/src/router/app_router.dart';
import 'package:doktool/src/ui/dt_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/test_app.dart';

/// Answers the recovery and contacts endpoints like the API; anything else is unavailable.
class _ApiAdapter implements HttpClientAdapter {
  final List<String> calls = [];
  bool recoveryOpen = true;

  ResponseBody _json(Object body, int status) => ResponseBody.fromString(
    jsonEncode(body),
    status,
    headers: {
      Headers.contentTypeHeader: ['application/json'],
    },
  );

  Map<String, Object?> _contacts() => {
    'email': 'amina@example.dz',
    'emailConfirmed': true,
    'phone': null,
    'phoneConfirmed': false,
    'recoverable': false,
    'pendingRecovery': recoveryOpen ? {'status': 'APPROVED', 'effectiveAt': '2026-10-06T10:00:00.000Z'} : null,
  };

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<List<int>>? requestStream, Future<void>? cancel) async {
    calls.add('${options.method} ${options.path}');
    final challenge = {
      'challengeId': '0191f7a2-0000-7000-8000-000000000001',
      'channel': 'SMS',
      'destinationHint': '+21366•••••67',
      'expiresAt': '2026-10-05T10:10:00.000Z',
      'resendAvailableAt': '2026-10-05T10:01:00.000Z',
    };
    return switch ('${options.method} ${options.path}') {
      'POST /v1/auth/recovery' => _json({
        'requestId': '0191f7a2-0000-7000-8000-000000000002',
        'challenge': challenge,
      }, 202),
      'POST /v1/auth/recovery/confirm' => _json({
        'recoveryToken': 'token-${'x' * 40}',
        'expiresAt': '2026-10-05T11:00:00.000Z',
      }, 200),
      'GET /v1/me/contacts' => _json(_contacts(), 200),
      'POST /v1/me/recovery/cancel' => () {
        recoveryOpen = false;
        return _json(_contacts(), 200);
      }(),
      _ => ResponseBody.fromString('', 503),
    };
  }

  @override
  void close({bool force = false}) {}
}

class _SignedIn extends SessionController {
  @override
  Future<Session> build() async => const UserSession(sessionId: 'session-1');
}

void main() {
  late AppDatabase database;
  late _ApiAdapter adapter;

  setUp(() {
    database = memoryDatabase();
    adapter = _ApiAdapter();
  });
  tearDown(() => database.close());

  Future<void> pump(WidgetTester tester, Widget screen, {bool signedIn = false}) async {
    final dio = Dio(BaseOptions(baseUrl: 'http://api.test'))..httpClientAdapter = adapter;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...testOverrides(database: database),
          apiProvider.overrideWithValue(DokToolApi(dio)),
          if (signedIn) sessionControllerProvider.overrideWith(_SignedIn.new),
          routerProvider.overrideWith((ref) => singleScreenRouter(screen)),
        ],
        child: const DokToolApp(),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('« Accès perdu ? » offers the three ways back in', (tester) async {
    await pump(tester, const AccessHelpScreen());
    expect(find.text('J’ai oublié mon mot de passe'), findsOneWidget);
    expect(find.text('J’ai changé d’e-mail ou de numéro'), findsOneWidget);
    expect(find.text('J’ai tout perdu'), findsOneWidget);
  });

  testWidgets('the assisted recovery proves the new contact before asking for photos', (tester) async {
    await pump(tester, const RecoveryScreen());
    final send = find.widgetWithText(DtButton, 'Recevoir un code');
    expect(tester.widget<DtButton>(send).onPressed, isNull);

    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'amina@example.dz');
    await tester.enterText(fields.at(1), 'Amina');
    await tester.enterText(fields.at(2), 'Belkacem');
    await tester.enterText(fields.at(3), '0661234567');
    await tester.pump();
    await tester.tap(find.text('Recevoir un code'));
    await tester.pumpAndSettle();
    expect(adapter.calls, contains('POST /v1/auth/recovery'));
    expect(find.textContaining('+21366•••••67'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, '123456');
    await tester.pump();
    await tester.tap(find.text('Vérifier'));
    await tester.pumpAndSettle();
    expect(adapter.calls, contains('POST /v1/auth/recovery/confirm'));
    expect(find.text('Votre pièce d’identité'), findsOneWidget);
    expect(find.text('Selfie avec votre pièce'), findsOneWidget);
    expect(tester.widget<DtButton>(find.widgetWithText(DtButton, 'Envoyer la demande')).onPressed, isNull);
  });

  testWidgets('Settings shows the contacts and lets the owner stop a recovery', (tester) async {
    await pump(tester, const AccountSecurityScreen(), signedIn: true);
    expect(find.text('amina@example.dz'), findsOneWidget);
    expect(find.textContaining('Ajoutez un téléphone'), findsOneWidget);
    expect(find.textContaining('Une récupération de votre compte prendra effet'), findsOneWidget);

    await tester.tap(find.text('Ce n’est pas moi'));
    await tester.pumpAndSettle();
    expect(adapter.calls, contains('POST /v1/me/recovery/cancel'));
    expect(find.text('Demande annulée. Par précaution, changez votre mot de passe.'), findsOneWidget);
    expect(find.textContaining('Une récupération de votre compte prendra effet'), findsNothing);
  });

  test('renders the security and subscription notices', () async {
    final l10n = await AppLocalizations.delegate.load(const Locale('fr'));
    NotificationDto notice(String key, Map<String, String> params) => NotificationDto(
      id: 'n',
      type: 'security',
      messageKey: key,
      params: params,
      createdAt: DateTime.utc(2026, 10, 5),
    );
    expect(
      notificationText(l10n, notice('mobile.notifications.securityContactAdded', {'channel': 'PHONE'})),
      'Un numéro de téléphone a été ajouté à votre compte.',
    );
    expect(
      notificationText(l10n, notice('mobile.notifications.subscriptionActivated', {})),
      'Votre abonnement DokTool Pro est actif.',
    );
    expect(
      notificationText(
        l10n,
        notice('mobile.notifications.subscriptionRenewal', {'endsAt': '2026-11-04T10:00:00.000Z'}),
      ),
      contains('4 novembre 2026'),
    );
    expect(notificationText(l10n, notice('mobile.notifications.unknown', {})), isNull);
  });
}
