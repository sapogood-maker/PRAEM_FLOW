// lib/navigation/navigation_service.dart
// ─────────────────────────────────────────────────────────────────────────────
// Operational navigation integration.
// Opens Google Maps / Waze for route guidance while Flutter retains tracking.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/constants.dart';

// ─── Destination type ────────────────────────────────────────────────────────

enum OpsNavDestType {
  patientPickup,
  hospital,
  returnDest,
}

// ─── Value object ────────────────────────────────────────────────────────────

class OpsNavDestination {
  final OpsNavDestType type;
  final String name;
  final String? address;
  final double lat;
  final double lng;

  const OpsNavDestination({
    required this.type,
    required this.name,
    this.address,
    required this.lat,
    required this.lng,
  });

  String get typeLabel {
    switch (type) {
      case OpsNavDestType.patientPickup:
        return 'Navegar até paciente';
      case OpsNavDestType.hospital:
        return 'Navegar até hospital';
      case OpsNavDestType.returnDest:
        return 'Navegar retorno';
    }
  }

  String get typeIcon {
    switch (type) {
      case OpsNavDestType.patientPickup:
        return '📍';
      case OpsNavDestType.hospital:
        return '🏥';
      case OpsNavDestType.returnDest:
        return '↩️';
    }
  }

  /// Factory from raw API `OpsNavDestination` map.
  static OpsNavDestination? fromMap(Map<String, dynamic>? map) {
    if (map == null) return null;
    final lat = (map['lat'] as num?)?.toDouble();
    final lng = (map['lng'] as num?)?.toDouble();
    if (lat == null || lng == null) return null;
    final typeRaw = (map['type'] as String? ?? '').toUpperCase();
    final type = typeRaw == 'PATIENT_PICKUP'
        ? OpsNavDestType.patientPickup
        : typeRaw == 'RETURN'
            ? OpsNavDestType.returnDest
            : OpsNavDestType.hospital;
    return OpsNavDestination(
      type: type,
      name: (map['name'] as String?) ?? 'Destino',
      address: map['address'] as String?,
      lat: lat,
      lng: lng,
    );
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

class NavigationService {
  NavigationService._();

  // Android native Google Maps navigation intent (best UX, avoids browser)
  static Future<bool> _tryNativeGoogleMaps(double lat, double lng) async {
    final uri = Uri.parse('google.navigation:q=$lat,$lng&mode=d');
    debugPrint('[MAPS] trying native intent: $uri');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
      return true;
    }
    return false;
  }

  // Google Maps web URL (universal fallback — also opens app via deep link)
  static Future<bool> _tryGoogleMapsUrl(double lat, double lng, String label) async {
    final uri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving',
    );
    debugPrint('[MAPS] trying Google Maps URL: $uri');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
      return true;
    }
    return false;
  }

  // Waze deep link
  static Future<bool> _tryWaze(double lat, double lng) async {
    final uri = Uri.parse('https://waze.com/ul?ll=$lat,$lng&navigate=yes');
    debugPrint('[MAPS] trying Waze: $uri');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
      return true;
    }
    return false;
  }

  /// Open Google Maps with priority: native intent → web URL.
  static Future<void> openGoogleMaps(double lat, double lng, String label) async {
    final launched = await _tryNativeGoogleMaps(lat, lng);
    if (!launched) await _tryGoogleMapsUrl(lat, lng, label);
    debugPrint('[NAVIGATION] openGoogleMaps lat=$lat lng=$lng label="$label"');
  }

  /// Open Waze with Google Maps fallback.
  static Future<void> openWaze(double lat, double lng, String label) async {
    final launched = await _tryWaze(lat, lng);
    if (!launched) await openGoogleMaps(lat, lng, label);
    debugPrint('[NAVIGATION] openWaze lat=$lat lng=$lng label="$label"');
  }

  /// Show app-picker bottom sheet (Maps / Waze).
  static void showNavigationPicker(BuildContext context, OpsNavDestination dest) {
    debugPrint(
      '[NAVIGATION] showNavigationPicker type=${dest.type.name} '
      'name="${dest.name}" lat=${dest.lat} lng=${dest.lng}',
    );
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${dest.typeIcon} ${dest.typeLabel}',
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                dest.name,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
              ),
              if (dest.address != null) ...[
                const SizedBox(height: 2),
                Text(
                  dest.address!,
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                ),
              ],
              const SizedBox(height: 16),
              ListTile(
                leading: const Text('🗺️', style: TextStyle(fontSize: 26)),
                title: const Text('Google Maps',
                    style: TextStyle(color: AppColors.textPrimary)),
                subtitle: const Text('Navegação com trânsito em tempo real',
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                onTap: () {
                  Navigator.pop(context);
                  openGoogleMaps(dest.lat, dest.lng, dest.name);
                },
              ),
              ListTile(
                leading: const Text('🚗', style: TextStyle(fontSize: 26)),
                title: const Text('Waze',
                    style: TextStyle(color: AppColors.textPrimary)),
                subtitle: const Text('Alertas de trânsito e rotas alternativas',
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                onTap: () {
                  Navigator.pop(context);
                  openWaze(dest.lat, dest.lng, dest.name);
                },
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}
