// lib/trips/home_screen.dart
// Main operational screen — slim shell driven by OperationController.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../auth/auth_service.dart';
import '../driver/driver_state.dart';
import '../operational/operation_controller.dart';
import '../core/constants.dart';
import '../shared/widgets/connection_status_bar.dart';
import '../shared/widgets/operational_state_header.dart';
import '../shared/widgets/next_action_panel.dart';
import '../shared/widgets/passenger_manifest.dart';
import '../shared/widgets/stale_recovery_panel.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<OperationController>().loadRoute();
    });
  }

  void _openQrScanner(BuildContext context, OperationController ctrl) {
    final warning = ctrl.qrScanningWarning;
    if (warning != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(warning),
          backgroundColor: AppColors.warning,
          duration: const Duration(seconds: 4),
          action: SnackBarAction(
            label: 'ABRIR SCANNER',
            textColor: AppColors.textPrimary,
            onPressed: () => Navigator.pushNamed(context, AppRoutes.qrScanner),
          ),
        ),
      );
    } else {
      Navigator.pushNamed(context, AppRoutes.qrScanner);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final driver = context.watch<DriverState>();
    final ctrl = context.watch<OperationController>();

    final vehicleName = driver.vehicle?['plate'] as String? ??
        driver.vehicle?['name'] as String? ??
        auth.vehicle?['plate'] as String? ??
        '—';
    final driverName = auth.driver?['name'] as String? ?? '—';

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'PRAEM OPS',
              style: TextStyle(
                color: AppColors.textPrimary,
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
            Text(
              '$driverName · $vehicleName',
              style: const TextStyle(
                color: AppColors.textSecondary,
                fontSize: 11,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.list_alt, color: AppColors.textSecondary),
            tooltip: 'Detalhes da viagem',
            onPressed: ctrl.hasActiveRoute
                ? () => Navigator.pushNamed(context, AppRoutes.trip)
                : null,
          ),
          IconButton(
            icon: const Icon(Icons.refresh, color: AppColors.textSecondary),
            tooltip: 'Recarregar rota',
            onPressed: ctrl.loading ? null : ctrl.loadRoute,
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert, color: AppColors.textSecondary),
            color: AppColors.surface,
            onSelected: (v) async {
              if (v == 'logout') {
                final auth = context.read<AuthService>();
                await auth.logout();
                if (!mounted) return;
                Navigator.pushReplacementNamed(context, AppRoutes.login);
              }
            },
            itemBuilder: (_) => [
              const PopupMenuItem(
                value: 'logout',
                child: Text('Sair',
                    style: TextStyle(color: AppColors.textPrimary)),
              ),
            ],
          ),
        ],
      ),
      body: ctrl.requiresStaleRecoveryScreen
          ? const StaleRecoveryPanel()
          : RefreshIndicator(
              color: AppColors.primary,
              onRefresh: ctrl.loadRoute,
              child: CustomScrollView(
                slivers: [
                  SliverToBoxAdapter(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: const [
                        ConnectionStatusBar(),
                        OperationalStateHeader(),
                        NextActionPanel(),
                        PassengerManifest(),
                        SizedBox(height: 80),
                      ],
                    ),
                  ),
                ],
              ),
            ),
      floatingActionButton: ctrl.hasActiveRoute
          ? FloatingActionButton.extended(
              backgroundColor: ctrl.isQrScanningValid ? AppColors.info : AppColors.surface,
              foregroundColor: ctrl.isQrScanningValid
                  ? AppColors.textPrimary
                  : AppColors.textSecondary,
              onPressed: () => _openQrScanner(context, ctrl),
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('SCAN QR'),
            )
          : null,
    );
  }
}
