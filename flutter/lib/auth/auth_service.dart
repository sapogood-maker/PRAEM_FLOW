// lib/auth/auth_service.dart
// ─────────────────────────────────────────────────────────────────────────────
// Handles JWT authentication for driver/tablet sessions.
// Uses POST /auth/driver/login — NEVER the admin /auth/login endpoint.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:dio/dio.dart';
import '../config/app_config.dart';

const _accessTokenKey = 'praem_access_token';
const _refreshTokenKey = 'praem_refresh_token';
const _driverKey = 'praem_driver';
const _vehicleKey = 'praem_vehicle';
const _deviceKey = 'praem_device_info';

class AuthService extends ChangeNotifier {
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  final Dio _dio = Dio();

  String? _accessToken;
  String? _refreshToken;
  Map<String, dynamic>? _driver;
  Map<String, dynamic>? _vehicle;
  Map<String, dynamic>? _deviceInfo;

  bool get isAuthenticated => _accessToken != null;
  String? get token => _accessToken;
  String? get tenantId => _driver?['tenantId'] as String?;
  String? get driverId => _driver?['id'] as String?;
  Map<String, dynamic>? get driver => _driver;
  Map<String, dynamic>? get vehicle => _vehicle;
  Map<String, dynamic>? get deviceInfo => _deviceInfo;

  Future<void> init() async {
    _accessToken = await _storage.read(key: _accessTokenKey);
    _refreshToken = await _storage.read(key: _refreshTokenKey);
    _driver = _readJson(await _storage.read(key: _driverKey));
    _vehicle = _readJson(await _storage.read(key: _vehicleKey));
    _deviceInfo = _readJson(await _storage.read(key: _deviceKey));

    // Try silent token refresh if we have a refresh token but no access token
    if (_accessToken == null && _refreshToken != null) {
      await _silentRefresh();
    }
    notifyListeners();
  }

  /// Driver login — calls POST /auth/driver/login with deviceId so the
  /// backend auto-registers the tablet and returns driver + vehicle context.
  Future<bool> login(
    String email,
    String password, {
    String? deviceId,
    String platform = 'android',
    String appVersion = '1.0.0',
  }) async {
    try {
      final resp = await _dio.post(
        '${AppConfig.apiBaseUrl}/auth/driver/login',
        data: {
          'email': email,
          'password': password,
          if (deviceId != null) 'deviceId': deviceId,
          'platform': platform,
          'appVersion': appVersion,
        },
      );
      final data = resp.data as Map<String, dynamic>;
      _accessToken = data['access_token'] as String?;
      _refreshToken = data['refresh_token'] as String?;
      _driver = data['driver'] as Map<String, dynamic>?;
      _vehicle = data['vehicle'] as Map<String, dynamic>?;
      _deviceInfo = data['device'] as Map<String, dynamic>?;

      if (_accessToken != null) {
        await _storage.write(key: _accessTokenKey, value: _accessToken);
        if (_refreshToken != null) await _storage.write(key: _refreshTokenKey, value: _refreshToken);
        if (_driver != null) await _storage.write(key: _driverKey, value: jsonEncode(_driver));
        if (_vehicle != null) await _storage.write(key: _vehicleKey, value: jsonEncode(_vehicle));
        if (_deviceInfo != null) await _storage.write(key: _deviceKey, value: jsonEncode(_deviceInfo));
      }
      notifyListeners();
      return _accessToken != null;
    } on DioException catch (e) {
      debugPrint('[AuthService] driver login error: ${e.response?.data ?? e.message}');
      return false;
    }
  }

  /// Silently refresh the access token using the stored refresh token.
  Future<bool> refreshToken() async => _silentRefresh();

  Future<bool> _silentRefresh() async {
    if (_refreshToken == null) return false;
    try {
      final resp = await _dio.post(
        '${AppConfig.apiBaseUrl}/auth/driver/refresh',
        data: {'refresh_token': _refreshToken},
      );
      final data = resp.data as Map<String, dynamic>;
      _accessToken = data['access_token'] as String?;
      if (_accessToken != null) {
        await _storage.write(key: _accessTokenKey, value: _accessToken);
        final newRefresh = data['refresh_token'] as String?;
        if (newRefresh != null) {
          _refreshToken = newRefresh;
          await _storage.write(key: _refreshTokenKey, value: _refreshToken);
        }
        notifyListeners();
        return true;
      }
    } on DioException catch (e) {
      debugPrint('[AuthService] token refresh failed: ${e.message}');
    }
    return false;
  }

  Future<void> logout() async {
    _accessToken = null;
    _refreshToken = null;
    _driver = null;
    _vehicle = null;
    _deviceInfo = null;
    await _storage.deleteAll();
    notifyListeners();
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  Map<String, dynamic>? _readJson(String? raw) {
    if (raw == null) return null;
    try {
      return Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {
      return null;
    }
  }
}
