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
  String _operationalStatus = 'OFFLINE'; // MOVING | IDLE | BOARDING | ARRIVED

  String? get deviceId => _deviceId;
  Map<String, dynamic>? get vehicle => _vehicle;
  Map<String, dynamic>? get activeRoute => _activeRoute;
  List<Map<String, dynamic>> get patients => List.unmodifiable(_patients);
  String get operationalStatus => _operationalStatus;

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

  void setPatients(List<Map<String, dynamic>> patients) {
    _patients = patients;
    notifyListeners();
  }

  void updatePatientStatus(String patientId, String status) {
    final idx = _patients.indexWhere((p) => p['id'] == patientId);
    if (idx != -1) {
      _patients[idx] = {..._patients[idx], 'status': status};
      notifyListeners();
    }
  }

  void setOperationalStatus(String status) {
    _operationalStatus = status;
    notifyListeners();
  }
}
