import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;

import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/api/generated/models/analytics_batch_dto.dart';
import '../../core/api/generated/models/analytics_batch_dto_platform.dart';
import '../../core/api/generated/models/analytics_event_dto.dart';
import '../../core/api/generated/models/client_analytics_event_type.dart';
import '../../core/auth/session.dart';
import '../../core/auth/session_controller.dart';
import '../../core/config/app_config.dart';
import '../../core/database/app_database.dart';
import '../offline/offline_sync.dart';
import 'analytics_event.dart';

/// Sends one batch; the API answers with what it accepted.
typedef AnalyticsSender = Future<void> Function(AnalyticsBatchDto batch);

/// Records analytics events on the device and sends them in batches (section 16): every session,
/// demo included, buffered offline up to 5 000 events with their original time, sent on the next
/// connection. An event belongs to the session that recorded it — a later account never sends it.
class AnalyticsRecorder {
  AnalyticsRecorder({
    required this._database,
    required this._session,
    required this._send,
    required this._platform,
    String? Function()? dataVersion,
    this._appVersion,
    DateTime Function()? clock,
    this._sendDelay = const Duration(seconds: 30),
  }) : _dataVersion = dataVersion ?? (() => null),
       _clock = clock ?? DateTime.now;

  final AppDatabase _database;
  final Session? Function() _session;
  final AnalyticsSender _send;
  final AnalyticsBatchDtoPlatform _platform;
  final String? Function() _dataVersion;
  final String? _appVersion;
  final DateTime Function() _clock;
  final Duration _sendDelay;

  /// Device buffer (section 16, audit Appendix C).
  static const maxQueued = 5000;

  /// Events per upload (API `MAX_BATCH`).
  static const batchSize = 100;

  /// The API drops older events (`MAX_EVENT_AGE_DAYS`), so the device does too.
  static const maxAge = Duration(days: 30);

  /// Sent at once from this many waiting events; otherwise after the send delay.
  static const sendThreshold = 20;

  static final _appVersionPattern = RegExp(r'^[0-9A-Za-z.+-]{1,20}$');
  static final _dataVersionPattern = RegExp(r'^[0-9A-Za-z:._-]{1,64}$');

  Timer? _timer;
  Future<void>? _flushing;

  /// Queues one event for the current session; nothing is recorded while signed out.
  Future<void> track(AnalyticsEvent event) async {
    final session = _session();
    final key = _keyOf(session);
    if (key == null || !event.isValid) return;
    if (AnalyticsEvent.demoOnly.contains(event.type) && session is! DemoSession) return;
    await _database
        .into(_database.analyticsQueue)
        .insert(
          AnalyticsQueueCompanion.insert(
            sessionKey: key,
            type: event.type.toJson(),
            entityId: Value(event.entityId),
            properties: jsonEncode(event.properties),
            occurredAt: _clock().toUtc(),
          ),
        );
    await _trim();
    if (await _waiting(key) >= sendThreshold) {
      unawaited(flush());
    } else {
      _timer ??= Timer(_sendDelay, () {
        _timer = null;
        unawaited(flush());
      });
    }
  }

  /// Sends what the current session has waiting. Network errors keep the events for later; a
  /// batch the API refuses outright is dropped so it cannot block the queue.
  Future<void> flush() => _flushing ??= _flush().whenComplete(() => _flushing = null);

  /// Events of the current session still on the device.
  Future<int> pending() async {
    final key = _keyOf(_session());
    return key == null ? 0 : _waiting(key);
  }

  void dispose() => _timer?.cancel();

  Future<void> _flush() async {
    _timer?.cancel();
    _timer = null;
    final key = _keyOf(_session());
    if (key == null) return;
    final queue = _database.analyticsQueue;
    await (_database.delete(queue)..where(
          (row) =>
              row.sessionKey.equals(key).not() | row.occurredAt.isSmallerThanValue(_clock().toUtc().subtract(maxAge)),
        ))
        .go();
    while (true) {
      final rows =
          await (_database.select(queue)
                ..where((row) => row.sessionKey.equals(key))
                ..orderBy([(row) => OrderingTerm.asc(row.id)])
                ..limit(batchSize))
              .get();
      if (rows.isEmpty) return;
      try {
        await _send(_batchOf(rows));
      } catch (error) {
        final status = ApiError.from(error).statusCode;
        final retryable = status == null || status == 401 || status == 408 || status == 429 || status >= 500;
        if (retryable) return;
      }
      await (_database.delete(queue)..where((row) => row.id.isIn(rows.map((row) => row.id)))).go();
      if (_keyOf(_session()) != key) return;
    }
  }

  AnalyticsBatchDto _batchOf(List<QueuedAnalyticsEvent> rows) {
    final appVersion = _appVersion;
    final dataVersion = _dataVersion();
    return AnalyticsBatchDto(
      platform: _platform,
      appVersion: appVersion != null && _appVersionPattern.hasMatch(appVersion) ? appVersion : null,
      dataVersion: dataVersion != null && _dataVersionPattern.hasMatch(dataVersion) ? dataVersion : null,
      events: [
        for (final row in rows)
          AnalyticsEventDto(
            type: ClientAnalyticsEventType.fromJson(row.type),
            occurredAt: row.occurredAt.toUtc(),
            entityId: row.entityId,
            properties: jsonDecode(row.properties),
          ),
      ],
    );
  }

  /// Keeps the newest [maxQueued] events.
  Future<void> _trim() async {
    final total = _database.analyticsQueue.id.count();
    final count = await (_database.selectOnly(
      _database.analyticsQueue,
    )..addColumns([total])).map((row) => row.read(total) ?? 0).getSingle();
    if (count <= maxQueued) return;
    final oldest =
        await (_database.select(_database.analyticsQueue)
              ..orderBy([(row) => OrderingTerm.asc(row.id)])
              ..limit(count - maxQueued))
            .get();
    await (_database.delete(_database.analyticsQueue)..where((row) => row.id.isIn(oldest.map((row) => row.id)))).go();
  }

  Future<int> _waiting(String key) async {
    final total = _database.analyticsQueue.id.count();
    return (_database.selectOnly(_database.analyticsQueue)
          ..addColumns([total])
          ..where(_database.analyticsQueue.sessionKey.equals(key)))
        .map((row) => row.read(total) ?? 0)
        .getSingle();
  }

  static String? _keyOf(Session? session) => switch (session) {
    UserSession(:final sessionId) => 'user:$sessionId',
    DemoSession(:final demoSessionId) => 'demo:$demoSessionId',
    SignedOut() || null => null,
  };
}

final analyticsRecorderProvider = Provider<AnalyticsRecorder>((ref) {
  final recorder = AnalyticsRecorder(
    database: ref.watch(appDatabaseProvider),
    session: () => ref.read(sessionControllerProvider).value,
    send: (batch) => ref.read(apiProvider).analytics.analyticsControllerIngest(body: batch),
    platform: Platform.isIOS ? AnalyticsBatchDtoPlatform.ios : AnalyticsBatchDtoPlatform.android,
    dataVersion: () => ref.read(offlineSyncProvider).value?.dataVersion,
    appVersion: AppConfig.appVersion,
  );
  ref.onDispose(recorder.dispose);
  return recorder;
});

/// Records an event without waiting; analytics never interrupt what the person is doing.
extension AnalyticsTracking on AnalyticsRecorder {
  void record(AnalyticsEvent event) => unawaited(track(event).catchError((Object _) {}));
}
