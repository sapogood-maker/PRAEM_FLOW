// lib/main.dart
// ─────────────────────────────────────────────────────────────────────────────
// PRAEM Driver App — entry point.
// Sets up providers, initialises Hive offline queue, and starts the app.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:provider/provider.dart';

import 'auth/auth_service.dart';
import 'driver/driver_state.dart';
import 'websocket/ws_service.dart';
import 'tracking/gps_tracking_service.dart';
import 'offline/offline_queue.dart';
import 'operational/local_store.dart';
import 'operational/sync_manager.dart';
import 'operational/operation_controller.dart';
import 'core/constants.dart';
import 'core/app_router.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // ─── Force landscape / portrait for tablets ────────────────────────────────
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);

  // ─── Load .env ─────────────────────────────────────────────────────────────
  await dotenv.load();

  // ─── Hive offline queue ────────────────────────────────────────────────────
  await Hive.initFlutter();
  final offlineQueue = OfflineQueue();
  await offlineQueue.init();

  // ─── Local operational store ───────────────────────────────────────────────
  final localStore = LocalStore();
  await localStore.init();

  // ─── Services ──────────────────────────────────────────────────────────────
  final authService = AuthService();
  await authService.init();

  final driverState = DriverState();
  await driverState.init();

  final wsService = WsService();
  final gpsService = GpsTrackingService(wsService, offlineQueue);
  final syncManager = SyncManager(offlineQueue, authService);

  final operationController = OperationController(
    auth: authService,
    driverState: driverState,
    ws: wsService,
    gps: gpsService,
    offlineQueue: offlineQueue,
    localStore: localStore,
    syncManager: syncManager,
  );
  await operationController.init();

  // ─── Auto-connect WebSocket when auth state changes ────────────────────────
  authService.addListener(() {
    if (authService.isAuthenticated &&
        authService.token != null &&
        authService.tenantId != null) {
      wsService.connect(
        authService.token!,
        authService.tenantId!,
        driverId: authService.driverId,
        deviceId: driverState.deviceId,
      );
      final vehicleId = authService.vehicle?['id'] as String?;
      if (vehicleId != null && driverState.deviceId != null) {
        unawaited(gpsService.start(
          vehicleId: vehicleId,
          tenantId: authService.tenantId!,
          deviceId: driverState.deviceId!,
          authToken: authService.token!,
        ));
      }
    } else {
      gpsService.stop();
      wsService.disconnect();
    }
  });

  // If already authenticated on startup, connect immediately
  if (authService.isAuthenticated &&
      authService.token != null &&
      authService.tenantId != null) {
    wsService.connect(
      authService.token!,
      authService.tenantId!,
      driverId: authService.driverId,
      deviceId: driverState.deviceId,
    );
  }

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: authService),
        ChangeNotifierProvider.value(value: driverState),
        ChangeNotifierProvider.value(value: wsService),
        ChangeNotifierProvider.value(value: gpsService),
        ChangeNotifierProvider.value(value: syncManager),
        ChangeNotifierProvider.value(value: operationController),
        Provider.value(value: offlineQueue),
        Provider.value(value: localStore),
      ],
      child: const PraemDriverApp(),
    ),
  );
}

class PraemDriverApp extends StatelessWidget {
  const PraemDriverApp({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();

    return MaterialApp(
      title: 'PRAEM OPS',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: AppColors.background,
        colorScheme: const ColorScheme.dark(
          primary: AppColors.primary,
          surface: AppColors.surface,
          error: AppColors.danger,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.surface,
          elevation: 0,
        ),
        textTheme: const TextTheme(
          bodyMedium: TextStyle(color: AppColors.textPrimary),
        ),
      ),
      onGenerateRoute: generateRoute,
      initialRoute: auth.isAuthenticated ? AppRoutes.home : AppRoutes.login,
    );
  }
}
