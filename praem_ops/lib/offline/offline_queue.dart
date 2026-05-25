// lib/offline/offline_queue.dart
// ─────────────────────────────────────────────────────────────────────────────
// Local Hive-backed queue for GPS heartbeats and QR scans while offline.
// Auto-flushes when connectivity is restored.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:hive_flutter/hive_flutter.dart';
import '../config/app_config.dart';

const _gpsBox = 'offline_gps';
const _qrBox = 'offline_qr';
const _opsBox = 'offline_ops';

class OfflineQueue {
  Future<void> init() async {
    await Hive.openBox<Map>(_gpsBox);
    await Hive.openBox<Map>(_qrBox);
    await Hive.openBox<Map>(_opsBox);
  }

  // ─── GPS pending heartbeats ───────────────────────────────────────────────

  Future<void> enqueueGps(Map<String, dynamic> payload) async {
    final box = Hive.box<Map>(_gpsBox);
    // Trim oldest if over max
    while (box.length >= AppConfig.offlineQueueMaxSize) {
      await box.deleteAt(0);
    }
    await box.add(payload);
  }

  Future<List<Map<String, dynamic>>> pendingGps() async {
    final box = Hive.box<Map>(_gpsBox);
    return box.values
        .map((m) => Map<String, dynamic>.from(m))
        .toList();
  }

  Future<void> clearGps() async {
    await Hive.box<Map>(_gpsBox).clear();
  }

  Future<void> replaceGps(List<Map<String, dynamic>> payloads) async {
    final box = Hive.box<Map>(_gpsBox);
    await box.clear();
    for (final payload in payloads) {
      await box.add(payload);
    }
  }

  // ─── QR scan pending events ───────────────────────────────────────────────

  Future<void> enqueueQr(Map<String, dynamic> payload) async {
    final box = Hive.box<Map>(_qrBox);
    while (box.length >= AppConfig.offlineQueueMaxSize) {
      await box.deleteAt(0);
    }
    await box.add(payload);
  }

  Future<List<Map<String, dynamic>>> pendingQr() async {
    final box = Hive.box<Map>(_qrBox);
    return box.values
        .map((m) => Map<String, dynamic>.from(m))
        .toList();
  }

  Future<void> clearQr() async {
    await Hive.box<Map>(_qrBox).clear();
  }

  Future<void> replaceQr(List<Map<String, dynamic>> payloads) async {
    final box = Hive.box<Map>(_qrBox);
    await box.clear();
    for (final payload in payloads) {
      await box.add(payload);
    }
  }

  // ─── Operational action queue (status transitions) ─────────────────────────

  Future<void> enqueueOperational(Map<String, dynamic> payload) async {
    final box = Hive.box<Map>(_opsBox);
    while (box.length >= AppConfig.offlineQueueMaxSize) {
      await box.deleteAt(0);
    }
    await box.add(payload);
  }

  Future<List<Map<String, dynamic>>> pendingOperational() async {
    final box = Hive.box<Map>(_opsBox);
    return box.values.map((m) => Map<String, dynamic>.from(m)).toList();
  }

  Future<void> replaceOperational(List<Map<String, dynamic>> payloads) async {
    final box = Hive.box<Map>(_opsBox);
    await box.clear();
    for (final payload in payloads) {
      await box.add(payload);
    }
  }
}
