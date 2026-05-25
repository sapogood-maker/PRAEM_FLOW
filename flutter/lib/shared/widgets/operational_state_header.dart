// lib/shared/widgets/operational_state_header.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../operational/operation_state.dart';
import '../../operational/operation_controller.dart';
import '../../core/constants.dart';

class OperationalStateHeader extends StatelessWidget {
  const OperationalStateHeader({super.key});

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<OperationController>();
    final state = ctrl.state;
    final color = operationalStateColor(state);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      color: color.withOpacity(0.12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 8),
              Text(
                operationalStateLabel(state),
                style: TextStyle(
                  color: color,
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1.1,
                ),
              ),
              if (ctrl.loading) ...[
                const SizedBox(width: 10),
                SizedBox(
                  width: 12,
                  height: 12,
                  child: CircularProgressIndicator(
                    strokeWidth: 1.5,
                    color: color,
                  ),
                ),
              ],
            ],
          ),
          if (ctrl.activeRoute != null) ...[
            const SizedBox(height: 4),
            Text(
              '${ctrl.activeRoute!['origin'] ?? ''} → ${ctrl.activeRoute!['destination'] ?? ''}',
              style: const TextStyle(
                  color: AppColors.textSecondary, fontSize: 12),
              overflow: TextOverflow.ellipsis,
            ),
          ],
          if (ctrl.isStaleRoute) ...[
            const SizedBox(height: 6),
            Text(
              '⚠️ Rota stale (${ctrl.staleElapsedHours}h) · ${ctrl.staleLevel}',
              style: const TextStyle(color: AppColors.warning, fontSize: 12, fontWeight: FontWeight.bold),
            ),
          ],
          if (ctrl.lastError != null) ...[
            const SizedBox(height: 4),
            Text(
              ctrl.lastError!,
              style: const TextStyle(color: AppColors.danger, fontSize: 11),
            ),
          ],
        ],
      ),
    );
  }
}
