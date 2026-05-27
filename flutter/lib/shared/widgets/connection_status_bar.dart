// lib/shared/widgets/connection_status_bar.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../../websocket/ws_service.dart';
import '../../tracking/gps_tracking_service.dart';
import '../../core/constants.dart';
import '../../core/l10n.dart';
import '../../offline_sync/connectivity_service.dart';
import '../../offline/offline_queue.dart';
import '../../operational/sync_manager.dart';

class ConnectionStatusBar extends StatelessWidget {
  const ConnectionStatusBar({super.key});

  @override
  Widget build(BuildContext context) {
    final ws = context.watch<WsService>();
    final gps = context.watch<GpsTrackingService>();
    final connectivity = context.watch<ConnectivityService>();
    final queue = context.watch<OfflineQueue>();
    final syncManager = context.watch<SyncManager>();
    final state = connectivity.state;
    final statusLabel = _stateLabel(state, context);
    final statusColor = _stateColor(state);
    return Container(
      color: AppColors.surface,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Row(
        children: [
          Icon(
            _stateIcon(state),
            size: 14,
            color: statusColor,
          ),
          const SizedBox(width: 6),
          Text(
            statusLabel,
            style: TextStyle(
              fontSize: 11,
              color: statusColor,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(width: 16),
          Icon(
            gps.active ? Icons.gps_fixed : Icons.gps_off,
            size: 14,
            color: gps.active ? AppColors.primary : AppColors.warning,
          ),
          const SizedBox(width: 6),
          Text(
            gps.active
                ? context.l10n.connectionGpsActive
                : context.l10n.connectionGpsInactive,
            style: TextStyle(
              fontSize: 11,
              color: gps.active ? AppColors.primary : AppColors.warning,
              fontWeight: FontWeight.w600,
            ),
          ),
          const Spacer(),
          Text(
            context.l10n.connectionPending(queue.pendingCount),
            style:
                const TextStyle(fontSize: 10, color: AppColors.textSecondary),
          ),
          const SizedBox(width: 12),
          Text(
            context.l10n.connectionWs(ws.connected ? 'ON' : 'OFF'),
            style:
                const TextStyle(fontSize: 10, color: AppColors.textSecondary),
          ),
          const SizedBox(width: 12),
          Text(
            context.l10n.connectionApi(
                connectivity.connectivity.contains(ConnectivityResult.none)
                    ? 'OFF'
                    : 'ON'),
            style:
                const TextStyle(fontSize: 10, color: AppColors.textSecondary),
          ),
          const SizedBox(width: 12),
          Text(
            syncManager.lastError == null
                ? (queue.lastSyncedAt == null
                    ? context.l10n.lastSyncUnknown
                    : context.l10n.lastSyncAt(_format(queue.lastSyncedAt!)))
                : syncManager.lastError!,
            style:
                const TextStyle(fontSize: 10, color: AppColors.textSecondary),
          ),
          const SizedBox(width: 12),
          TextButton.icon(
            onPressed: syncManager.syncing ? null : () => syncManager.syncAll(),
            icon: syncManager.syncing
                ? const SizedBox(
                    width: 12,
                    height: 12,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sync, size: 14),
            label: Text(context.l10n.syncAction),
          ),
        ],
      ),
    );
  }

  IconData _stateIcon(OfflineConnectivityState state) {
    switch (state) {
      case OfflineConnectivityState.online:
        return Icons.wifi;
      case OfflineConnectivityState.degraded:
        return Icons.wifi_tethering_error;
      case OfflineConnectivityState.offline:
        return Icons.wifi_off;
      case OfflineConnectivityState.syncing:
        return Icons.sync;
    }
  }

  Color _stateColor(OfflineConnectivityState state) {
    switch (state) {
      case OfflineConnectivityState.online:
        return AppColors.primary;
      case OfflineConnectivityState.degraded:
        return AppColors.warning;
      case OfflineConnectivityState.offline:
        return AppColors.danger;
      case OfflineConnectivityState.syncing:
        return AppColors.info;
    }
  }

  String _stateLabel(OfflineConnectivityState state, BuildContext context) {
    switch (state) {
      case OfflineConnectivityState.online:
        return context.l10n.connectivityOnline;
      case OfflineConnectivityState.degraded:
        return context.l10n.connectivityDegraded;
      case OfflineConnectivityState.offline:
        return context.l10n.connectivityOffline;
      case OfflineConnectivityState.syncing:
        return context.l10n.connectivitySyncing;
    }
  }

  String _format(DateTime value) {
    final local = value.toLocal();
    return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }
}
