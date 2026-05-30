// lib/shared/widgets/operational_button.dart
// ─────────────────────────────────────────────────────────────────────────────
// Large, high-contrast operational button — easy to tap while in a vehicle.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import '../../core/constants.dart';

class OperationalButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback? onPressed;
  final Color color;
  final bool outlined;

  const OperationalButton({
    super.key,
    required this.label,
    required this.icon,
    this.onPressed,
    this.color = AppColors.primary,
    this.outlined = false,
  });

  @override
  Widget build(BuildContext context) {
    final style = outlined
        ? OutlinedButton.styleFrom(
            foregroundColor: color,
            side: BorderSide(color: color, width: 2),
            padding:
                const EdgeInsets.symmetric(vertical: 18, horizontal: 16),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10)),
            textStyle: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.bold,
                letterSpacing: 1),
          )
        : ElevatedButton.styleFrom(
            backgroundColor: color,
            foregroundColor: AppColors.textPrimary,
            padding:
                const EdgeInsets.symmetric(vertical: 18, horizontal: 16),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10)),
            textStyle: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.bold,
                letterSpacing: 1),
            elevation: 0,
          );

    final child = Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, size: 20),
        const SizedBox(width: 8),
        Text(label),
      ],
    );

    return outlined
        ? OutlinedButton(onPressed: onPressed, style: style, child: child)
        : ElevatedButton(onPressed: onPressed, style: style, child: child);
  }
}
