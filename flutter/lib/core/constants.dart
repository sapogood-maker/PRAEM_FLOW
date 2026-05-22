// lib/core/constants.dart
// ─────────────────────────────────────────────────────────────────────────────
// App-wide constants — colours, text styles, route names.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';

// ─── Route names ──────────────────────────────────────────────────────────────
class AppRoutes {
  AppRoutes._();
  static const String login = '/';
  static const String home = '/home';
  static const String trip = '/trip';
  static const String qrScanner = '/qr';
  static const String vehicleSelect = '/vehicles';
  static const String settings = '/settings';
}

// ─── Operational colour palette ───────────────────────────────────────────────
// High-contrast, easy to read inside a moving vehicle / bright sunlight.
class AppColors {
  AppColors._();

  static const Color background = Color(0xFF0D1117);
  static const Color surface = Color(0xFF161B22);
  static const Color primary = Color(0xFF2DA44E);       // green — OK / MOVING
  static const Color warning = Color(0xFFD29922);       // amber — IDLE / WARNING
  static const Color danger = Color(0xFFDA3633);        // red — OFFLINE / CRITICAL
  static const Color info = Color(0xFF388BFD);          // blue — IN TRANSIT
  static const Color textPrimary = Color(0xFFF0F6FC);
  static const Color textSecondary = Color(0xFF8B949E);
  static const Color border = Color(0xFF30363D);
  static const Color boarding = Color(0xFF58A6FF);      // boarding / waiting
  static const Color completed = Color(0xFF8B949E);     // gray — completed
}

// ─── Status colours by VehicleOperationalStatus ──────────────────────────────
Color statusColor(String status) {
  switch (status.toUpperCase()) {
    case 'CREATED':
    case 'SCHEDULED':
    case 'PLANNED':
    case 'PENDING':
    case 'DISPATCHED':
      return AppColors.textSecondary;
    case 'DRIVER_ACCEPTED':
    case 'WAITING_PATIENT':
    case 'CONFIRMED':
      return AppColors.warning;
    case 'MOVING':
      return AppColors.primary;
    case 'IDLE':
      return AppColors.warning;
    case 'BOARDING':
      return AppColors.boarding;
    case 'IN_PROGRESS':
    case 'IN_TRANSIT':
      return AppColors.primary;
    case 'ARRIVED':
      return AppColors.info;
    case 'COMPLETED':
      return AppColors.completed;
    case 'NO_SHOW':
    case 'CANCELLED':
    case 'OFFLINE':
    case 'MAINTENANCE':
      return AppColors.danger;
    default:
      return AppColors.textSecondary;
  }
}
