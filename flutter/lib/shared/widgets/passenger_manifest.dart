// lib/shared/widgets/passenger_manifest.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../operational/operation_controller.dart';
import '../../core/constants.dart';

class PassengerManifest extends StatelessWidget {
  const PassengerManifest({super.key});

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<OperationController>();
    final patients = ctrl.patients;
    if (patients.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Text(
          'Nenhum passageiro atribuído',
          style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
          child: Text(
            'MANIFESTO (${patients.length} passageiro${patients.length != 1 ? 's' : ''})',
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 11,
              letterSpacing: 1,
            ),
          ),
        ),
        for (final trip in patients) _PatientCard(trip: trip),
      ],
    );
  }
}

class _PatientCard extends StatelessWidget {
  final Map<String, dynamic> trip;
  const _PatientCard({required this.trip});

  @override
  Widget build(BuildContext context) {
    final status = (trip['status'] as String? ?? 'SCHEDULED').toUpperCase();
    final name = trip['patient']?['name'] as String? ??
        trip['patientName'] as String? ??
        '—';
    final dest = trip['destination'] as String? ??
        trip['queue']?['destination'] as String? ??
        '—';
    final color = _statusColor(status);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  dest,
                  style:
                      const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: color.withOpacity(0.4)),
            ),
            child: Text(
              _statusLabel(status),
              style: TextStyle(
                color: color,
                fontSize: 10,
                fontWeight: FontWeight.bold,
                letterSpacing: 0.6,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'BOARDING':
        return 'EMBARCANDO';
      case 'IN_PROGRESS':
      case 'IN_TRANSIT':
        return 'EM TRÂNSITO';
      case 'ARRIVED':
        return 'CHEGOU';
      case 'COMPLETED':
        return 'CONCLUÍDO';
      case 'NO_SHOW':
        return 'NÃO VEIO';
      case 'CANCELLED':
        return 'CANCELADO';
      default:
        return 'AGUARDANDO';
    }
  }

  Color _statusColor(String status) {
    switch (status) {
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
        return AppColors.danger;
      default:
        return AppColors.textSecondary;
    }
  }
}
