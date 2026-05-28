// lib/trips/home_screen.dart
// Main operational screen — slim shell driven by OperationController.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../auth/auth_service.dart';
import '../driver/driver_state.dart';
import '../operational/operation_controller.dart';
import '../core/constants.dart';
import '../core/l10n.dart';
import '../shared/widgets/connection_status_bar.dart';
import '../shared/widgets/destination_info_card.dart';
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
            label: context.l10n.openScannerAction,
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
            Text(
              context.l10n.appTitle,
              style: const TextStyle(
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
            tooltip: context.l10n.tripDetailsTooltip,
            onPressed: ctrl.hasActiveRoute
                ? () => Navigator.pushNamed(context, AppRoutes.trip)
                : null,
          ),
          IconButton(
            icon: const Icon(Icons.refresh, color: AppColors.textSecondary),
            tooltip: context.l10n.reloadRouteTooltip,
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
              PopupMenuItem(
                value: 'logout',
                child: Text(context.l10n.logout,
                    style: const TextStyle(color: AppColors.textPrimary)),
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
                      children: [
                        const ConnectionStatusBar(),
                        if (ctrl.hasActiveRoute)
                          _MissionCard(ctrl: ctrl)
                        else
                          _NoMissionCard(loading: ctrl.loading),
                        const OperationalStateHeader(),
                        const NextActionPanel(),
                        const DestinationInfoCard(),
                        const PassengerManifest(),
                        const SizedBox(height: 80),
                      ],
                    ),
                  ),
                ],
              ),
            ),
      floatingActionButton: ctrl.hasActiveRoute
          ? FloatingActionButton.extended(
              backgroundColor:
                  ctrl.isQrScanningValid ? AppColors.info : AppColors.surface,
              foregroundColor: ctrl.isQrScanningValid
                  ? AppColors.textPrimary
                  : AppColors.textSecondary,
              onPressed: () => _openQrScanner(context, ctrl),
              icon: const Icon(Icons.qr_code_scanner),
              label: Text(context.l10n.scanQrFab),
            )
          : null,
    );
  }
}

/// Prominent mission card shown when a route is assigned.
class _MissionCard extends StatelessWidget {
  const _MissionCard({required this.ctrl});
  final OperationController ctrl;

  @override
  Widget build(BuildContext context) {
    final route = ctrl.activeRoute!;
    final destination = route['destination'] as String? ?? '—';
    final origin = route['origin'] as String? ?? '—';
    final status = (route['status'] as String? ?? '').toUpperCase();
    final patientCount = ctrl.patients.length;
    final boardedCount = ctrl.boardedCount;

    final statusColor = _statusColor(status);
    final isCreated = status == 'DISPATCHED' || status == 'PENDING' || status == 'CREATED';

    return Container(
      margin: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            const Color(0xFF0E7490).withOpacity(0.9),
            const Color(0xFF164E63),
          ],
        ),
        border: Border.all(color: const Color(0xFF22D3EE).withOpacity(0.3)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.3),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.local_shipping, color: Color(0xFF22D3EE), size: 18),
                const SizedBox(width: 8),
                const Text(
                  'MISSÃO ATIVA',
                  style: TextStyle(
                    color: Color(0xFF22D3EE),
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1.2,
                  ),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: statusColor.withOpacity(0.5)),
                  ),
                  child: Text(
                    status,
                    style: TextStyle(color: statusColor, fontSize: 10, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.trip_origin, color: Color(0xFF94A3B8), size: 14),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    origin,
                    style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 13),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                const Icon(Icons.location_on, color: Color(0xFF22D3EE), size: 14),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    destination,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _StatChip(
                  icon: Icons.people,
                  label: '$patientCount paciente${patientCount != 1 ? 's' : ''}',
                ),
                const SizedBox(width: 8),
                _StatChip(
                  icon: Icons.how_to_reg,
                  label: '$boardedCount embarcado${boardedCount != 1 ? 's' : ''}',
                  highlight: boardedCount > 0,
                ),
              ],
            ),
            if (isCreated) ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0891B2),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  onPressed: ctrl.loading ? null : ctrl.startMission,
                  icon: ctrl.loading
                      ? const SizedBox(
                          width: 16, height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.play_arrow),
                  label: const Text(
                    'Iniciar Operação',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                  ),
                ),
              ),
            ] else ...[
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF22D3EE),
                    side: const BorderSide(color: Color(0xFF22D3EE), width: 1),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                  onPressed: () => Navigator.pushNamed(context, AppRoutes.trip),
                  icon: const Icon(Icons.list_alt, size: 16),
                  label: const Text('Ver detalhes da missão'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'DISPATCHED':
      case 'PREPARING':
        return const Color(0xFFFBBF24);
      case 'ACTIVE':
      case 'IN_TRANSIT':
        return const Color(0xFF34D399);
      case 'COMPLETED':
        return const Color(0xFF6EE7B7);
      case 'CANCELLED':
        return const Color(0xFFF87171);
      default:
        return const Color(0xFF94A3B8);
    }
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({required this.icon, required this.label, this.highlight = false});
  final IconData icon;
  final String label;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: highlight
            ? const Color(0xFF065F46).withOpacity(0.4)
            : Colors.white.withOpacity(0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: highlight
              ? const Color(0xFF34D399).withOpacity(0.5)
              : Colors.white.withOpacity(0.1),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: highlight ? const Color(0xFF34D399) : const Color(0xFF94A3B8)),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              color: highlight ? const Color(0xFF6EE7B7) : const Color(0xFFCBD5E1),
            ),
          ),
        ],
      ),
    );
  }
}

/// Placeholder shown when there's no active mission.
class _NoMissionCard extends StatelessWidget {
  const _NoMissionCard({required this.loading});
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: const Color(0xFF1E293B),
        border: Border.all(color: const Color(0xFF334155)),
      ),
      child: Column(
        children: [
          Icon(
            loading ? Icons.hourglass_empty : Icons.inbox_outlined,
            size: 40,
            color: const Color(0xFF475569),
          ),
          const SizedBox(height: 8),
          Text(
            loading ? 'Carregando missão...' : 'Nenhuma missão atribuída',
            style: const TextStyle(color: Color(0xFF64748B), fontSize: 14),
          ),
          if (!loading) ...[
            const SizedBox(height: 4),
            const Text(
              'Aguardando despacho da central operacional',
              style: TextStyle(color: Color(0xFF475569), fontSize: 12),
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }
}
