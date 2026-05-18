// lib/auth/auth_service.dart
// ─────────────────────────────────────────────────────────────────────────────
// Handles JWT authentication, secure token storage, and driver session.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:dio/dio.dart';
import '../config/app_config.dart';

const _tokenKey = 'praem_jwt';
const _userKey = 'praem_user';
const _tenantKey = 'praem_tenant';

class AuthService extends ChangeNotifier {
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  final Dio _dio = Dio();

  String? _token;
  String? _tenantId;
  Map<String, dynamic>? _user;

  bool get isAuthenticated => _token != null;
  String? get token => _token;
  String? get tenantId => _tenantId;
  Map<String, dynamic>? get user => _user;

  Future<void> init() async {
    _token = await _storage.read(key: _tokenKey);
    _tenantId = await _storage.read(key: _tenantKey);
    final userJson = await _storage.read(key: _userKey);
    if (userJson != null) {
      try {
        _user = Map<String, dynamic>.from(
          // Simple JSON-like key=value parse stored during login
          _parseSimpleMap(userJson),
        );
      } catch (_) {}
    }
    notifyListeners();
  }

  Future<bool> login(String email, String password) async {
    try {
      final resp = await _dio.post(
        '${AppConfig.apiBaseUrl}/auth/login',
        data: {'email': email, 'password': password},
      );
      final data = resp.data as Map<String, dynamic>;
      _token = data['access_token'] as String?;
      _tenantId = (data['user'] as Map?)?['tenantId'] as String?;
      _user = data['user'] as Map<String, dynamic>?;

      if (_token != null) {
        await _storage.write(key: _tokenKey, value: _token);
        await _storage.write(key: _tenantKey, value: _tenantId);
        await _storage.write(key: _userKey, value: _serializeSimpleMap(_user ?? {}));
      }
      notifyListeners();
      return _token != null;
    } on DioException catch (e) {
      debugPrint('[AuthService] login error: ${e.message}');
      return false;
    }
  }

  Future<void> logout() async {
    _token = null;
    _tenantId = null;
    _user = null;
    await _storage.deleteAll();
    notifyListeners();
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  String _serializeSimpleMap(Map<String, dynamic> m) =>
      m.entries.map((e) => '${e.key}=${e.value}').join(';');

  Map<String, dynamic> _parseSimpleMap(String s) {
    final map = <String, dynamic>{};
    for (final part in s.split(';')) {
      final idx = part.indexOf('=');
      if (idx != -1) {
        map[part.substring(0, idx)] = part.substring(idx + 1);
      }
    }
    return map;
  }
}
