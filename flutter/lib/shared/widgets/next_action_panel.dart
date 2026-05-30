// lib/shared/widgets/next_action_panel.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../navigation/navigation_service.dart';
import '../../operational/operation_controller.dart';
import '../../operational/operation_state.dart';
import '../../core/constants.dart';
import '../../core/l10n.dart';

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
          // ── Navigation shortcut ──────────────────────────────────────────
          if (ctrl.currentOpsNavDestination != null) ...[
            const SizedBox(height: 10),
            _buildNavigationButton(context, ctrl),
          ],
          // ── Finalize (stale / recovery) ──────────────────────────────────
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
                label: Text(context.l10n.finalizeOperation),
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
          // ── WhatsApp & QR quick actions ──────────────────────────────────
          if (ctrl.hasActiveRoute && ctrl.canPerformQrAction) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: ctrl.actionInProgress
                        ? null
                        : () => _sendQrWhatsApp(context, ctrl),
                    icon: const Icon(Icons.message, size: 16),
                    label: Text(context.l10n.sendQrAction),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.info,
                      side: BorderSide(
                          color: AppColors.info.withValues(alpha: 1)),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8)),
                      textStyle: const TextStyle(
                          fontSize: 12, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: ctrl.actionInProgress
                        ? null
                        : () => _shareRoute(context, ctrl),
                    icon: const Icon(Icons.share, size: 16),
                    label: Text(context.l10n.shareAction),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.primary,
                      side: BorderSide(
                          color: AppColors.primary.withValues(alpha: 1)),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8)),
                      textStyle: const TextStyle(
                          fontSize: 12, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _sendQrWhatsApp(
      BuildContext context, OperationController ctrl) async {
    // TODO: Implement WhatsApp QR send via /api/whatsapp/send-boarding-qr
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(context.l10n.qrWillBeSent),
        duration: Duration(seconds: 2),
      ),
    );
  }

  Future<void> _shareRoute(
      BuildContext context, OperationController ctrl) async {
    // TODO: Implement route share via native share intent with tracking link
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(context.l10n.routeShared),
        duration: Duration(seconds: 2),
      ),
    );
  }

  Widget _buildNavigationButton(
      BuildContext context, OperationController ctrl) {
    final dest = ctrl.currentOpsNavDestination!;
    return OutlinedButton.icon(
      onPressed: () => NavigationService.showNavigationPicker(context, dest),
      icon: const Icon(Icons.navigation_outlined, size: 18),
      label: Text(context.l10n.startNavigationTo(dest.typeLabel(context))),
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.info,
        side: const BorderSide(color: AppColors.info),
        padding: const EdgeInsets.symmetric(vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(
            fontSize: 13, fontWeight: FontWeight.bold, letterSpacing: 0.5),
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
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
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
