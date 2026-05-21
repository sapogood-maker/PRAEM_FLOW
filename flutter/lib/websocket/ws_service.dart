// lib/websocket/ws_service.dart
// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO client — /operations namespace.
// Auto-reconnects; joins driver-specific room; forwards events to listeners.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/app_config.dart';

typedef WsEventCallback = void Function(dynamic data);

class WsService extends ChangeNotifier {
  io.Socket? _socket;
  bool _connected = false;
  String? _tenantId;
  String? _driverId;
  String? _deviceId;
  Timer? _pingTimer;

  final Map<String, List<WsEventCallback>> _listeners = {};

  bool get connected => _connected;

  /// Connect to the /operations WS namespace with driver-level auth.
  /// Joins both the tenant room and the driver-specific room.
  void connect(
    String token,
    String tenantId, {
    String? driverId,
    String? vehicleId,
    String? deviceId,
  }) {
    _tenantId = tenantId;
    _driverId = driverId;
    _deviceId = deviceId;
    _socket?.disconnect();

    _socket = io.io(
      '${AppConfig.wsBaseUrl}/operations',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setAuth({'token': token})
          .setReconnectionDelay(3000)
          .setReconnectionAttempts(999)
          .build(),
    );

    _socket!
      ..onConnect((_) {
        _connected = true;
        // Join tenant room (receives all operational events for the tenant)
        _socket!.emit('join:tenant', {'tenantId': tenantId});
        // Join driver room (receives targeted dispatcher commands)
        if (driverId != null) {
          _socket!.emit('join:driver', {
            'tenantId': tenantId,
            'driverId': driverId,
            if (vehicleId != null) 'vehicleId': vehicleId,
            if (deviceId != null) 'deviceId': deviceId,
          });
        }
        _socket!.emit('ops:state:request', {
          'tenantId': tenantId,
          if (driverId != null) 'driverId': driverId,
        });
        _pingTimer?.cancel();
        _pingTimer = Timer.periodic(const Duration(seconds: 20), (_) {
          if (_connected) {
            _socket!.emit('ops:ping', {'pingId': DateTime.now().millisecondsSinceEpoch.toString()});
          }
        });
        _dispatch('ws:connected', {'tenantId': tenantId, 'driverId': driverId});
        notifyListeners();
        debugPrint('[WsService] connected to /operations as driver:$driverId');
      })
      ..onDisconnect((_) {
        _connected = false;
        _pingTimer?.cancel();
        _dispatch('ws:disconnected', {'tenantId': tenantId, 'driverId': driverId});
        notifyListeners();
        debugPrint('[WsService] disconnected');
      })
      ..onConnectError((err) {
        debugPrint('[WsService] connect error: $err');
      });

    // ─── Register operational event listeners ─────────────────────────────
    for (final event in _operationalEvents) {
      _socket!.on(event, (data) => _dispatch(event, data));
    }

    _socket!.connect();
  }

  void disconnect() {
    _pingTimer?.cancel();
    _socket?.disconnect();
    _socket = null;
    _connected = false;
    notifyListeners();
  }

  // ─── Emit a GPS heartbeat ──────────────────────────────────────────────────
  void emitHeartbeat({
    required String vehicleId,
    required double lat,
    required double lng,
    required double speed,
    required double heading,
    required double battery,
    required String deviceId,
    String? routeId,
    String? operationalStatus,
  }) {
    if (_socket == null || !_connected) return;
    _socket!.emit('vehicle.heartbeat', {
      'vehicleId': vehicleId,
      'tenantId': _tenantId,
      if (_driverId != null) 'driverId': _driverId,
      'lat': lat,
      'lng': lng,
      'speed': speed,
      'heading': heading,
      'battery': battery,
      'deviceId': deviceId,
      if (routeId != null) 'routeId': routeId,
      if (operationalStatus != null) 'operationalStatus': operationalStatus,
      'timestamp': DateTime.now().toIso8601String(),
    });
  }

  void emitLocationUpdate({
    required String vehicleId,
    required double lat,
    required double lng,
    required double speed,
    required double heading,
    required double battery,
    required String deviceId,
    String? routeId,
  }) {
    if (_socket == null || !_connected) return;
    _socket!.emit('driver:location:update', {
      'vehicleId': vehicleId,
      'tenantId': _tenantId,
      if (_driverId != null) 'driverId': _driverId,
      'lat': lat,
      'lng': lng,
      'speed': speed,
      'heading': heading,
      'batteryLevel': battery,
      'deviceId': deviceId,
      if (routeId != null) 'routeId': routeId,
      'timestamp': DateTime.now().toIso8601String(),
    });
  }

  // ─── Emit driver heartbeat (presence signal) ───────────────────────────────
  void emitDriverHeartbeat({required double battery}) {
    if (_socket == null || !_connected || _driverId == null) return;
    _socket!.emit('driver.heartbeat', {
      'driverId': _driverId,
      'tenantId': _tenantId,
      'deviceId': _deviceId,
      'battery': battery,
      'timestamp': DateTime.now().toIso8601String(),
    });
  }

  // ─── Emit an operational status change ────────────────────────────────────
  void emitStatusChange(String vehicleId, String status) {
    if (_socket == null || !_connected) return;
    _socket!.emit('vehicle.status_changed', {
      'vehicleId': vehicleId,
      'tenantId': _tenantId,
      'operationalStatus': status,
      'timestamp': DateTime.now().toIso8601String(),
    });
  }

  // ─── Emit driver status change ─────────────────────────────────────────────
  void emitDriverStatus(String status, {String? vehicleId, String? routeId}) {
    if (_socket == null || !_connected || _driverId == null) return;
    _socket!.emit('driver.status_changed', {
      'driverId': _driverId,
      'tenantId': _tenantId,
      'status': status,
      if (vehicleId != null) 'vehicleId': vehicleId,
      if (routeId != null) 'routeId': routeId,
      'timestamp': DateTime.now().toIso8601String(),
    });
  }

  // ─── Acknowledge a route event ────────────────────────────────────────────
  /// Call after receiving route:dispatched so the central knows the driver got it.
  void emitAck(String event, {required String routeId, String? status}) {
    if (_socket == null || !_connected || _driverId == null) return;
    _socket!.emit(event, {
      'driverId': _driverId,
      'tenantId': _tenantId,
      'routeId': routeId,
      if (status != null) 'status': status,
      'timestamp': DateTime.now().toIso8601String(),
    });
  }

  // ─── Pub/sub helpers ──────────────────────────────────────────────────────
  void on(String event, WsEventCallback cb) {
    _listeners.putIfAbsent(event, () => []).add(cb);
  }

  void off(String event, WsEventCallback cb) {
    _listeners[event]?.remove(cb);
  }

  void _dispatch(String event, dynamic data) {
    for (final cb in List.of(_listeners[event] ?? [])) {
      cb(data);
    }
  }

  static const List<String> _operationalEvents = [
    'vehicle.location_updated',
    'driver:location:update',
    'vehicle.online',
    'vehicle.offline',
    'vehicle.idle',
    'vehicle.status_changed',
    'vehicle.heartbeat',
    'trip:boarding',
    'trip:started',
    'trip:in_transit',
    'trip:arrived',
    'trip.started',
    'trip.completed',
    'trip:completed',
    'patient.boarded',
    'patient.arrived',
    'patient:boarded',
    'queue.updated',
    'queue.delayed',
    'driver.heartbeat',
    'driver.status_changed',
    'driver.connected',
    'driver.offline',
    'operational.alert',
    'route:started',
    'route.status_changed',
    'route:completed',
    'route:dispatched',
    'route.dispatched',
    'route.updated',
    'route.cancelled',
    'route.started',
    'route.completed',
    'return.requested',
    'ops:state:replay',
    'ops:pong',
  ];

  @override
  void dispose() {
    _pingTimer?.cancel();
    _socket?.disconnect();
    super.dispose();
  }
}
