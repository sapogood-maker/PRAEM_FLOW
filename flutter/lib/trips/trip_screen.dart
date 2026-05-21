// lib/trips/trip_screen.dart
// ─────────────────────────────────────────────────────────────────────────────
// Detailed trip view — multi-stop manifest, navigation, QR scan shortcut.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../driver/driver_state.dart';
import '../core/constants.dart';
import '../shared/widgets/operational_button.dart';
import '../shared/widgets/status_badge.dart';

// ─── Navigation helpers ───────────────────────────────────────────────────────

Future<void> _openInGoogleMaps(double lat, double lng, String label) async {
  final uri = Uri.parse(
    'https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving',
  );
  if (await canLaunchUrl(uri)) {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}

Future<void> _openInWaze(double lat, double lng) async {
  final uri = Uri.parse('https://waze.com/ul?ll=$lat,$lng&navigate=yes');
  if (await canLaunchUrl(uri)) {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  } else {
    // Fall back to Google Maps if Waze is not installed
    await _openInGoogleMaps(lat, lng, '');
  }
}

void _showNavigationOptions(BuildContext context, double lat, double lng, String name) {
  showModalBottomSheet(
    context: context,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (_) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '🗺️ Navegar para $name',
              style: const TextStyle(
                color: AppColors.textPrimary,
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            ListTile(
              leading: const Text('🗺️', style: TextStyle(fontSize: 24)),
              title: const Text('Google Maps',
                  style: TextStyle(color: AppColors.textPrimary)),
              onTap: () {
                Navigator.pop(context);
                _openInGoogleMaps(lat, lng, name);
              },
            ),
            ListTile(
              leading: const Text('🚗', style: TextStyle(fontSize: 24)),
              title: const Text('Waze',
                  style: TextStyle(color: AppColors.textPrimary)),
              onTap: () {
                Navigator.pop(context);
                _openInWaze(lat, lng);
              },
            ),
          ],
        ),
      ),
    ),
  );
}

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

class TripScreen extends StatelessWidget {
  const TripScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final route = driver.activeRoute;
    final patients = driver.patients;
    final stops = (driver.activeRoute?['stops'] as List?)
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
              _StopsList(stops: stops),
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
  const _StopsList({required this.stops});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: stops.asMap().entries.map((entry) {
        final index = entry.key;
        final stop = entry.value;
        final isLast = index == stops.length - 1;
        return _StopCard(stop: stop, isLast: isLast);
      }).toList(),
    );
  }
}

class _StopCard extends StatelessWidget {
  final Map<String, dynamic> stop;
  final bool isLast;
  const _StopCard({required this.stop, required this.isLast});

  @override
  Widget build(BuildContext context) {
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
                  if (lat != null && lng != null && !isCompleted) ...[
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: () =>
                            _showNavigationOptions(context, lat, lng, name),
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
              onPressed: () => _showNavigationOptions(
                  context,
                  lat,
                  lng,
                  patientData['name'] as String? ?? 'Paciente'),
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
