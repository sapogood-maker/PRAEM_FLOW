// lib/websocket/ws_service.dart
// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO client — /operations namespace.
// Auto-reconnects; joins driver-specific room; forwards events to listeners.
// ─────────────────────────────────────────────────────────────────────────────

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

  final Map<String, List<WsEventCallback>> _listeners = {};

  bool get connected => _connected;

  /// Connect to the /operations WS namespace with driver-level auth.
  /// Joins both the tenant room and the driver-specific room.
  void connect(
    String token,
    String tenantId, {
    String? driverId,
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
            if (deviceId != null) 'deviceId': deviceId,
          });
        }
        notifyListeners();
        debugPrint('[WsService] connected to /operations as driver:$driverId');
      })
      ..onDisconnect((_) {
        _connected = false;
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
    'vehicle.online',
    'vehicle.offline',
    'vehicle.idle',
    'vehicle.status_changed',
    'trip.started',
    'trip.completed',
    'patient.boarded',
    'patient.arrived',
    'queue.updated',
    'queue.delayed',
    'driver.heartbeat',
    'driver.status_changed',
    'operational.alert',
  ];

  @override
  void dispose() {
    _socket?.disconnect();
    super.dispose();
  }
}
