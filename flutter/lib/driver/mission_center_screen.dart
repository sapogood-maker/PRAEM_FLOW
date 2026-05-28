import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../auth/auth_service.dart';
import '../core/constants.dart';
import '../core/l10n.dart';
import '../navigation/navigation_service.dart';
import '../operational/operation_controller.dart';
import '../shared/widgets/connection_status_bar.dart';
import '../shared/widgets/operational_button.dart';
import '../shared/widgets/status_badge.dart';
import '../driver/driver_state.dart';

class MissionCenterScreen extends StatefulWidget {
  const MissionCenterScreen({super.key});

  @override
  State<MissionCenterScreen> createState() => _MissionCenterScreenState();
}

class _MissionCenterScreenState extends State<MissionCenterScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<OperationController>().loadRoute();
    });
  }

  Future<void> _openScanner(BuildContext context, OperationController ctrl) async {
    if (!mounted) return;
    Navigator.pushNamed(context, AppRoutes.qrScanner);
  }

  Future<void> _startMission(OperationController ctrl) async {
    await ctrl.startMission();
  }

  Future<void> _finalizeMission(OperationController ctrl) async {
    await ctrl.finalizeMission();
  }

  void _navigate(OperationController ctrl) {
    final dest = ctrl.currentOpsNavDestination;
    if (dest == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sem destino de navegação disponível.')),
      );
      return;
    }
    NavigationService.showNavigationPicker(context, dest);
  }

  String _routeTitle(Map<String, dynamic>? route) {
    if (route == null) return 'MINHA OPERAÇÃO';
    final number = route['code'] ?? route['number'] ?? route['reference'];
    if (number != null && number.toString().trim().isNotEmpty) {
      return 'ROTA ${number.toString()}';
    }
    return 'MINHA OPERAÇÃO';
  }

  String _routeSubtitle(Map<String, dynamic>? route) {
    if (route == null) return 'Aguardando missão';
    final destination = route['destination'] as String? ?? 'Destino operacional';
    return destination;
  }

  String _patientStatusLabel(String status) {
    switch (status.toUpperCase()) {
      case 'BOARDING':
        return 'EMBARCANDO';
      case 'BOARDED':
        return 'EMBARCADO';
      case 'IN_TRANSIT':
        return context.l10n.statusInTransit;
      case 'ARRIVED':
        return context.l10n.statusArrived;
      case 'COMPLETED':
        return context.l10n.statusCompleted;
      case 'NO_SHOW':
        return context.l10n.statusNoShow;
      case 'CANCELLED':
        return context.l10n.statusCancelled;
      case 'CONFIRMED':
        return 'CONFIRMADO';
      case 'PENDING':
      default:
        return context.l10n.statusWaiting;
    }
  }

  Color _patientStatusColor(String status) {
    switch (status.toUpperCase()) {
      case 'BOARDING':
        return AppColors.boarding;
      case 'BOARDED':
      case 'IN_TRANSIT':
        return AppColors.primary;
      case 'ARRIVED':
        return AppColors.info;
      case 'COMPLETED':
        return AppColors.completed;
      case 'NO_SHOW':
      case 'CANCELLED':
        return AppColors.danger;
      case 'CONFIRMED':
        return AppColors.warning;
      default:
        return AppColors.textSecondary;
    }
  }

  IconData _patientIcon(String status) {
    switch (status.toUpperCase()) {
      case 'BOARDED':
      case 'IN_TRANSIT':
        return Icons.check_circle;
      case 'ARRIVED':
        return Icons.flag_circle;
      case 'NO_SHOW':
      case 'CANCELLED':
        return Icons.remove_circle;
      case 'BOARDING':
        return Icons.directions_walk;
      case 'CONFIRMED':
        return Icons.verified;
      default:
        return Icons.radio_button_unchecked;
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final driver = context.watch<DriverState>();
    final ctrl = context.watch<OperationController>();

    final route = ctrl.activeRoute;
    final patients = ctrl.patients;
    final boardedCount = ctrl.boardedCount;
    final pendingCount = ctrl.pendingBoardingCount;
    final vehicleName = driver.vehicle?['plate'] as String? ??
        auth.vehicle?['plate'] as String? ??
        '—';
    final driverName = auth.driver?['name'] as String? ?? '—';
    final routeLabel = _routeTitle(route);
    final routeSubtitle = _routeSubtitle(route);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: const Text(
          'MINHA OPERAÇÃO',
          style: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: AppColors.textSecondary),
            onPressed: ctrl.loading ? null : ctrl.loadRoute,
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: ctrl.loadRoute,
        child: ListView(
          padding: const EdgeInsets.all(16),
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            const ConnectionStatusBar(),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    routeLabel,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    routeSubtitle,
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      const Icon(Icons.person, size: 16, color: AppColors.textSecondary),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          '$driverName · $vehicleName',
                          style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      StatusBadge(label: '${patients.length} PACIENTES', color: AppColors.warning),
                      const SizedBox(width: 8),
                      StatusBadge(label: '$boardedCount EMBARCADOS', color: AppColors.primary),
                      const SizedBox(width: 8),
                      StatusBadge(label: '$pendingCount PENDENTES', color: AppColors.textSecondary),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 2.9,
              children: [
                OperationalButton(
                  label: 'Iniciar Operação',
                  icon: Icons.play_arrow,
                  color: AppColors.primary,
                  onPressed: ctrl.hasActiveRoute && !ctrl.loading ? () => _startMission(ctrl) : null,
                ),
                OperationalButton(
                  label: 'Navegar',
                  icon: Icons.navigation,
                  color: AppColors.info,
                  onPressed: ctrl.hasActiveRoute ? () => _navigate(ctrl) : null,
                ),
                OperationalButton(
                  label: 'Ler QR',
                  icon: Icons.qr_code_scanner,
                  color: AppColors.boarding,
                  onPressed: ctrl.hasActiveRoute ? () => _openScanner(context, ctrl) : null,
                ),
                OperationalButton(
                  label: 'Finalizar Operação',
                  icon: Icons.flag,
                  color: AppColors.warning,
                  onPressed: ctrl.hasActiveRoute ? () => _finalizeMission(ctrl) : null,
                ),
              ],
            ),
            const SizedBox(height: 20),
            Text(
              'Pacientes',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.8,
                  ),
            ),
            const SizedBox(height: 10),
            if (!ctrl.hasActiveRoute)
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.border),
                ),
                child: const Text(
                  'Aguardando missão operacional.',
                  style: TextStyle(color: AppColors.textSecondary),
                ),
              )
            else if (patients.isEmpty)
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.border),
                ),
                child: const Text(
                  'Nenhum paciente atribuído.',
                  style: TextStyle(color: AppColors.textSecondary),
                ),
              )
            else
              ...patients.map((trip) {
                final patient = (trip['patient'] as Map?) ?? trip;
                final status = (trip['status'] as String? ?? 'PENDING').toUpperCase();
                final name = (patient['name'] as String?) ?? (trip['id'] as String? ?? 'Paciente');
                final tripId = trip['id'] as String;
                final canAct = !['COMPLETED', 'CANCELLED', 'NO_SHOW'].contains(status);
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(
                      color: status == 'BOARDING' ? AppColors.boarding : AppColors.border,
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            radius: 16,
                            backgroundColor: _patientStatusColor(status).withOpacity(0.18),
                            child: Icon(_patientIcon(status), size: 16, color: _patientStatusColor(status)),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  name,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  _patientStatusLabel(status),
                                  style: TextStyle(
                                    color: _patientStatusColor(status),
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          if (status == 'BOARDING' || status == 'CONFIRMED')
                            const Text('●', style: TextStyle(color: AppColors.primary, fontSize: 12)),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          OutlinedButton.icon(
                            onPressed: canAct ? () => _openScanner(context, ctrl) : null,
                            icon: const Icon(Icons.qr_code_scanner, size: 16),
                            label: const Text('QR'),
                          ),
                          OutlinedButton.icon(
                            onPressed: canAct ? () => ctrl.confirmPassengerBoarded(tripId) : null,
                            icon: const Icon(Icons.how_to_reg, size: 16),
                            label: const Text('Confirmar'),
                          ),
                          OutlinedButton.icon(
                            onPressed: canAct ? () => ctrl.markPassengerNoShow(tripId) : null,
                            icon: const Icon(Icons.person_off, size: 16),
                            label: const Text('Ausente'),
                          ),
                          OutlinedButton.icon(
                            onPressed: canAct ? () => ctrl.reportPassengerIssue(tripId) : null,
                            icon: const Icon(Icons.report_problem, size: 16),
                            label: const Text('Problema'),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              }),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
