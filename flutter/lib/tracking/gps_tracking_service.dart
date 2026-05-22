// lib/tracking/gps_tracking_service.dart
// ─────────────────────────────────────────────────────────────────────────────
// Reads GPS continuously and forwards each fix to the operational socket.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:battery_plus/battery_plus.dart';
import 'package:dio/dio.dart';
import '../config/app_config.dart';
import '../websocket/ws_service.dart';
import '../offline/offline_queue.dart';

class GpsTrackingService extends ChangeNotifier {
  final WsService _ws;
  final OfflineQueue _offlineQueue;
  final Dio _dio = Dio();

  StreamSubscription<Position>? _subscription;
  Position? _lastPosition;
  bool _active = false;

  String? _vehicleId;
  String? _tenantId;
  String? _deviceId;
  String? _authToken;
  String? _routeId;

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

    if (permission == LocationPermission.whileInUse) {
      final always = await Permission.locationAlways.request();
      if (always.isGranted) {
        permission = LocationPermission.always;
      }
    }

    return permission == LocationPermission.always ||
        permission == LocationPermission.whileInUse;
  }

  Future<void> start({
    required String vehicleId,
    required String tenantId,
    required String deviceId,
    required String authToken,
    String? routeId,
  }) async {
    _vehicleId = vehicleId;
    _tenantId = tenantId;
    _deviceId = deviceId;
    _authToken = authToken;
    _routeId = routeId ?? _routeId;

    if (_active && _subscription != null) {
      debugPrint('[GPS] context updated vehicleId=$_vehicleId routeId=$_routeId');
      return;
    }

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

   const settings = LocationSettings(
     accuracy: LocationAccuracy.high,
     distanceFilter: 3,
   );

   _subscription = Geolocator.getPositionStream(locationSettings: settings).listen(
     (pos) => _handlePosition(pos),
     onError: (Object error, StackTrace stackTrace) {
       debugPrint('[GPS] stream error: $error');
     },
     cancelOnError: false,
   );

   debugPrint('[GPS] started vehicleId=$_vehicleId routeId=$_routeId tenantId=$_tenantId');
   await _captureCurrentFix();
  }

  void stop() {
   _subscription?.cancel();
   _subscription = null;
   _active = false;
   notifyListeners();
  }

  Future<void> _captureCurrentFix() async {
   try {
     final pos = await Geolocator.getCurrentPosition(
       desiredAccuracy: LocationAccuracy.high,
       timeLimit: const Duration(seconds: 8),
     );
     await _handlePosition(pos);
   } catch (e) {
     debugPrint('[GPS] current fix error: $e');
   }
  }

  Future<void> _handlePosition(Position pos) async {
   _lastPosition = pos;

   final batteryLevel = await _getBattery();
   final payload = {
     'vehicleId': _vehicleId!,
     'tenantId': _tenantId!,
     'deviceId': _deviceId!,
     if (_routeId != null) 'routeId': _routeId,
     'lat': pos.latitude,
     'lng': pos.longitude,
     'speed': pos.speed * 3.6,
     'heading': pos.heading,
     'accuracy': pos.accuracy,
     'batteryLevel': batteryLevel,
     'timestamp': DateTime.now().toIso8601String(),
   };

   debugPrint('[GPS] fix vehicleId=${_vehicleId!} routeId=${_routeId ?? '-'} lat=${pos.latitude} lng=${pos.longitude} speed=${payload['speed']} acc=${pos.accuracy}');

   if (_ws.connected) {
     _ws.emitLocationUpdate(
       vehicleId: _vehicleId!,
       lat: pos.latitude,
       lng: pos.longitude,
       speed: pos.speed * 3.6,
       heading: pos.heading,
       battery: batteryLevel.toDouble(),
       deviceId: _deviceId!,
       accuracy: pos.accuracy,
       routeId: _routeId,
     );
     await _tryFlush();
   } else {
     await _offlineQueue.enqueueGps(payload);
   }

   notifyListeners();
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
      await _sendRest(item);
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
