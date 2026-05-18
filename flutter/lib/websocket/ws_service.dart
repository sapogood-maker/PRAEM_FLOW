// lib/websocket/ws_service.dart
// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO client — /operations namespace.
// Auto-reconnects; forwards events to listeners.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/app_config.dart';

typedef WsEventCallback = void Function(dynamic data);

class WsService extends ChangeNotifier {
  io.Socket? _socket;
  bool _connected = false;
  String? _tenantId;

  final Map<String, List<WsEventCallback>> _listeners = {};

  bool get connected => _connected;

  void connect(String token, String tenantId) {
    _tenantId = tenantId;
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
        _socket!.emit('join:tenant', {'tenantId': tenantId});
        notifyListeners();
        debugPrint('[WsService] connected to /operations');
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
      'lat': lat,
      'lng': lng,
      'speed': speed,
      'heading': heading,
      'battery': battery,
      'deviceId': deviceId,
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
    'operational.alert',
  ];

  @override
  void dispose() {
    _socket?.disconnect();
    super.dispose();
  }
}
