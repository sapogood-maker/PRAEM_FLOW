// lib/trips/trip_screen.dart
// ─────────────────────────────────────────────────────────────────────────────
// Detailed trip view — patient manifest, status update, QR scan shortcut.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../driver/driver_state.dart';
import '../core/constants.dart';
import '../shared/widgets/operational_button.dart';
import '../shared/widgets/status_badge.dart';

class TripScreen extends StatelessWidget {
  const TripScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final route = driver.activeRoute;
    final patients = driver.patients;

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

class _TripPatientCard extends StatelessWidget {
  final Map<String, dynamic> trip;
  const _TripPatientCard({required this.trip});

  @override
  Widget build(BuildContext context) {
    final patientData = trip['patient'] as Map? ?? trip;
    final status = trip['status'] as String? ?? 'SCHEDULED';
    final risk = patientData['clinicalRisk'] as String? ?? '';

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
        ],
      ),
    );
  }
}
