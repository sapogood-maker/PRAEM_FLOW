// lib/shared/widgets/destination_info_card.dart
// Mini operational destination card shown on the home screen.
// Shows next destination name, type, address, and a NAVEGAR button.

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/constants.dart';
import '../../core/l10n.dart';
import '../../navigation/navigation_service.dart';
import '../../operational/operation_controller.dart';

class DestinationInfoCard extends StatelessWidget {
  const DestinationInfoCard({super.key});

  @override
  Widget build(BuildContext context) {
    final ctrl = context.watch<OperationController>();
    final dest = ctrl.currentOpsNavDestination;
    if (dest == null) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.primary),
      ),
      child: Row(
        children: [
          // Type icon
          Text(dest.typeIcon, style: const TextStyle(fontSize: 24)),
          const SizedBox(width: 10),
          // Destination details
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  dest.typeLabel(context).toUpperCase(),
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 10,
                    letterSpacing: 0.6,
                  ),
                ),
                Text(
                  dest.name,
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
                if (dest.address != null)
                  Text(
                    dest.address!,
                    style: const TextStyle(
                        color: AppColors.textSecondary, fontSize: 11),
                    overflow: TextOverflow.ellipsis,
                  ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          // Navigate button
          ElevatedButton.icon(
            onPressed: () =>
                NavigationService.showNavigationPicker(context, dest),
            icon: const Icon(Icons.navigation, size: 16),
            label: Text(context.l10n.navigateAction),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: AppColors.textPrimary,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              textStyle:
                  const TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }
}
