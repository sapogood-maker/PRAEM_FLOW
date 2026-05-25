// lib/operational/sync_manager.dart
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import '../auth/auth_service.dart';
import '../offline/offline_queue.dart';
import '../config/app_config.dart';

class SyncManager extends ChangeNotifier {
  final OfflineQueue _queue;
  final AuthService _auth;
  final Dio _dio = Dio();

  bool _syncing = false;
  bool get syncing => _syncing;

  SyncManager(this._queue, this._auth);

  /// Full sync cycle — call on WS reconnect and on timer.
  Future<void> syncAll() async {
    if (_syncing) return;
    _syncing = true;
    notifyListeners();
    try {
      await _syncGps();
      await _syncQr();
      await _syncOperational();
    } finally {
      _syncing = false;
      notifyListeners();
    }
  }

  Future<void> _syncGps() async {
    final pending = await _queue.pendingGps();
    if (pending.isEmpty) return;
    debugPrint('[SYNC] flushing ${pending.length} GPS fixes via REST');
    try {
      for (final payload in pending) {
        await _dio.post(
          '${AppConfig.apiBaseUrl}/tracking/heartbeat',
          data: payload,
          options: Options(headers: {'x-device-token': _auth.token}),
        );
      }
      await _queue.clearGps();
      debugPrint('[SYNC] GPS flush complete');
    } on DioException catch (e) {
      if (e.response == null) {
        debugPrint('[SYNC] GPS flush aborted — still offline');
      } else {
        debugPrint('[SYNC] GPS flush partial — server error: ${e.response?.statusCode}');
        await _queue.clearGps(); // don't retry server errors
      }
    }
  }

  Future<void> _syncQr() async {
    if (_auth.token == null) return;
    final pending = await _queue.pendingQr();
    if (pending.isEmpty) return;
    debugPrint('[SYNC] flushing ${pending.length} offline QR scans');
    final remaining = <Map<String, dynamic>>[];
    for (final item in pending) {
      try {
        await _dio.post(
          '${AppConfig.apiBaseUrl}/patients/qr/scan',
          data: item,
          options: Options(headers: {'Authorization': 'Bearer ${_auth.token}'}),
        );
      } on DioException catch (e) {
        if (e.response == null) {
          remaining.add(item);
          remaining.addAll(pending.skip(pending.indexOf(item) + 1));
          break;
        }
        // Server-side error (e.g. already scanned) — discard
        debugPrint('[SYNC] QR scan rejected by server: ${e.response?.data}');
      }
    }
    await _queue.replaceQr(remaining);
    if (remaining.isEmpty) debugPrint('[SYNC] QR flush complete');
  }

  Future<void> _syncOperational() async {
    if (_auth.token == null) return;
    final pending = await _queue.pendingOperational();
    if (pending.isEmpty) return;
    debugPrint('[SYNC] flushing ${pending.length} offline operational actions');
    final remaining = <Map<String, dynamic>>[];
    for (final item in pending) {
      final url = item['url'] as String?;
      if (url == null) continue;
      try {
        await _dio.post(
          '${AppConfig.apiBaseUrl}$url',
          options: Options(headers: {'Authorization': 'Bearer ${_auth.token}'}),
        );
      } on DioException catch (e) {
        if (e.response == null) {
          remaining.add(item);
          remaining.addAll(pending.skip(pending.indexOf(item) + 1));
          break;
        }
        debugPrint('[SYNC] op action rejected: url=$url status=${e.response?.statusCode}');
      }
    }
    await _queue.replaceOperational(remaining);
    if (remaining.isEmpty) debugPrint('[SYNC] operational flush complete');
  }
}
