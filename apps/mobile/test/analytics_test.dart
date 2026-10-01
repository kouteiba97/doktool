// Phase 17c: analytics events carry only what the API accepts, wait offline on the device (at most
// 5 000) and leave in batches of 100 for the session that recorded them.
import 'package:dio/dio.dart';
import 'package:doktool/src/core/api/generated/models/analytics_batch_dto.dart';
import 'package:doktool/src/core/api/generated/models/analytics_batch_dto_platform.dart';
import 'package:doktool/src/core/api/generated/models/client_analytics_event_type.dart';
import 'package:doktool/src/core/api/generated/models/demo_context.dart';
import 'package:doktool/src/core/api/generated/models/favorite_target_type.dart';
import 'package:doktool/src/core/api/generated/models/reference_document_type.dart';
import 'package:doktool/src/core/api/generated/models/search_type.dart';
import 'package:doktool/src/core/auth/session.dart';
import 'package:doktool/src/core/database/app_database.dart';
import 'package:doktool/src/features/analytics/analytics_event.dart';
import 'package:doktool/src/features/analytics/analytics_host.dart';
import 'package:doktool/src/features/analytics/analytics_recorder.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/test_app.dart';

const _model = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

DioException _failure({int? status}) {
  final request = RequestOptions(path: '/v1/analytics/events');
  return status == null
      ? DioException(requestOptions: request, type: DioExceptionType.connectionError)
      : DioException(
          requestOptions: request,
          type: DioExceptionType.badResponse,
          response: Response<Object?>(
            requestOptions: request,
            statusCode: status,
            data: {'code': 'VALIDATION_FAILED', 'message': 'invalid'},
          ),
        );
}

void main() {
  group('events', () {
    test('carry only codes and counts, never the words searched', () {
      final search = AnalyticsEvent.searchPerformed(
        resultCount: 7,
        groups: [SearchType.certificate, SearchType.calculator, SearchType.ordonnance],
      );
      expect(search.properties, {
        'resultCount': 7,
        'groups': ['CALCULATOR', 'REFERENCE_DOCUMENT'],
      });
      expect(search.entityId, isNull);
      expect(search.isValid, isTrue);

      final viewed = AnalyticsEvent.referenceViewed(id: _model, fileVersion: 3, offline: true);
      expect(viewed.properties, {'fileVersion': 3, 'source': 'offline'});
      expect(viewed.isValid, isTrue);
    });

    test('are refused when the API would refuse them', () {
      expect(
        AnalyticsEvent.referenceSearched(referenceType: ReferenceDocumentType.$unknown, resultCount: 1).isValid,
        isFalse,
      );
      expect(AnalyticsEvent.searchPerformed(resultCount: -1, groups: const []).isValid, isFalse);
      expect(AnalyticsEvent.calculatorStarted(id: 'not-a-uuid', version: 1).isValid, isFalse);
      expect(AnalyticsEvent.calculatorStarted(id: _model, version: 0).isValid, isFalse);
      expect(
        AnalyticsEvent.calculatorCompleted(id: _model, version: 2, resultBand: null, engine: 'python-1').isValid,
        isFalse,
      );
    });

    test('send a band code only when it is a code', () {
      final band = AnalyticsEvent.calculatorCompleted(
        id: _model,
        version: 2,
        resultBand: 'STAGE_3A',
        engine: 'dart-1.0.0',
      );
      expect(band.properties['resultBand'], 'STAGE_3A');
      expect(band.isValid, isTrue);
      final label = AnalyticsEvent.calculatorCompleted(
        id: _model,
        version: 2,
        resultBand: 'stade 3a',
        engine: 'dart-1.0.0',
      );
      expect(label.properties['resultBand'], isNull);
      expect(label.isValid, isTrue);
    });

    test('name screens and demo modules from the route', () {
      expect(subscriptionScreenFor('/subscription/plans'), SubscriptionScreen.plans);
      expect(subscriptionScreenFor('/subscription'), SubscriptionScreen.subscription);
      expect(subscriptionScreenFor('/subscription/review/plan-1'), SubscriptionScreen.review);
      expect(subscriptionScreenFor('/subscription/result/tx-1'), isNull);
      expect(demoModuleFor('/library/ordonnances'), DemoModule.library);
      expect(demoModuleFor('/reference/$_model'), DemoModule.reference);
      expect(demoModuleFor('/calculators/clairance'), DemoModule.calculator);
      expect(demoModuleFor('/subscription/plans'), DemoModule.subscription);
      expect(demoModuleFor('/settings/offline'), DemoModule.offline);
      expect(demoModuleFor('/welcome'), isNull);
    });
  });

  group('recorder', () {
    late AppDatabase database;
    late Session? session;
    late List<AnalyticsBatchDto> sent;
    late Object? failure;
    late DateTime now;
    late AnalyticsRecorder recorder;

    setUp(() {
      database = memoryDatabase();
      session = const UserSession(sessionId: 'session-a');
      sent = [];
      failure = null;
      now = DateTime.utc(2026, 10, 1, 9);
      recorder = AnalyticsRecorder(
        database: database,
        session: () => session,
        send: (batch) async {
          if (failure != null) throw failure!;
          sent.add(batch);
        },
        platform: AnalyticsBatchDtoPlatform.android,
        dataVersion: () => '3f9a0c1d2e4b5a6c',
        appVersion: '1.0.0+12',
        clock: () => now,
        sendDelay: const Duration(hours: 1),
      );
    });

    tearDown(() async {
      recorder.dispose();
      await database.close();
    });

    Future<void> trackMany(int count) async {
      for (var index = 0; index < count; index++) {
        await recorder.track(AnalyticsEvent.calculatorStarted(id: _model, version: 1));
      }
      await recorder.flush();
    }

    test('records nothing while signed out', () async {
      session = const SignedOut();
      await recorder.track(AnalyticsEvent.subscriptionViewed(SubscriptionScreen.plans));
      expect(await database.select(database.analyticsQueue).get(), isEmpty);
    });

    test('keeps demo events for demo sessions', () async {
      await recorder.track(AnalyticsEvent.demoStarted(DemoContext.doctor));
      expect(await recorder.pending(), 0);
      session = const DemoSession(demoSessionId: 'demo-1', demoContext: DemoContext.doctor);
      await recorder.track(AnalyticsEvent.demoStarted(DemoContext.doctor));
      await recorder.track(AnalyticsEvent.demoFeatureViewed(DemoModule.calculator, locked: true));
      expect(await recorder.pending(), 2);
    });

    test('sends as soon as 20 events wait', () async {
      for (var index = 1; index < AnalyticsRecorder.sendThreshold; index++) {
        await recorder.track(AnalyticsEvent.calculatorStarted(id: _model, version: 1));
      }
      await pumpEventQueue();
      expect(sent, isEmpty);

      await recorder.track(AnalyticsEvent.calculatorStarted(id: _model, version: 1));
      await pumpEventQueue();
      expect(sent.single.events, hasLength(AnalyticsRecorder.sendThreshold));
      expect(await recorder.pending(), 0);
    });

    test('sends an offline backlog in batches of at most 100, with time and envelope', () async {
      failure = _failure();
      await trackMany(250);
      failure = null;
      await recorder.flush();
      expect(sent.map((batch) => batch.events.length), [100, 100, 50]);
      final first = sent.first;
      expect(first.platform, AnalyticsBatchDtoPlatform.android);
      expect(first.appVersion, '1.0.0+12');
      expect(first.dataVersion, '3f9a0c1d2e4b5a6c');
      expect(first.events.first.type, ClientAnalyticsEventType.calculatorStarted);
      expect(first.events.first.occurredAt, now);
      expect(first.events.first.properties, {'version': 1});
      expect(await recorder.pending(), 0);
    });

    test('keeps everything while offline and sends it on the next flush', () async {
      failure = _failure();
      await trackMany(30);
      expect(sent, isEmpty);
      expect(await recorder.pending(), 30);

      failure = null;
      await recorder.flush();
      expect(sent.single.events, hasLength(30));
      expect(await recorder.pending(), 0);
    });

    test('drops a batch the API refuses outright, so it cannot block the queue', () async {
      await recorder.track(AnalyticsEvent.favorite(id: _model, targetType: FavoriteTargetType.calculator, added: true));
      failure = _failure(status: 400);
      await recorder.flush();
      expect(await recorder.pending(), 0);

      await recorder.track(
        AnalyticsEvent.favorite(id: _model, targetType: FavoriteTargetType.calculator, added: false),
      );
      failure = _failure(status: 503);
      await recorder.flush();
      expect(await recorder.pending(), 1);
    });

    test('never sends one session’s events for another', () async {
      failure = _failure();
      await recorder.track(AnalyticsEvent.subscriptionViewed(SubscriptionScreen.plans));
      await recorder.flush();

      failure = null;
      session = const UserSession(sessionId: 'session-b');
      await recorder.track(AnalyticsEvent.subscriptionViewed(SubscriptionScreen.review));
      await recorder.flush();
      expect(sent.single.events.single.properties, {'screen': 'review'});
      expect(await database.select(database.analyticsQueue).get(), isEmpty);
    });

    test('drops events older than the API keeps', () async {
      failure = _failure();
      await recorder.track(AnalyticsEvent.subscriptionViewed(SubscriptionScreen.plans));
      now = now.add(const Duration(days: 31));
      failure = null;
      await recorder.flush();
      expect(sent, isEmpty);
      expect(await recorder.pending(), 0);
    });

    test('keeps the newest 5 000 events', () async {
      failure = _failure();
      await database.batch((batch) {
        batch.insertAll(database.analyticsQueue, [
          for (var index = 0; index < AnalyticsRecorder.maxQueued; index++)
            AnalyticsQueueCompanion.insert(
              sessionKey: 'user:session-a',
              type: 'CALCULATOR_STARTED',
              properties: '{"version":1}',
              occurredAt: now,
            ),
        ]);
      });
      await recorder.track(AnalyticsEvent.calculatorStarted(id: _model, version: 2));
      await recorder.flush();
      final rows = await database.select(database.analyticsQueue).get();
      expect(rows, hasLength(AnalyticsRecorder.maxQueued));
      expect(rows.first.id, 2);
      expect(rows.last.properties, '{"version":2}');
    });
  });
}
