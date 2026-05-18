// lib/config/app_config.dart
// ─────────────────────────────────────────────────────────────────────────────
// Reads .env values at runtime. All configuration is centralised here.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter_dotenv/flutter_dotenv.dart';

class AppConfig {
  AppConfig._();

  static String get apiBaseUrl =>
      dotenv.env['API_BASE_URL'] ?? 'https://api.praem.com.br/api';

  static String get wsBaseUrl =>
      dotenv.env['WS_BASE_URL'] ?? 'https://api.praem.com.br';

  static bool get isDevelopment =>
      (dotenv.env['APP_ENV'] ?? 'development') == 'development';

  // GPS heartbeat interval in seconds (between 5 and 15)
  static const int gpsIntervalSeconds = 10;

  // How long without heartbeat before a vehicle is considered OFFLINE (seconds)
  static const int offlineThresholdSeconds = 60;

  // Offline queue — max pending items before dropping oldest
  static const int offlineQueueMaxSize = 500;
}
