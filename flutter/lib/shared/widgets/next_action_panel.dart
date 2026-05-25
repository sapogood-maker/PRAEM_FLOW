// lib/shared/widgets/next_action_panel.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../operational/operation_controller.dart';
import '../../operational/operation_state.dart';
import '../../core/constants.dart';

class NextActionPanel extends StatelessWidget {
  const NextActionPanel({super.key});

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<OperationController>();
    final label = ctrl.nextActionLabel;
    final hint = ctrl.nextActionHint;
    final state = ctrl.state;
    final color = operationalStateColor(state);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(hint,
              style: const TextStyle(
                  color: AppColors.textSecondary, fontSize: 13)),
          if (ctrl.mustShowFinalizeOperation) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: ctrl.actionInProgress
                    ? null
                    : () async {
                        await ctrl.finalizeOperationRecovery();
                      },
                icon: ctrl.actionInProgress
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: AppColors.textPrimary),
                      )
                    : const Icon(Icons.task_alt, size: 20),
                label: const Text('FINALIZAR OPERAÇÃO'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.danger,
                  foregroundColor: AppColors.textPrimary,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                  textStyle: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 0.8),
                ),
              ),
            ),
          ],
          if (label != null) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: _buildActionButton(context, ctrl, label, state, color),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildActionButton(
    BuildContext context,
    OperationController ctrl,
    String label,
    OperationalState state,
    Color color,
  ) {
    final opensScanner = state == OperationalState.waitingPatient ||
        state == OperationalState.driverAccepted ||
        (state == OperationalState.boarding && ctrl.pendingBoardingCount > 0);

    return ElevatedButton.icon(
      onPressed: ctrl.actionInProgress
          ? null
          : () async {
              if (opensScanner) {
                Navigator.pushNamed(context, AppRoutes.qrScanner);
              } else {
                await ctrl.performPrimaryAction();
              }
            },
      icon: ctrl.actionInProgress
          ? const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                  strokeWidth: 2, color: AppColors.textPrimary),
            )
          : Icon(_iconForState(state), size: 20),
      label: Text(label),
      style: ElevatedButton.styleFrom(
        backgroundColor: color,
        foregroundColor: AppColors.textPrimary,
        padding: const EdgeInsets.symmetric(vertical: 16),
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(
            fontSize: 15, fontWeight: FontWeight.bold, letterSpacing: 0.8),
      ),
    );
  }

  IconData _iconForState(OperationalState state) {
    switch (state) {
      case OperationalState.dispatched:
        return Icons.check_circle_outline;
      case OperationalState.driverAccepted:
      case OperationalState.waitingPatient:
      case OperationalState.boarding:
        return Icons.qr_code_scanner;
      case OperationalState.boarded:
      case OperationalState.inTransit:
        return Icons.directions_car;
      case OperationalState.arrived:
        return Icons.flag;
      default:
        return Icons.play_arrow;
    }
  }
}
