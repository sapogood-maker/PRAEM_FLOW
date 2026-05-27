// lib/qr/qr_scanner_screen.dart
// ─────────────────────────────────────────────────────────────────────────────
// Smart operational QR scanner:
// - single-tap continuous scan flow for drivers
// - backend resolves patient/trip/route and validates active dispatch
// - scanner stays open for fast multi-passenger boarding
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';

import '../auth/auth_service.dart';
import '../driver/driver_state.dart';
import '../core/constants.dart';
import '../shared/widgets/operational_button.dart';
import '../offline/offline_queue.dart';
import '../operational/sync_manager.dart';
import '../offline_sync/connectivity_service.dart';
import '../offline_sync/qr_offline_validator.dart';
import '../config/app_config.dart';
import '../core/l10n.dart';

class QrScannerScreen extends StatefulWidget {
  const QrScannerScreen({super.key});

  @override
  State<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<QrScannerScreen> {
  final _controller = MobileScannerController(
    facing: CameraFacing.back,
    detectionSpeed: DetectionSpeed.normal,
    torchEnabled: false,
  );

  bool _loading = false;
  Map<String, dynamic>? _result;
  String? _error;
  String? _lastToken;
  DateTime? _lastScanAt;
  Timer? _clearTimer;

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_loading) return;
    final code = capture.barcodes.firstOrNull?.rawValue?.trim();
    if (code == null || code.isEmpty) return;

    final now = DateTime.now();
    if (_lastToken == code &&
        _lastScanAt != null &&
        now.difference(_lastScanAt!) < const Duration(seconds: 2)) {
      return;
    }
    _lastToken = code;
    _lastScanAt = now;

    setState(() {
      _loading = true;
    });
    await _validateToken(code);
    if (!mounted) return;
    setState(() {
      _loading = false;
    });
  }

  Future<void> _validateToken(String token) async {
    final auth = context.read<AuthService>();
    final driver = context.read<DriverState>();
    final offline = context.read<OfflineQueue>();
    final syncManager = context.read<SyncManager>();
    final connectivity = context.read<ConnectivityService>();
    final validator = QrOfflineValidator(secret: AppConfig.offlineQrSecret);
    final validation = validator.validate(token);
    final payload = validation.payload ?? <String, dynamic>{'raw': token};
    final deviceId = driver.deviceId ?? 'unknown-device';
    final checkpoint =
        (payload['checkpoint']?.toString() ?? 'BOARDING').toUpperCase();
    final eventPayload = {
      'qrToken': token,
      'tripId': payload['tripId'],
      'patientId': payload['patientReference'] ?? payload['patientId'],
      'patientReference': payload['patientReference'] ?? payload['patientId'],
      'operationReference':
          payload['operationReference'] ?? payload['boardingCode'],
      'boardingCode': payload['operationReference'] ?? payload['boardingCode'],
      'expiration': payload['expiration'] ?? payload['expiresAt'],
      'expiresAt': payload['expiration'] ?? payload['expiresAt'],
      'uniqueId': payload['uniqueId'],
      'secureHash': payload['signature'],
      'signature': payload['signature'],
      'checkpoint': checkpoint,
      'vehicleId': driver.vehicle?['id'],
      'routeId': driver.activeRoute?['id'],
      'deviceId': deviceId,
      'operatorId': auth.driverId,
      'source': 'TABLET_SMART_SCANNER',
      'timestamp': DateTime.now().toIso8601String(),
    };

    if (!validation.valid) {
      if (!mounted) return;
      setState(() {
        _error = validation.reason;
        _result = null;
      });
      HapticFeedback.lightImpact();
      return;
    }

    await offline.enqueueQrScan(
      payload: eventPayload,
      deviceId: deviceId,
      operationId: driver.activeRoute?['id'] as String?,
      routeId: driver.activeRoute?['id'] as String?,
      tripId: payload['tripId']?.toString(),
    );
    await syncManager.syncAll();

    _clearTimer?.cancel();
    _clearTimer = Timer(const Duration(seconds: 6), () {
      if (!mounted) return;
      setState(() {
        _result = null;
        _error = null;
      });
    });
    if (!mounted) return;
    setState(() {
      _result = {
        'name': payload['patientReference']?.toString() ??
            payload['patientId']?.toString() ??
            '—',
        'destination': payload['operationReference']?.toString() ??
            payload['boardingCode']?.toString() ??
            '—',
        'status': connectivity.websocketConnected ? 'SYNCED' : 'PENDING_SYNC',
        'checkpoint': checkpoint,
        'tripId': payload['tripId'],
        'routeId': driver.activeRoute?['id'],
      };
      _error = null;
    });
    HapticFeedback.mediumImpact();
    SystemSound.play(SystemSoundType.click);
  }

  @override
  void dispose() {
    _clearTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: Text(
          context.l10n.qrScannerTitle,
          style: const TextStyle(color: AppColors.textPrimary),
        ),
        iconTheme: const IconThemeData(color: AppColors.textPrimary),
        actions: [
          IconButton(
            icon: const Icon(Icons.cameraswitch),
            onPressed: () async => _controller.switchCamera(),
          ),
          IconButton(
            icon: const Icon(Icons.flash_on),
            onPressed: () async => _controller.toggleTorch(),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            flex: 3,
            child: Stack(
              fit: StackFit.expand,
              children: [
                MobileScanner(
                  controller: _controller,
                  onDetect: _onDetect,
                ),
                if (_loading)
                  const Align(
                    alignment: Alignment.topCenter,
                    child: Padding(
                      padding: EdgeInsets.only(top: 16),
                      child:
                          CircularProgressIndicator(color: AppColors.primary),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            flex: 2,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: _buildFeedback(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFeedback() {
    if (_result != null) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.primary),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.check_circle, color: AppColors.primary),
                const SizedBox(width: 8),
                Text(
                  context.l10n.boardingConfirmed,
                  style: TextStyle(
                      color: AppColors.primary,
                      fontWeight: FontWeight.bold,
                      fontSize: 16),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _line(context.l10n.passengerLabel,
                _result!['name'] as String? ?? '—'),
            _line(context.l10n.destinationLabel,
                _result!['destination'] as String? ?? '—'),
            _line(context.l10n.eventLabel,
                (_result!['checkpoint'] ?? 'BOARDING').toString()),
            _line(
                context.l10n.tripLabel, (_result!['tripId'] ?? '—').toString()),
            const SizedBox(height: 12),
            Text(
              context.l10n.continueScanning,
              style:
                  const TextStyle(color: AppColors.textSecondary, fontSize: 12),
            ),
          ],
        ),
      );
    }

    if (_error != null) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.warning),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.warning_amber_rounded,
                    color: AppColors.warning),
                const SizedBox(width: 8),
                Text(
                  context.l10n.validationFailed,
                  style: TextStyle(
                      color: AppColors.warning, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(_error!,
                style: const TextStyle(
                    color: AppColors.textPrimary, fontSize: 14)),
            const Spacer(),
            OperationalButton(
              label: context.l10n.clearAction,
              icon: Icons.clear,
              onPressed: () => setState(() => _error = null),
              color: AppColors.warning,
            ),
          ],
        ),
      );
    }

    return Center(
      child: Text(
        context.l10n.scannerHint,
        textAlign: TextAlign.center,
        style: const TextStyle(color: AppColors.textSecondary, fontSize: 15),
      ),
    );
  }

  Widget _line(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: const TextStyle(
                  color: AppColors.textSecondary, fontSize: 12)),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                  color: AppColors.textPrimary, fontWeight: FontWeight.bold),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
