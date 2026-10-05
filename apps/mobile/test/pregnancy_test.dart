// Phase 19: « Grossesse · Allaitement » (ADR-019) — conduct and evidence shown apart, never a
// verdict; « Absence de données » as a full block; locked profiles keep their reason; WCAG checks.
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:doktool/src/app.dart';
import 'package:doktool/src/core/api/api_client.dart';
import 'package:doktool/src/core/api/generated/dok_tool_api.dart';
import 'package:doktool/src/core/database/app_database.dart';
import 'package:doktool/src/features/analytics/analytics_event.dart';
import 'package:doktool/src/core/api/generated/models/substance_profile_dto.dart';
import 'package:doktool/src/core/api/provider_retry.dart';
import 'package:doktool/src/features/offline/offline_store.dart';
import 'package:doktool/src/features/pregnancy/substance_screen.dart';
import 'package:doktool/src/router/app_router.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/test_app.dart';

const _id = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const _paracetamol = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';

Map<String, Object?> _period(int level, {String? conduct}) => {
  'conduct': conduct,
  if (conduct != null) 'conductDetail': {'fr': 'Contre-indiqué à partir de 24 SA.'},
  'riskContext': {'fr': 'Toxicité fœtale établie.'},
  'evidence': {
    'level': level,
    'population': {'fr': 'cohortes concordantes'},
  },
};

Map<String, Object?> _profile({bool locked = false}) => {
  'id': _id,
  'nameFr': 'Ibuprofène',
  'nameEn': 'Ibuprofen',
  'synonyms': ['Advil'],
  'version': 2,
  'publishedAt': '2026-10-01T10:00:00.000Z',
  'access': locked
      ? {'state': 'LOCKED', 'lockReason': 'SUBSCRIPTION_REQUIRED', 'unlockPath': 'subscription.plans'}
      : {'state': 'AVAILABLE', 'lockReason': null, 'unlockPath': null},
  'content': locked
      ? null
      : {
          'pregnancy': {
            'periods': {
              'T1': _period(0),
              'T2': _period(3, conduct: 'AVOID'),
              'T3': _period(4, conduct: 'CONTRAINDICATED'),
              'PERIPARTUM': _period(4, conduct: 'CONTRAINDICATED'),
            },
            'alternatives': [_paracetamol],
          },
          'lactation': {
            'conduct': null,
            'conductText': {'fr': "Compatible avec l'allaitement."},
            'relativeInfantDose': '0,6 %',
            'maternalHalfLife': '2 h',
            'evidence': {'level': 3},
            'alternatives': <String>[],
          },
        },
  'alternatives': [
    {'id': _paracetamol, 'nameFr': 'Paracétamol', 'nameEn': 'Paracetamol'},
  ],
  'sources': [
    {
      'id': '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a60',
      'title': 'CRAT',
      'publisher': null,
      'type': 'REFERENCE',
      'edition': '09/2026',
      'year': 2026,
      'url': null,
    },
  ],
  'reviewedAt': '2026-10-01T10:00:00.000Z',
  'reviewerName': 'Dr K. Benali',
  'underReview': true,
};

class _Api implements HttpClientAdapter {
  _Api(this.body, {this.offline = false});

  final Map<String, Object?> body;

  /// No connection: every call fails as the network would.
  final bool offline;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (offline) throw DioException(requestOptions: options, type: DioExceptionType.connectionError);
    if (options.path == '/v1/pregnancy/substances/$_id') {
      return ResponseBody.fromString(
        jsonEncode(body),
        200,
        headers: {
          Headers.contentTypeHeader: ['application/json'],
        },
      );
    }
    return ResponseBody.fromString('', 503);
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late AppDatabase database;

  setUp(() => database = memoryDatabase());
  tearDown(() => database.close());

  Future<void> pump(
    WidgetTester tester,
    Map<String, Object?> body, {
    String appearance = 'light',
    bool offline = false,
  }) async {
    await database.writeSetting('appearance', appearance);
    final dio = Dio(BaseOptions(baseUrl: 'http://api.test'))..httpClientAdapter = _Api(body, offline: offline);
    await tester.pumpWidget(
      ProviderScope(
        retry: providerRetry,
        overrides: [
          ...testOverrides(database: database),
          apiProvider.overrideWithValue(DokToolApi(dio)),
          routerProvider.overrideWith((ref) => singleScreenRouter(const SubstanceScreen(id: _id))),
        ],
        child: const DokToolApp(),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('opens a profile kept for offline reading when there is no connection', (tester) async {
    await OfflineStore(database).saveSubstance(SubstanceProfileDto.fromJson(_profile()));
    await pump(tester, _profile(), offline: true);
    expect(find.text('Ibuprofène'), findsOneWidget);
    expect(find.text("Ce n'est pas une preuve d'innocuité."), findsOneWidget);
  });

  testWidgets('says the connection is needed for a profile never kept offline', (tester) async {
    await pump(tester, _profile(), offline: true);
    expect(find.text('Ibuprofène'), findsNothing);
    expect(find.text('Connexion requise'), findsOneWidget);
  });

  testWidgets('shows « Absence de données » as a full block, never an empty area', (tester) async {
    await pump(tester, _profile());
    expect(find.text('Ibuprofène'), findsOneWidget);
    expect(find.text('Une version plus récente est en relecture. Celle-ci reste la référence.'), findsOneWidget);
    expect(find.text("Ce n'est pas une preuve d'innocuité."), findsOneWidget);
    expect(find.text('Paracétamol'), findsOneWidget);
    // The page scrolls under the hero top bar: bring the footer into view first.
    await tester.scrollUntilVisible(
      find.text('Sources : CRAT 09/2026'),
      200,
      scrollable: find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down).first,
    );
    expect(find.text('Sources : CRAT 09/2026'), findsOneWidget);
    expect(find.textContaining('Dr K. Benali'), findsOneWidget);
  });

  testWidgets('keeps the conduct (instruction) apart from the evidence level (how sure)', (tester) async {
    final semantics = tester.ensureSemantics();
    await pump(tester, _profile());
    await tester.tap(find.text('3e trimestre').first);
    await tester.pumpAndSettle();
    expect(find.text('Contre-indiqué'), findsWidgets);
    expect(find.text('Contre-indiqué à partir de 24 SA.'), findsOneWidget);
    expect(find.text('Données robustes'), findsWidgets);
    expect(find.text('cohortes concordantes'), findsOneWidget);
    expect(find.bySemanticsLabel('Niveau de preuve : Données robustes, 4 sur 4'), findsOneWidget);
    // No safe/unsafe verdict anywhere (Lock L6).
    expect(find.textContaining('sans danger'), findsNothing);
    expect(find.textContaining('sûr'), findsNothing);
    semantics.dispose();
  });

  testWidgets('shows lactation: conduct first, then infant exposure', (tester) async {
    await pump(tester, _profile());
    await tester.tap(find.text('Allaitement'));
    await tester.pumpAndSettle();
    expect(find.text("Compatible avec l'allaitement."), findsOneWidget);
    expect(find.text('0,6 %'), findsOneWidget);
    expect(find.text('2 h'), findsOneWidget);
    expect(find.text('Données modérées'), findsOneWidget);
  });

  testWidgets('keeps a locked profile with its reason and no content', (tester) async {
    await pump(tester, _profile(locked: true));
    expect(find.text('Pro'), findsOneWidget);
    expect(find.text('Comment y accéder'), findsOneWidget);
    expect(find.text('Contre-indiqué'), findsNothing);
  });

  for (final appearance in ['light', 'dark']) {
    testWidgets('meets the touch, label and contrast guidelines ($appearance)', (tester) async {
      final semantics = tester.ensureSemantics();
      await pump(tester, _profile(), appearance: appearance);
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      semantics.dispose();
    });
  }

  test('reports a profile view with its block and version only', () {
    final event = AnalyticsEvent.pregnancyViewed(id: _id, section: PregnancySection.lactation, version: 2);
    expect(event.properties, {'section': 'lactation', 'version': 2});
    expect(event.isValid, isTrue);
    expect(
      AnalyticsEvent.pregnancyViewed(id: 'not-a-uuid', section: PregnancySection.pregnancy, version: 2).isValid,
      isFalse,
    );
  });
}
