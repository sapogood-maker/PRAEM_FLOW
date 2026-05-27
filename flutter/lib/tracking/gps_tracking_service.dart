// lib/tracking/gps_tracking_service.dart
// ─────────────────────────────────────────────────────────────────────────────
// Reads GPS continuously and forwards each fix to the operational socket.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:battery_plus/battery_plus.dart';
import '../websocket/ws_service.dart';
import '../offline/offline_queue.dart';
import '../config/app_config.dart';

class GpsTrackingService extends ChangeNotifier {
  final WsService _ws;
  final OfflineQueue _offlineQueue;

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
    if (!serviceEnabled) {
      debugPrint('[GPS] location service disabled');
      return false;
    }

    LocationPermission permission = await Geolocator.checkPermission();
    debugPrint('[GPS] permission before request=$permission');
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      debugPrint('[GPS] permission after request=$permission');
    }

    if (permission == LocationPermission.whileInUse) {
      final always = await Permission.locationAlways.request();
      if (always.isGranted) {
        permission = LocationPermission.always;
        debugPrint('[GPS] background permission granted');
      } else {
        debugPrint('[GPS] background permission not granted (using whileInUse)');
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
      debugPrint('[GPS] location permission denied');
      return;
    }

    _active = true;
    notifyListeners();

    final androidSettings = AndroidSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10,
      forceLocationManager: false,
      intervalDuration: Duration(seconds: AppConfig.gpsIntervalSeconds),
      foregroundNotificationConfig: const ForegroundNotificationConfig(
        notificationText: 'PRAEM OPS — rastreamento ativo',
        notificationTitle: 'GPS Operacional',
        enableWakeLock: true,
        notificationIcon: AndroidResource(
          name: 'ic_notification',
          defType: 'drawable',
        ),
      ),
    );

    final iosSettings = AppleSettings(
      accuracy: LocationAccuracy.high,
      activityType: ActivityType.automotiveNavigation,
      distanceFilter: 10,
      pauseLocationUpdatesAutomatically: false,
      showBackgroundLocationIndicator: true,
    );

    const settings = LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10,
    );

    final locationSettings = _isAndroid()
        ? androidSettings as LocationSettings
        : _isIos()
            ? iosSettings as LocationSettings
            : settings;

   _subscription = Geolocator.getPositionStream(locationSettings: locationSettings).listen(
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

  /// Resume tracking if it stopped unexpectedly (e.g. after a system kill).
  Future<void> restartIfNeeded() async {
    if (_active && _subscription != null) return;
    if (_vehicleId == null || _tenantId == null || _deviceId == null || _authToken == null) {
      debugPrint('[GPS] restartIfNeeded — missing context, skipping');
      return;
    }
    debugPrint('[GPS] restartIfNeeded — restarting stream');
    await start(
      vehicleId: _vehicleId!,
      tenantId: _tenantId!,
      deviceId: _deviceId!,
      authToken: _authToken!,
      routeId: _routeId,
    );
  }

  bool _isAndroid() {
    return defaultTargetPlatform == TargetPlatform.android;
  }

  bool _isIos() {
    return defaultTargetPlatform == TargetPlatform.iOS;
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

   debugPrint('[GPS] fix driverId=${_ws.driverId ?? '-'} routeId=${_routeId ?? '-'} lat=${pos.latitude} lng=${pos.longitude} speed=${payload['speed']} heading=${pos.heading} acc=${pos.accuracy}');

   await _offlineQueue.enqueueGps(
     payload: payload,
     deviceId: _deviceId!,
     operationId: _routeId,
     routeId: _routeId,
   );

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
   }

   notifyListeners();
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
