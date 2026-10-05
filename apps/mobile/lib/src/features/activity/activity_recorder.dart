import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/generated/models/activity_entry_dto.dart';
import '../../core/api/generated/models/activity_kind.dart';
import '../../core/api/generated/models/record_activity_dto.dart';
import '../../core/auth/session.dart';
import '../../core/auth/session_controller.dart';
import '../../core/database/app_database.dart';
import '../../core/storage/secure_store.dart';

/// Records the person's own research history (searches, models consulted, calculators used) on
/// the device and syncs it in batches, offline included. Nothing is recorded for a demo, and never
/// a value typed in a calculator (Lock L42).
class ActivityRecorder {
  ActivityRecorder(this._ref);

  final Ref _ref;

  static const _queueKey = 'activity.queue';
  static const _batch = 100;
  static const _maxQueued = 500;
  Future<void>? _flushing;

  Future<void> search(String query) => _add(ActivityKind.search, queryText: query.trim());

  Future<void> referenceViewed(String referenceId) => _add(ActivityKind.referenceView, targetId: referenceId);

  Future<void> calculatorUsed(String calculatorId) => _add(ActivityKind.calculatorUse, targetId: calculatorId);

  Future<void> substanceViewed(String substanceId) => _add(ActivityKind.pregnancyView, targetId: substanceId);

  Future<void> _add(ActivityKind kind, {String? queryText, String? targetId}) async {
    if (_ref.read(sessionControllerProvider).value is! UserSession) return;
    if (kind == ActivityKind.search && (queryText == null || queryText.length < 2)) return;
    final database = _ref.read(appDatabaseProvider);
    final queue = await _read(database);
    queue.add({
      'kind': kind.toJson(),
      'queryText': ?queryText,
      'targetId': ?targetId,
      'occurredAt': DateTime.now().toUtc().toIso8601String(),
    });
    await _write(database, queue.length > _maxQueued ? queue.sublist(queue.length - _maxQueued) : queue);
    unawaited(flush());
  }

  /// Sends what is queued; kept for later when offline.
  Future<void> flush() => _flushing ??= _flush().whenComplete(() => _flushing = null);

  Future<void> _flush() async {
    if (_ref.read(sessionControllerProvider).value is! UserSession) return;
    final database = _ref.read(appDatabaseProvider);
    var queue = await _read(database);
    final deviceId = await _ref.read(secureStoreProvider).installationId();
    while (queue.isNotEmpty) {
      final batch = queue.take(_batch).toList();
      try {
        await _ref
            .read(apiProvider)
            .activity
            .activityControllerRecord(
              body: RecordActivityDto(
                deviceId: deviceId,
                entries: [
                  for (final entry in batch)
                    ActivityEntryDto(
                      kind: ActivityKind.fromJson(entry['kind']! as String),
                      queryText: entry['queryText'] as String?,
                      targetId: entry['targetId'] as String?,
                      occurredAt: DateTime.parse(entry['occurredAt']! as String),
                    ),
                ],
              ),
            );
      } catch (_) {
        return;
      }
      queue = (await _read(database)).skip(batch.length).toList();
      await _write(database, queue);
    }
  }

  Future<List<Map<String, Object?>>> _read(AppDatabase database) async {
    final raw = await database.readSetting(_queueKey);
    if (raw == null) return [];
    final decoded = jsonDecode(raw);
    return decoded is List ? [for (final item in decoded) (item as Map).cast<String, Object?>()] : [];
  }

  Future<void> _write(AppDatabase database, List<Map<String, Object?>> queue) =>
      database.writeSetting(_queueKey, jsonEncode(queue));
}

final activityRecorderProvider = Provider<ActivityRecorder>(ActivityRecorder.new);
