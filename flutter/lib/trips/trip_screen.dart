// lib/trips/trip_screen.dart
// ─────────────────────────────────────────────────────────────────────────────
// Detailed trip view — multi-stop manifest, navigation, QR scan shortcut.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:dio/dio.dart';
import '../auth/auth_service.dart';
import '../config/app_config.dart';
import '../driver/driver_state.dart';
import '../core/constants.dart';
import '../navigation/navigation_service.dart';
import '../shared/widgets/operational_button.dart';
import '../shared/widgets/status_badge.dart';

// ─── Stop type / status helpers ───────────────────────────────────────────────

String _stopTypeIcon(String type) {
  switch (type) {
    case 'PICKUP':
      return '📍';
    case 'HOSPITAL':
      return '🏥';
    case 'CLINIC':
      return '🏨';
    case 'EXAM':
      return '🔬';
    case 'PHARMACY':
      return '💊';
    case 'RETURN':
      return '↩️';
    case 'DROPOFF':
      return '🏠';
    default:
      return '📌';
  }
}

String _stopStatusLabel(String status) {
  switch (status) {
    case 'PENDING':
      return 'Pendente';
    case 'EN_ROUTE':
      return 'Em rota';
    case 'ARRIVED':
      return 'Chegou';
    case 'BOARDING':
      return 'Embarcando';
    case 'COMPLETED':
      return 'Concluída';
    case 'SKIPPED':
      return 'Pulada';
    default:
      return status;
  }
}

Color _stopStatusColor(String status) {
  switch (status) {
    case 'PENDING':
      return AppColors.textSecondary;
    case 'EN_ROUTE':
      return AppColors.primary;
    case 'ARRIVED':
      return AppColors.info;
    case 'BOARDING':
      return AppColors.warning;
    case 'COMPLETED':
      return AppColors.primary;
    case 'SKIPPED':
      return AppColors.danger;
    default:
      return AppColors.textSecondary;
  }
}

// ─── TripScreen ───────────────────────────────────────────────────────────────

class TripScreen extends StatefulWidget {
  const TripScreen({super.key});

  @override
  State<TripScreen> createState() => _TripScreenState();
}

class _TripScreenState extends State<TripScreen> {
  final _dio = Dio();

  Future<void> _updateStopStatus(String stopId, String status) async {
    final auth = context.read<AuthService>();
    final driver = context.read<DriverState>();
    try {
      await _dio.patch(
        '${AppConfig.apiBaseUrl}/trip-stops/$stopId/status',
        data: {'status': status},
        options: Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
      );
      driver.updateStopStatus(stopId, status);
    } catch (e) {
      debugPrint('[TripScreen] updateStopStatus error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Erro ao atualizar parada')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final route = driver.activeRoute;
    final patients = driver.patients;
    // Use dedicated stops list from DriverState; fall back to stops embedded in route
    final stops = driver.stops.isNotEmpty
        ? driver.stops
        : (driver.activeRoute?['stops'] as List?)
                ?.cast<Map<String, dynamic>>() ??
            [];

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: const Text('Detalhes da Viagem',
            style: TextStyle(color: AppColors.textPrimary)),
        iconTheme: const IconThemeData(color: AppColors.textPrimary),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ─── Route summary ─────────────────────────────────────────────
            if (route != null)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('ORIGEM',
                        style: TextStyle(
                            color: AppColors.textSecondary,
                            fontSize: 11,
                            letterSpacing: 1)),
                    Text(route['origin'] as String? ?? '—',
                        style: const TextStyle(
                            color: AppColors.textPrimary, fontSize: 16)),
                    const SizedBox(height: 8),
                    const Text('DESTINO',
                        style: TextStyle(
                            color: AppColors.textSecondary,
                            fontSize: 11,
                            letterSpacing: 1)),
                    Text(route['destination'] as String? ?? '—',
                        style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 18,
                            fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    Row(children: [
                      StatusBadge(
                          label: route['status'] as String? ?? '—',
                          color: statusColor(
                              route['status'] as String? ?? '')),
                    ]),
                  ],
                ),
              ),

            const SizedBox(height: 16),

            // ─── Multi-stop route ──────────────────────────────────────────
            if (stops.isNotEmpty) ...[
              const Text('ROTEIRO DE PARADAS',
                  style: TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 12,
                      letterSpacing: 1)),
              const SizedBox(height: 8),
              _StopsList(stops: stops, onUpdateStatus: _updateStopStatus),
              const SizedBox(height: 16),
            ],

            // ─── QR scan button ────────────────────────────────────────────
            OperationalButton(
              label: 'SCAN QR PACIENTE',
              icon: Icons.qr_code_scanner,
              onPressed: () =>
                  Navigator.pushNamed(context, AppRoutes.qrScanner),
              color: AppColors.info,
            ),

            const SizedBox(height: 16),

            // ─── Patient list ──────────────────────────────────────────────
            Text('MANIFESTO (${patients.length} pac.)',
                style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 12,
                    letterSpacing: 1)),
            const SizedBox(height: 8),

            if (patients.isEmpty)
              const Center(
                child: Text('Nenhum paciente atribuído',
                    style: TextStyle(
                        color: AppColors.textSecondary, fontSize: 14)),
              ),

            for (final trip in patients)
              _TripPatientCard(trip: trip),
          ],
        ),
      ),
    );
  }
}

// ─── Stop list widget ─────────────────────────────────────────────────────────

class _StopsList extends StatelessWidget {
  final List<Map<String, dynamic>> stops;
  final Future<void> Function(String stopId, String status) onUpdateStatus;
  const _StopsList({required this.stops, required this.onUpdateStatus});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: stops.asMap().entries.map<Widget>((entry) {
        final index = entry.key;
        final stop = entry.value;
        final isLast = index == stops.length - 1;
        return _StopCard(
          stop: stop,
          isLast: isLast,
          onUpdateStatus: onUpdateStatus,
        );
      }).toList(),
    );
  }
}

class _StopCard extends StatelessWidget {
  final Map<String, dynamic> stop;
  final bool isLast;
  final Future<void> Function(String stopId, String status) onUpdateStatus;
  const _StopCard({
    required this.stop,
    required this.isLast,
    required this.onUpdateStatus,
  });

  @override
  Widget build(BuildContext context) {
    final stopId = stop['id'] as String?;
    final status = stop['status'] as String? ?? 'PENDING';
    final type = stop['type'] as String? ?? '';
    final name = stop['name'] as String? ?? '—';
    final lat = (stop['lat'] as num?)?.toDouble();
    final lng = (stop['lng'] as num?)?.toDouble();
    final planned = stop['plannedArrival'] as String?;
    final actual = stop['actualArrival'] as String?;
    final isCompleted = status == 'COMPLETED' || status == 'SKIPPED';

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Timeline connector
          SizedBox(
            width: 32,
            child: Column(
              children: [
                Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isCompleted
                        ? AppColors.primary.withOpacity(0.2)
                        : AppColors.primary.withOpacity(0.2),
                    border: Border.all(
                      color: isCompleted ? AppColors.primary : AppColors.primary,
                      width: 2,
                    ),
                  ),
                  child: Center(
                    child: Text(
                      _stopTypeIcon(type),
                      style: const TextStyle(fontSize: 10),
                    ),
                  ),
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      color: AppColors.border,
                    ),
                  ),
              ],
            ),
          ),

          const SizedBox(width: 8),

          // Stop details
          Expanded(
            child: Container(
              margin: EdgeInsets.only(bottom: isLast ? 0 : 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(name,
                            style: TextStyle(
                                color: isCompleted
                                    ? AppColors.textSecondary
                                    : AppColors.textPrimary,
                                fontSize: 15,
                                fontWeight: FontWeight.bold,
                                decoration: status == 'SKIPPED'
                                    ? TextDecoration.lineThrough
                                    : null)),
                      ),
                      StatusBadge(
                        label: _stopStatusLabel(status),
                        color: _stopStatusColor(status),
                      ),
                    ],
                  ),
                  if (planned != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      '📅 Previsto: ${_formatDateTime(planned)}',
                      style: const TextStyle(
                          color: AppColors.textSecondary, fontSize: 12),
                    ),
                  ],
                  if (actual != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      '✅ Chegou: ${_formatDateTime(actual)}',
                      style: const TextStyle(
                          color: AppColors.primary, fontSize: 12),
                    ),
                  ],

                  // ─── Navigation button ─────────────────────────────────
                  if (lat != null && lng != null && !isCompleted) ...[
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: () => NavigationService.showNavigationPicker(
                          context,
                          OpsNavDestination(
                            type: ['RETURN', 'DROPOFF'].contains(type.toUpperCase())
                                ? OpsNavDestType.returnDest
                                : OpsNavDestType.hospital,
                            name: name,
                            lat: lat,
                            lng: lng,
                          ),
                        ),
                        icon: const Text('🗺️',
                            style: TextStyle(fontSize: 14)),
                        label: const Text('Navegar',
                            style: TextStyle(fontSize: 13)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(6),
                          ),
                        ),
                      ),
                    ),
                  ],

                  // ─── Stop action buttons ──────────────────────────────
                  if (stopId != null && !isCompleted) ...[
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        if (status == 'PENDING' || status == 'EN_ROUTE')
                          _ActionChip(
                            label: '✅ Confirmar Chegada',
                            color: AppColors.info,
                            onTap: () => onUpdateStatus(stopId, 'ARRIVED'),
                          ),
                        if (status == 'ARRIVED')
                          _ActionChip(
                            label: '🚶 Iniciar Embarque',
                            color: AppColors.warning,
                            onTap: () => onUpdateStatus(stopId, 'BOARDING'),
                          ),
                        if (status == 'ARRIVED' || status == 'BOARDING')
                          _ActionChip(
                            label: '✔ Concluir Parada',
                            color: AppColors.primary,
                            onTap: () => onUpdateStatus(stopId, 'COMPLETED'),
                          ),
                        _ActionChip(
                          label: '⏭ Pular',
                          color: AppColors.textSecondary,
                          onTap: () => onUpdateStatus(stopId, 'SKIPPED'),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatDateTime(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')} '
          '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }
}

// ─── Small action chip ────────────────────────────────────────────────────────

class _ActionChip extends StatelessWidget {
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _ActionChip({
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: color.withOpacity(0.15),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withOpacity(0.5)),
        ),
        child: Text(
          label,
          style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}

// ─── Patient card ─────────────────────────────────────────────────────────────

class _TripPatientCard extends StatelessWidget {
  final Map<String, dynamic> trip;
  const _TripPatientCard({required this.trip});

  @override
  Widget build(BuildContext context) {
    final patientData = trip['patient'] as Map? ?? trip;
    final status = trip['status'] as String? ?? 'SCHEDULED';
    final risk = patientData['clinicalRisk'] as String? ?? '';
    final lat = (patientData['lat'] as num?)?.toDouble();
    final lng = (patientData['lng'] as num?)?.toDouble();

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(patientData['name'] as String? ?? '—',
                    style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 16,
                        fontWeight: FontWeight.bold)),
              ),
              StatusBadge(label: status, color: statusColor(status)),
            ],
          ),
          const SizedBox(height: 4),
          Text(patientData['address'] as String? ?? '—',
              style: const TextStyle(
                  color: AppColors.textSecondary, fontSize: 13)),
          if (risk.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('Risco: $risk',
                style: TextStyle(
                    color: risk == 'CRITICAL' || risk == 'HIGH'
                        ? AppColors.danger
                        : AppColors.textSecondary,
                    fontSize: 12,
                    fontWeight: FontWeight.bold)),
          ],
          if (trip['boardedAt'] != null) ...[
            const SizedBox(height: 4),
            Text('Embarcou: ${trip['boardedAt']}',
                style: const TextStyle(
                    color: AppColors.primary, fontSize: 12)),
          ],
          // Navigate to patient home address when coordinates are available
          if (lat != null && lng != null) ...[
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => NavigationService.showNavigationPicker(
                context,
                OpsNavDestination(
                  type: OpsNavDestType.patientPickup,
                  name: patientData['name'] as String? ?? 'Paciente',
                  address: patientData['address'] as String?,
                  lat: lat,
                  lng: lng,
                ),
              ),
              icon: const Text('🗺️', style: TextStyle(fontSize: 14)),
              label: const Text('Ir até endereço',
                  style: TextStyle(fontSize: 13)),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.primary,
                side: BorderSide(color: AppColors.primary),
                padding:
                    const EdgeInsets.symmetric(vertical: 6, horizontal: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(6),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
