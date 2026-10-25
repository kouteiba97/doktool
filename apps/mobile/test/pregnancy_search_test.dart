// ADR-025: « Grossesse · Allaitement » search — server results with each period's conduct, a
// period chosen in one tap, « no approved information » said plainly, locked rows kept, and the
// profiles kept offline searched when there is no connection.
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:doktool/src/app.dart';
import 'package:doktool/src/core/api/api_client.dart';
import 'package:doktool/src/core/api/generated/dok_tool_api.dart';
import 'package:doktool/src/core/api/generated/models/conduct.dart';
import 'package:doktool/src/core/api/generated/models/profile_content_dto.dart';
import 'package:doktool/src/core/api/generated/models/substance_profile_dto.dart';
import 'package:doktool/src/core/api/provider_retry.dart';
import 'package:doktool/src/core/database/app_database.dart';
import 'package:doktool/src/features/offline/offline_store.dart';
import 'package:doktool/src/features/pregnancy/pregnancy_search.dart';
import 'package:doktool/src/router/app_router.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/test_app.dart';

const _ibu = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const _amox = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5d';
const _available = {'state': 'AVAILABLE', 'lockReason': null, 'unlockPath': null};

Map<String, Object?> _hit(String id, String name, {Map<String, Object?>? periods, bool locked = false}) => {
  'id': id,
  'nameFr': name,
  'nameEn': null,
  'synonyms': <String>[],
  'version': 1,
  'publishedAt': '2026-10-20T10:00:00.000Z',
  'access': locked
      ? {'state': 'LOCKED', 'lockReason': 'SUBSCRIPTION_REQUIRED', 'unlockPath': 'subscription.plans'}
      : _available,
  'periods': periods,
};

final _ibuPeriods = {
  'T1': {'conduct': null, 'evidenceLevel': 2},
  'T2': {'conduct': 'AVOID', 'evidenceLevel': 3},
  'T3': {'conduct': 'CONTRAINDICATED', 'evidenceLevel': 4},
  'PERIPARTUM': null,
  'LACTATION': {'conduct': null, 'evidenceLevel': 3},
};

class _Api implements HttpClientAdapter {
  _Api({this.offline = false});

  final bool offline;
  final queries = <String?>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (offline) throw DioException(requestOptions: options, type: DioExceptionType.connectionError);
    if (options.path == '/v1/pregnancy/substances/search') {
      queries.add(options.queryParameters['q'] as String?);
      return ResponseBody.fromString(
        jsonEncode({
          'total': 2,
          'items': [_hit(_ibu, 'Ibuprofène', periods: _ibuPeriods), _hit(_amox, 'Amoxicilline', locked: true)],
        }),
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

  Future<_Api> pump(WidgetTester tester, {bool offline = false}) async {
    final api = _Api(offline: offline);
    final dio = Dio(BaseOptions(baseUrl: 'http://api.test'))..httpClientAdapter = api;
    await tester.pumpWidget(
      ProviderScope(
        retry: providerRetry,
        overrides: [
          ...testOverrides(database: database),
          apiProvider.overrideWithValue(DokToolApi(dio)),
          routerProvider.overrideWith((ref) => singleScreenRouter(const Scaffold(body: SubstanceSearch(query: 'ibu')))),
        ],
        child: const DokToolApp(),
      ),
    );
    await tester.pumpAndSettle();
    return api;
  }

  testWidgets('asks the server, then shows the conduct of the period chosen in one tap', (tester) async {
    final api = await pump(tester);
    expect(api.queries, ['ibu']);
    expect(find.text('Ibuprofène'), findsOneWidget);
    expect(find.text('Amoxicilline'), findsOneWidget);
    // No period chosen: names only.
    expect(find.text('Éviter'), findsNothing);

    await tester.ensureVisible(find.text('2e trimestre'));
    await tester.tap(find.text('2e trimestre'));
    await tester.pumpAndSettle();
    expect(find.text('Éviter'), findsOneWidget);
    expect(find.text('Données modérées'), findsOneWidget);
    // A locked row keeps its place and shows no content.
    expect(find.textContaining('Inclus dans DokTool Pro'), findsNothing);

    await tester.ensureVisible(find.text('Péri-partum'));
    await tester.tap(find.text('Péri-partum'));
    await tester.pumpAndSettle();
    expect(find.text('Péri-partum : aucune information validée'), findsOneWidget);

    await tester.ensureVisible(find.text('Allaitement'));
    await tester.tap(find.text('Allaitement'));
    await tester.pumpAndSettle();
    expect(find.text('Sans consigne particulière'), findsOneWidget);
    // One request: changing the period reads what the page already has.
    expect(api.queries, ['ibu']);
  });

  testWidgets('searches the profiles kept offline when there is no connection, and says so', (tester) async {
    await OfflineStore(database).saveSubstance(
      SubstanceProfileDto.fromJson({
        ..._hit(_ibu, 'Ibuprofène'),
        'content': {
          'pregnancy': {
            'periods': {
              'T1': {
                'conduct': 'AVOID',
                'evidence': {'level': 2},
              },
              'T2': null,
              'T3': null,
              'PERIPARTUM': null,
            },
            'alternatives': <String>[],
          },
          'lactation': null,
        },
        'alternatives': <Object>[],
        'sources': <Object>[],
        'reviewedAt': '2026-10-20T10:00:00.000Z',
        'reviewerName': 'Dr K. Benali',
        'underReview': false,
      }),
    );
    await pump(tester, offline: true);
    expect(find.textContaining('Hors connexion'), findsOneWidget);
    expect(find.text('Ibuprofène'), findsOneWidget);
    expect(find.text('Amoxicilline'), findsNothing);
    await tester.ensureVisible(find.text('1er trimestre'));
    await tester.tap(find.text('1er trimestre'));
    await tester.pumpAndSettle();
    expect(find.text('Éviter'), findsOneWidget);
  });

  test('rebuilds period summaries from a stored profile without inventing any', () {
    final summaries = periodSummaries(
      ProfileContentDto.fromJson({
        'pregnancy': {
          'periods': {
            'T1': {
              'conduct': 'CONTRAINDICATED',
              'evidence': {'level': 4},
            },
            'T2': null,
            'T3': null,
            'PERIPARTUM': null,
          },
          'alternatives': <String>[],
        },
        'lactation': null,
      }),
    )!;
    expect(summaries.t1?.conduct, Conduct.contraindicated);
    expect(summaries.t1?.evidenceLevel, 4);
    expect(summaries.t2, isNull);
    expect(summaries.lactation, isNull);
    expect(periodSummaries(null), isNull);
  });
}
