import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants.dart';
import '../../operational/operation_controller.dart';

class StaleRecoveryPanel extends StatelessWidget {
  const StaleRecoveryPanel({super.key});

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<OperationController>();
    final route = ctrl.activeRoute;
    return Container(
      color: AppColors.background,
      width: double.infinity,
      height: double.infinity,
      padding: const EdgeInsets.all(20),
      child: Center(
        child: Container(
          constraints: const BoxConstraints(maxWidth: 520),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.danger),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Operação anterior detectada',
                style: TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                '${route?['origin'] ?? 'Origem'} → ${route?['destination'] ?? 'Destino'}',
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
              ),
              const SizedBox(height: 8),
              Text(
                'Stale: ${ctrl.staleElapsedHours}h · nível ${ctrl.staleLevel}',
                style: const TextStyle(color: AppColors.warning, fontSize: 13),
              ),
              const SizedBox(height: 6),
              Text(
                'Passageiros embarcados: ${ctrl.boardedCount} · Em trânsito: ${ctrl.hasInTransitPassengers ? 'SIM' : 'NÃO'}',
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
              ),
              const SizedBox(height: 20),
              ElevatedButton.icon(
                onPressed: ctrl.actionInProgress ? null : ctrl.continueStaleOperation,
                icon: const Icon(Icons.play_arrow),
                label: const Text('CONTINUAR OPERAÇÃO'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.info,
                  foregroundColor: AppColors.textPrimary,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
              const SizedBox(height: 10),
              ElevatedButton.icon(
                onPressed: ctrl.actionInProgress ? null : () async => ctrl.finalizeOperationRecovery(),
                icon: const Icon(Icons.task_alt),
                label: const Text('FINALIZAR OPERAÇÃO'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.danger,
                  foregroundColor: AppColors.textPrimary,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
