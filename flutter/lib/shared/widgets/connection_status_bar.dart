// lib/shared/widgets/connection_status_bar.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../websocket/ws_service.dart';
import '../../tracking/gps_tracking_service.dart';
import '../../core/constants.dart';

class ConnectionStatusBar extends StatelessWidget {
  const ConnectionStatusBar({super.key});

  @override
  Widget build(BuildContext context) {
    final ws = context.watch<WsService>();
    final gps = context.watch<GpsTrackingService>();
    return Container(
      color: AppColors.surface,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Row(
        children: [
          Icon(
            ws.connected ? Icons.wifi : Icons.wifi_off,
            size: 14,
            color: ws.connected ? AppColors.primary : AppColors.danger,
          ),
          const SizedBox(width: 6),
          Text(
            ws.connected ? 'Conectado' : 'Sem conexão',
            style: TextStyle(
              fontSize: 11,
              color: ws.connected ? AppColors.primary : AppColors.danger,
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
            gps.active ? 'GPS ativo' : 'GPS inativo',
            style: TextStyle(
              fontSize: 11,
              color: gps.active ? AppColors.primary : AppColors.warning,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (gps.lastPosition != null) ...[
            const Spacer(),
            Text(
              '${gps.lastPosition!.latitude.toStringAsFixed(4)}, ${gps.lastPosition!.longitude.toStringAsFixed(4)}',
              style: const TextStyle(
                  fontSize: 10, color: AppColors.textSecondary),
            ),
          ],
        ],
      ),
    );
  }
}
