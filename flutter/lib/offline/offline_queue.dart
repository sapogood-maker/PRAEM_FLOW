// lib/offline/offline_queue.dart
// ─────────────────────────────────────────────────────────────────────────────
// Local Hive-backed queue for GPS heartbeats and QR scans while offline.
// Auto-flushes when connectivity is restored.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:hive_flutter/hive_flutter.dart';
import '../config/app_config.dart';

const _gpsBox = 'offline_gps';
const _qrBox = 'offline_qr';

class OfflineQueue {
  Future<void> init() async {
    await Hive.openBox<Map>(_gpsBox);
    await Hive.openBox<Map>(_qrBox);
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
}
