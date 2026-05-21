// lib/tracking/gps_tracking_service.dart
// ─────────────────────────────────────────────────────────────────────────────
// Reads GPS at ~10s intervals and sends heartbeat via WS or REST fallback.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:battery_plus/battery_plus.dart';
import 'package:dio/dio.dart';
import '../config/app_config.dart';
import '../websocket/ws_service.dart';
import '../offline/offline_queue.dart';

class GpsTrackingService extends ChangeNotifier {
  final WsService _ws;
  final OfflineQueue _offlineQueue;
  final Dio _dio = Dio();

  Timer? _timer;
  Position? _lastPosition;
  bool _active = false;

  String? _vehicleId;
  String? _tenantId;
  String? _deviceId;
  String? _authToken;

  bool get active => _active;
  Position? get lastPosition => _lastPosition;

  GpsTrackingService(this._ws, this._offlineQueue);

  Future<bool> requestPermission() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return false;

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    return permission == LocationPermission.always ||
        permission == LocationPermission.whileInUse;
  }

  Future<void> start({
    required String vehicleId,
    required String tenantId,
    required String deviceId,
    required String authToken,
  }) async {
    if (_active) return;
    _vehicleId = vehicleId;
    _tenantId = tenantId;
    _deviceId = deviceId;
    _authToken = authToken;

    final ok = await requestPermission();
    if (!ok) {
      debugPrint('[GpsTracking] location permission denied');
      return;
    }

    _active = true;
    notifyListeners();

    _timer = Timer.periodic(
      Duration(seconds: AppConfig.gpsIntervalSeconds),
      (_) => _tick(),
    );
    // Immediate first tick
    await _tick();
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
    _active = false;
    notifyListeners();
  }

  Future<void> _tick() async {
    try {
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 8),
      );
      _lastPosition = pos;

      final batteryLevel = await _getBattery();

      final payload = {
        'vehicleId': _vehicleId!,
        'tenantId': _tenantId!,
        'deviceId': _deviceId!,
        'lat': pos.latitude,
        'lng': pos.longitude,
        'speed': pos.speed * 3.6, // m/s → km/h
        'heading': pos.heading,
        'accuracy': pos.accuracy,
        'batteryLevel': batteryLevel,
        'timestamp': DateTime.now().toIso8601String(),
      };

      if (_ws.connected) {
        _ws.emitHeartbeat(
          vehicleId: _vehicleId!,
          lat: pos.latitude,
          lng: pos.longitude,
          speed: pos.speed * 3.6,
          heading: pos.heading,
          battery: batteryLevel.toDouble(),
          deviceId: _deviceId!,
        );
        // Also persist via REST for DB storage
        _sendRest(payload);
      } else {
        // Offline — queue for later sync
        await _offlineQueue.enqueueGps(payload);
        _tryFlush();
      }

      notifyListeners();
    } catch (e) {
      debugPrint('[GpsTracking] tick error: $e');
    }
  }

  Future<void> _sendRest(Map<String, dynamic> payload) async {
    try {
      await _dio.post(
        '${AppConfig.apiBaseUrl}/tracking/heartbeat',
        data: payload,
        options: Options(headers: {'x-device-token': _authToken}),
      );
    } catch (e) {
      debugPrint('[GpsTracking] REST heartbeat error: $e');
    }
  }

  Future<void> _tryFlush() async {
    final pending = await _offlineQueue.pendingGps();
    if (pending.isEmpty || !_ws.connected) return;
    for (final item in pending) {
      _sendRest(item);
    }
    await _offlineQueue.clearGps();
  }

  Future<int> _getBattery() async {
    try {
      final battery = Battery();
      return await battery.batteryLevel;
    } catch (_) {
      return -1;
    }
  }

  @override
  void dispose() {
    stop();
    super.dispose();
  }
}
