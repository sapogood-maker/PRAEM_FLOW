// lib/core/app_router.dart
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import '../auth/screens/login_screen.dart';
import '../trips/home_screen.dart';
import '../trips/trip_screen.dart';
import '../qr/qr_scanner_screen.dart';
import '../vehicles/vehicle_select_screen.dart';
import 'constants.dart';

Route<dynamic> generateRoute(RouteSettings settings) {
  switch (settings.name) {
    case AppRoutes.login:
      return MaterialPageRoute(builder: (_) => const LoginScreen());
    case AppRoutes.home:
      return MaterialPageRoute(builder: (_) => const HomeScreen());
    case AppRoutes.trip:
      return MaterialPageRoute(builder: (_) => const TripScreen());
    case AppRoutes.qrScanner:
      return MaterialPageRoute(builder: (_) => const QrScannerScreen());
    case AppRoutes.vehicleSelect:
      return MaterialPageRoute(builder: (_) => const VehicleSelectScreen());
    default:
      return MaterialPageRoute(
        builder: (_) => const Scaffold(
          body: Center(child: Text('Rota não encontrada')),
        ),
      );
  }
}
