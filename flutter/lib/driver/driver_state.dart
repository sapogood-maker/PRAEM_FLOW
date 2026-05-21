// lib/driver/driver_state.dart
// ─────────────────────────────────────────────────────────────────────────────
// Holds the operational session: selected vehicle, active route/trip, device.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/foundation.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:uuid/uuid.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const _deviceIdKey = 'praem_device_id';

class DriverState extends ChangeNotifier {
  final _storage = const FlutterSecureStorage();

  String? _deviceId;
  Map<String, dynamic>? _vehicle;
  Map<String, dynamic>? _activeRoute;
  List<Map<String, dynamic>> _patients = [];
  List<Map<String, dynamic>> _stops = [];
  String _operationalStatus = 'OFFLINE'; // START_ROUTE | BOARDING | IN_TRANSIT | ARRIVED | COMPLETED

  String? get deviceId => _deviceId;
  Map<String, dynamic>? get vehicle => _vehicle;
  Map<String, dynamic>? get activeRoute => _activeRoute;
  List<Map<String, dynamic>> get patients => List.unmodifiable(_patients);
  List<Map<String, dynamic>> get stops => List.unmodifiable(_stops);
  String get operationalStatus => _operationalStatus;

  /// First stop not yet COMPLETED or SKIPPED, sorted by sequence.
  Map<String, dynamic>? get currentStop {
    final pending = _stops.where((s) {
      final st = s['status'] as String?;
      return st != 'COMPLETED' && st != 'SKIPPED';
    }).toList();
    if (pending.isEmpty) return null;
    pending.sort((a, b) =>
        ((a['sequence'] as num?) ?? 0).compareTo((b['sequence'] as num?) ?? 0));
    return pending.first;
  }

  /// The stop after currentStop, also not COMPLETED/SKIPPED.
  Map<String, dynamic>? get nextStop {
    final current = currentStop;
    if (current == null) return null;
    final currentSeq = (current['sequence'] as num?) ?? 0;
    final remaining = _stops.where((s) {
      final st = s['status'] as String?;
      final seq = (s['sequence'] as num?) ?? 0;
      return st != 'COMPLETED' && st != 'SKIPPED' && seq > currentSeq;
    }).toList();
    if (remaining.isEmpty) return null;
    remaining.sort((a, b) =>
        ((a['sequence'] as num?) ?? 0).compareTo((b['sequence'] as num?) ?? 0));
    return remaining.first;
  }

  Future<void> init() async {
    _deviceId = await _storage.read(key: _deviceIdKey);
    if (_deviceId == null) {
      // Generate a stable device ID once
      String generated;
      try {
        final info = DeviceInfoPlugin();
        final android = await info.androidInfo;
        generated = android.id;
      } catch (_) {
        generated = const Uuid().v4();
      }
      _deviceId = generated;
      await _storage.write(key: _deviceIdKey, value: _deviceId);
    }
    notifyListeners();
  }

  void setVehicle(Map<String, dynamic> vehicle) {
    _vehicle = vehicle;
    notifyListeners();
  }

  void setActiveRoute(Map<String, dynamic> route) {
    _activeRoute = route;
    notifyListeners();
  }

  void clearActiveRoute() {
    _activeRoute = null;
    _stops = [];
    _patients = [];
    notifyListeners();
  }

  void setPatients(List<Map<String, dynamic>> patients) {
    _patients = patients;
    notifyListeners();
  }

  void setStops(List<Map<String, dynamic>> stops) {
    _stops = stops;
    notifyListeners();
  }

  void updateTripStatus(String tripId, String status) {
    final idx = _patients.indexWhere((p) => p['id'] == tripId);
    if (idx != -1) {
      _patients[idx] = {..._patients[idx], 'status': status};
      notifyListeners();
    }
  }

  void updatePatientStatus(String patientId, String status) {
    updateTripStatus(patientId, status);
  }

  void updateRouteStatus(String routeId, String status) {
    if (_activeRoute != null && _activeRoute?['id'] == routeId) {
      _activeRoute = {..._activeRoute!, 'status': status};
      notifyListeners();
    }
  }

  void updateStopStatus(String stopId, String status) {
    final idx = _stops.indexWhere((s) => s['id'] == stopId);
    if (idx != -1) {
      _stops[idx] = {..._stops[idx], 'status': status};
      notifyListeners();
    }
  }

  void setOperationalStatus(String status) {
    _operationalStatus = status;
    notifyListeners();
  }
}
