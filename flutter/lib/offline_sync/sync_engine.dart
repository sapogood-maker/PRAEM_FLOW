import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../auth/auth_service.dart';
import '../config/app_config.dart';
import 'conflict_resolver.dart';
import 'connectivity_service.dart';
import 'offline_queue_service.dart';

class SyncEngine extends ChangeNotifier {
  final OfflineQueueService _queue;
  final ConnectivityService _connectivity;
  final AuthService _auth;
  final ConflictResolver _resolver;
  final Dio _dio;

  bool _syncing = false;
  int _retryIndex = 0;
  Timer? _retryTimer;
  String? _lastError;

  SyncEngine(
    this._queue,
    this._connectivity,
    this._auth,
    this._resolver, {
    Dio? dio,
  }) : _dio = dio ?? Dio() {
    _connectivity.addListener(_onConnectivityChanged);
  }

  bool get syncing => _syncing;
  String? get lastError => _lastError;

  Future<void> syncNow({bool manual = false}) async {
    if (_syncing) return;
    if (_auth.token == null || _auth.tenantId == null) return;

    _syncing = true;
    _lastError = null;
    _connectivity.setSyncing(true);
    notifyListeners();
    try {
      final pending = await _queue.pendingEvents();
      final rawPending = await _queue.rawPendingQueue();
      if (rawPending.isEmpty) {
        _retryIndex = 0;
        return;
      }
      final replayOrderByEventId = <String, int>{};
      for (var index = 0; index < pending.length; index++) {
        final eventId = pending[index]['eventId']?.toString();
        if (eventId == null || eventId.isEmpty) continue;
        replayOrderByEventId[eventId] = index + 1;
      }
      _logPendingQueueAudit(rawPending,
          replayOrderByEventId: replayOrderByEventId);
      if (pending.isEmpty) {
        _retryIndex = 0;
        debugPrint(
            '[SYNC][QUEUE_AUDIT] no replayable pending events after stale filtering');
        return;
      }

      for (var index = 0; index < pending.length; index += 25) {
        final batch = pending.skip(index).take(25).toList();
        await _postBatch(batch, queueOffset: index);
      }

      _retryIndex = 0;
      _retryTimer?.cancel();
      await _queue.refreshMetrics();
    } on DioException catch (error) {
      _lastError = error.message ?? 'Falha de sincronização';
      if (error.response == null) {
        final pending = await _queue.pendingEvents();
        for (final item in pending) {
          await _queue.incrementRetry(
              item['tableName']?.toString() ?? 'offline_sync_queue',
              item['eventId'].toString());
        }
        _scheduleRetry();
      } else {
        debugPrint(
            '[SYNC] server rejected batch status=${error.response?.statusCode}');
      }
    } finally {
      _syncing = false;
      _connectivity.setSyncing(false);
      notifyListeners();
    }
  }

  Future<void> _postBatch(List<Map<String, dynamic>> batch,
      {required int queueOffset}) async {
    final deviceId = (batch.first['deviceId'] as String?) ?? 'unknown';
    final processedAt = DateTime.now().toUtc().toIso8601String();
    final eventsWithOrder = batch.asMap().entries.map((entry) {
      final queueOrder = queueOffset + entry.key + 1;
      final event = Map<String, dynamic>.from(entry.value);
      event['queueOrder'] = queueOrder;
      return event;
    }).toList();
    for (final event in eventsWithOrder) {
      debugPrint(
          '[SYNC][REPLAY] type=${event['type']} tripId=${event['tripId'] ?? (event['payload'] as Map?)?['tripId'] ?? 'null'} createdAt=${event['createdAt'] ?? 'null'} processedAt=$processedAt queueOrder=${event['queueOrder']} eventId=${event['eventId']}');
    }
    final response = await _dio.post(
      '${AppConfig.apiBaseUrl}/sync/offline-events',
      data: {
        'deviceId': deviceId,
        'events': eventsWithOrder,
      },
      options: Options(
        headers: {
          if (_auth.token != null) 'Authorization': 'Bearer ${_auth.token}',
        },
      ),
    );

    final data = response.data;
    final body =
        data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};
    final syncedIds =
        (body['syncedEventIds'] as List?)?.map((e) => e.toString()).toList() ??
            const <String>[];
    final conflicts = (body['conflicts'] as List?)?.cast<Map>() ?? const [];
    final serverSnapshot = body['snapshot'] is Map
        ? Map<String, dynamic>.from(body['snapshot'] as Map)
        : null;

    for (final item in eventsWithOrder) {
      if (syncedIds.contains(item['eventId'].toString())) {
        await _queue.markSynced(
            item['tableName'] as String? ?? 'offline_sync_queue',
            item['eventId'].toString());
      }
    }

    for (final conflict in conflicts) {
      final eventId = conflict['eventId']?.toString();
      if (eventId == null) continue;
      await _queue.saveConflictLog(
        eventId: eventId,
        operationId: conflict['operationId']?.toString(),
        deviceId: conflict['deviceId']?.toString(),
        entityType: conflict['entityType']?.toString() ?? 'unknown',
        entityId: conflict['entityId']?.toString(),
        localState: conflict['localState'] is Map
            ? Map<String, dynamic>.from(conflict['localState'] as Map)
            : null,
        serverState: conflict['serverState'] is Map
            ? Map<String, dynamic>.from(conflict['serverState'] as Map)
            : null,
        resolution:
            conflict['resolution']?.toString() ?? 'server_authoritative',
        reason:
            conflict['reason']?.toString() ?? 'Conflito operacional detectado',
      );
      await _queue.markConflict(
          conflict['tableName']?.toString() ?? 'offline_sync_queue', eventId,
          reason: conflict['reason']?.toString() ??
              'Conflito operacional detectado');
      final decision = _resolver.resolve(
        event: conflict['event'] is Map
            ? Map<String, dynamic>.from(conflict['event'] as Map)
            : <String, dynamic>{'type': conflict['type']},
        serverState: conflict['serverState'] is Map
            ? Map<String, dynamic>.from(conflict['serverState'] as Map)
            : <String, dynamic>{},
      );
      debugPrint(
          '[SYNC] conflict eventId=$eventId resolution=${decision.resolution} reason=${decision.reason}');
    }

    if (conflicts.isNotEmpty) {
      _lastError = 'Conflito operacional detectado';
      notifyListeners();
    }

    if (serverSnapshot != null) {
      await _queue.saveSnapshot(snapshot: serverSnapshot);
    }
  }

  void _scheduleRetry() {
    _retryTimer?.cancel();
    const delays = [2, 5, 10, 30, 60];
    final index = _retryIndex.clamp(0, delays.length - 1).toInt();
    final seconds = delays[index];
    _retryIndex = (_retryIndex + 1).clamp(0, delays.length - 1).toInt();
    _retryTimer = Timer(Duration(seconds: seconds), () {
      syncNow();
    });
  }

  void _logPendingQueueAudit(
    List<Map<String, dynamic>> pending, {
    required Map<String, int> replayOrderByEventId,
  }) {
    for (final event in pending) {
      final eventId = event['eventId']?.toString();
      final queueOrder = eventId == null ? null : replayOrderByEventId[eventId];
      final tripId = event['tripId']?.toString() ??
          (event['payload'] as Map?)?['tripId']?.toString() ??
          'null';
      debugPrint(
          '[SYNC][QUEUE_AUDIT] type=${event['type']} tripId=$tripId createdAt=${event['createdAt'] ?? 'null'} processedAt=- queueOrder=${queueOrder ?? 'filtered'} eventId=${event['eventId']} replay=${queueOrder == null ? 'no' : 'yes'}');
    }
  }

  void _onConnectivityChanged() {
    if (_syncing || _auth.token == null || _auth.tenantId == null) return;
    final hasInternet =
        !_connectivity.connectivity.contains(ConnectivityResult.none);
    if (!hasInternet) return;
    _retryTimer?.cancel();
    unawaited(syncNow());
  }

  @override
  void dispose() {
    _connectivity.removeListener(_onConnectivityChanged);
    _retryTimer?.cancel();
    super.dispose();
  }
}
