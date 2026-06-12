// lib/operational/local_store.dart
import 'dart:convert';
import 'package:hive_flutter/hive_flutter.dart';
import 'operation_state.dart';

class LocalStore {
  static const _boxName = 'ops_local_store';

  Future<void> init() async {
    await Hive.openBox(_boxName);
  }

  Box get _box => Hive.box(_boxName);

  Future<void> saveOperationalState(OperationalState state) async {
    await _box.put('state', operationalStateToString(state));
  }

  OperationalState loadOperationalState() {
    final raw = _box.get('state') as String?;
    return operationalStateFromString(raw);
  }

  Future<void> saveRoute(Map<String, dynamic>? route) async {
    await _box.put('route', route != null ? jsonEncode(route) : null);
  }

  Map<String, dynamic>? loadRoute() {
    final raw = _box.get('route') as String?;
    if (raw == null) return null;
    try {
      return Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {
      return null;
    }
  }

  Future<void> savePatients(List<Map<String, dynamic>> patients) async {
    await _box.put('patients', jsonEncode(patients));
  }

  List<Map<String, dynamic>> loadPatients() {
    final raw = _box.get('patients') as String?;
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw) as List;
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> saveStops(List<Map<String, dynamic>> stops) async {
    await _box.put('stops', jsonEncode(stops));
  }

  List<Map<String, dynamic>> loadStops() {
    final raw = _box.get('stops') as String?;
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw) as List;
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> clear() async {
    await _box.clear();
  }
}
