import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import '../config/app_config.dart';
import 'offline_storage_service.dart';

class OfflineQueueService extends ChangeNotifier {
  final OfflineStorageService _storage;
  final Uuid _uuid;

  int _pendingCount = 0;
  DateTime? _lastSyncedAt;

  OfflineQueueService(this._storage, {Uuid? uuid}) : _uuid = uuid ?? const Uuid();

  int get pendingCount => _pendingCount;
  DateTime? get lastSyncedAt => _lastSyncedAt;

  Future<void> init() async {
    await _storage.init();
    await refreshMetrics();
  }

  Future<void> refreshMetrics() async {
    _pendingCount = await _storage.pendingCount();
    _lastSyncedAt = await _storage.lastSyncedAt();
    notifyListeners();
  }

  Future<Map<String, dynamic>> enqueueEvent({
    required String table,
    required String type,
    required Map<String, dynamic> payload,
    required String deviceId,
    String? operationId,
    String? routeId,
    String? tripId,
    String syncStatus = 'pending',
  }) async {
    final eventId = _uuid.v4();
    final now = DateTime.now().toUtc().toIso8601String();
    final event = <String, dynamic>{
      'id': eventId,
      'eventId': eventId,
      'tableName': table,
      'operationId': operationId ?? routeId ?? tripId ?? deviceId,
      'deviceId': deviceId,
      'type': type,
      'payload': payload,
      'routeId': routeId,
      'tripId': tripId,
      'createdAt': now,
      'syncStatus': syncStatus,
      'retryCount': 0,
    };
    await _storage.upsertEvent(table, event);
    if (table != 'offline_events') {
      await _storage.upsertEvent('offline_events', event);
    }
    await _storage.upsertEvent('offline_sync_queue', event);
    _pendingCount++;
    notifyListeners();
    return event;
  }

  Future<Map<String, dynamic>> enqueueQrScan({
    required Map<String, dynamic> payload,
    required String deviceId,
    String? operationId,
    String? routeId,
    String? tripId,
  }) {
    return enqueueEvent(
      table: 'offline_qr_scans',
      type: 'QR_SCAN',
      payload: payload,
      deviceId: deviceId,
      operationId: operationId,
      routeId: routeId,
      tripId: tripId,
    );
  }

  Future<Map<String, dynamic>> enqueueBoarding({
    required Map<String, dynamic> payload,
    required String deviceId,
    String? operationId,
    String? routeId,
    String? tripId,
  }) {
    return enqueueEvent(
      table: 'offline_boardings',
      type: 'BOARDING',
      payload: payload,
      deviceId: deviceId,
      operationId: operationId,
      routeId: routeId,
      tripId: tripId,
    );
  }

  Future<Map<String, dynamic>> enqueueGps({
    required Map<String, dynamic> payload,
    required String deviceId,
    String? operationId,
    String? routeId,
  }) {
    return enqueueEvent(
      table: 'offline_gps',
      type: 'GPS_UPDATE',
      payload: payload,
      deviceId: deviceId,
      operationId: operationId,
      routeId: routeId,
    );
  }

  Future<Map<String, dynamic>> enqueueOperationalAction({
    required String type,
    required Map<String, dynamic> payload,
    required String deviceId,
    String? operationId,
    String? routeId,
    String? tripId,
  }) {
    return enqueueEvent(
      table: 'offline_sync_queue',
      type: type,
      payload: payload,
      deviceId: deviceId,
      operationId: operationId,
      routeId: routeId,
      tripId: tripId,
    );
  }

  Future<List<Map<String, dynamic>>> pendingEvents({int? limit}) async {
    return _storage.loadEvents('offline_sync_queue', syncStatus: 'pending', limit: limit);
  }

  Future<List<Map<String, dynamic>>> pendingBoardings({int? limit}) async {
    return _storage.loadEvents('offline_boardings', syncStatus: 'pending', limit: limit);
  }

  Future<List<Map<String, dynamic>>> pendingGps({int? limit}) async {
    return _storage.loadEvents('offline_gps', syncStatus: 'pending', limit: limit);
  }

  Future<List<Map<String, dynamic>>> pendingQrScans({int? limit}) async {
    return _storage.loadEvents('offline_qr_scans', syncStatus: 'pending', limit: limit);
  }

  Future<void> markSynced(String table, String eventId) async {
    await _storage.markSynced(table, eventId);
    await _storage.markSynced('offline_events', eventId);
    await _storage.markSynced('offline_sync_queue', eventId);
    await refreshMetrics();
  }

  Future<void> markConflict(String table, String eventId, {required String reason}) async {
    await _storage.markConflict(table, eventId, reason: reason);
    await _storage.markConflict('offline_events', eventId, reason: reason);
    await _storage.markConflict('offline_sync_queue', eventId, reason: reason);
    await refreshMetrics();
  }

  Future<void> incrementRetry(String table, String eventId) async {
    await _storage.incrementRetry(table, eventId);
    await _storage.incrementRetry('offline_events', eventId);
    await _storage.incrementRetry('offline_sync_queue', eventId);
    await refreshMetrics();
  }

  Future<void> saveSnapshot({
    required Map<String, dynamic> snapshot,
  }) async {
    final routeId = (snapshot['currentRoute'] as Map?)?['id'] as String? ??
        snapshot['routeId'] as String? ??
        'global';
    await _storage.saveRouteSnapshot(routeId, snapshot);
  }

  Future<Map<String, dynamic>?> loadSnapshot({String? routeId}) {
    return _storage.loadRouteSnapshot(routeId);
  }

  Future<void> saveConflictLog({
    required String eventId,
    String? operationId,
    String? deviceId,
    required String entityType,
    String? entityId,
    Map<String, dynamic>? localState,
    Map<String, dynamic>? serverState,
    required String resolution,
    required String reason,
  }) {
    return _storage.saveConflictLog(
      eventId: eventId,
      operationId: operationId,
      deviceId: deviceId,
      entityType: entityType,
      entityId: entityId,
      localState: localState,
      serverState: serverState,
      resolution: resolution,
      reason: reason,
    );
  }

  String get offlineQrSecret => AppConfig.offlineQrSecret;
}
