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
import '../operational/operation_controller.dart';
import '../operational/sync_manager.dart';
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
    final ctrl = context.read<OperationController>();
    final offline = context.read<OfflineQueue>();
    final syncManager = context.read<SyncManager>();
    final validator = QrOfflineValidator(secret: AppConfig.offlineQrSecret);
    final validation = validator.validate(token);
    final payload = validation.payload ?? <String, dynamic>{'raw': token};
    final deviceId = driver.deviceId ?? 'unknown-device';
    final checkpoint =
        (payload['checkpoint']?.toString() ?? 'BOARDING').toUpperCase();
    final resolvedPatientId = payload['patientId'] ??
        payload['patientReference'] ??
        payload['patient_id'];
    final resolvedRouteId = (payload['routeId'] ??
            payload['route_id'] ??
            ctrl.activeRoute?['id'] ??
            driver.activeRoute?['id'])
        ?.toString();
    final resolvedValidationToken = payload['validationToken'] ??
        payload['validation_token'] ??
        payload['qrToken'] ??
        token;
    final resolvedSignature =
        payload['signature'] ?? payload['secureHash'] ?? payload['secure_hash'];
    final resolvedExpiresAt =
        payload['expiresAt'] ?? payload['expires_at'] ?? payload['expiration'];
    final eventPayload = {
      'qrToken': token,
      'validationToken': resolvedValidationToken,
      'validation_token': resolvedValidationToken,
      'tripId': payload['tripId'] ?? payload['trip_id'],
      'trip_id': payload['tripId'] ?? payload['trip_id'],
      'patientId': resolvedPatientId,
      'patient_id': resolvedPatientId,
      'patientReference': payload['patientReference'] ?? resolvedPatientId,
      'operationReference':
          payload['operationReference'] ?? payload['boardingCode'],
      'boardingCode': payload['operationReference'] ?? payload['boardingCode'],
      'expiration': payload['expiration'] ?? resolvedExpiresAt,
      'expiresAt': resolvedExpiresAt,
      'uniqueId': payload['uniqueId'],
      'secureHash': resolvedSignature,
      'secure_hash': resolvedSignature,
      'signature': resolvedSignature,
      'praemId': payload['praemId'] ?? payload['praem_id'],
      'praem_id': payload['praemId'] ?? payload['praem_id'],
      'operationId': payload['operationId'] ?? payload['operation_id'],
      'operation_id': payload['operationId'] ?? payload['operation_id'],
      'kind': payload['type'] ?? payload['kind'],
      'type': payload['type'] ?? payload['kind'],
      'checkpoint': checkpoint,
      'vehicleId': driver.vehicle?['id'],
      'routeId': resolvedRouteId,
      'route_id': resolvedRouteId,
      'deviceId': deviceId,
      'operatorId': auth.driverId,
      'source': 'TABLET_SMART_SCANNER',
      'sourceScreen': 'QrScannerScreen',
      'sourceAction': 'QR_SCAN',
      'endpoint': '/sync/offline-events',
      'timestamp': DateTime.now().toIso8601String(),
    };

    if (!validation.valid) {
      if (!mounted) return;
      setState(() {
        _error = validation.reason == 'ok' ? 'QR inválido' : validation.reason;
        _result = null;
      });
      HapticFeedback.lightImpact();
      return;
    }

    debugPrint(
      '[OPERATION][TRIP] QR boarding request routeId=${resolvedRouteId ?? 'null'} tripId=${payload['tripId'] ?? payload['trip_id'] ?? 'null'} checkpoint=$checkpoint source=QrScannerScreen',
    );
    await offline.enqueueQrScan(
      payload: eventPayload,
      deviceId: deviceId,
      operationId: resolvedRouteId,
      routeId: resolvedRouteId,
      tripId: payload['tripId']?.toString(),
    );
    await syncManager.syncAll();
    await ctrl.loadRoute();

    final syncError = syncManager.lastError;
    final scannedTripId =
        payload['tripId']?.toString() ?? payload['trip_id']?.toString();

    // Validate the actual trip state from the server snapshot
    bool confirmed = false;
    if (syncError == null) {
      if (scannedTripId != null) {
        final tripEntry = ctrl.patients.firstWhere(
          (p) => p['id']?.toString() == scannedTripId,
          orElse: () => <String, dynamic>{},
        );
        final newStatus =
            (tripEntry['status'] as String? ?? '').toUpperCase();
        confirmed = newStatus == 'BOARDING' ||
            newStatus == 'BOARDED' ||
            newStatus == 'IN_TRANSIT';
      } else {
        confirmed = true;
      }
    }

    debugPrint(
      '[QR_SCAN_RESULT] tripId=${scannedTripId ?? 'null'} '
      'patientId=${resolvedPatientId ?? 'null'} '
      'routeId=${resolvedRouteId ?? 'null'} '
      'apiSuccess=${syncError == null} confirmed=$confirmed '
      'message=${syncError ?? 'ok'}',
    );

    _clearTimer?.cancel();
    _clearTimer = Timer(const Duration(seconds: 6), () {
      if (!mounted) return;
      setState(() {
        _result = null;
        _error = null;
      });
    });

    if (!confirmed) {
      if (!mounted) return;
      setState(() {
        _error = _mapSyncError(syncError);
        _result = null;
      });
      HapticFeedback.lightImpact();
      return;
    }

    debugPrint(
      '[SYNC][TRIP] QR boarding refreshed routeId=${resolvedRouteId ?? 'null'} '
      'routeStatus=${ctrl.activeRoute?['status'] ?? 'null'} source=api_snapshot',
    );

    if (!mounted) return;
    setState(() {
      _result = {
        'name': payload['patientName']?.toString() ??
            payload['praemId']?.toString() ??
            payload['patientReference']?.toString() ??
            payload['patientId']?.toString() ??
            payload['patient_id']?.toString() ??
            '—',
        'destination': payload['operationReference']?.toString() ??
            payload['boardingCode']?.toString() ??
            '—',
        'status': 'SYNCED',
        'checkpoint': checkpoint,
        'tripId': scannedTripId,
        'routeId': resolvedRouteId,
      };
      _error = null;
    });
    HapticFeedback.mediumImpact();
    SystemSound.play(SystemSoundType.click);
  }

  String _mapSyncError(String? error) {
    if (error == null) return 'Embarque não confirmado pelo servidor';
    final e = error.toLowerCase();
    if (e.contains('trip not found') || e.contains('patient not found')) {
      return 'Paciente não encontrado';
    }
    if (e.contains('route not found')) return 'Rota não encontrada';
    if (e.contains('waiting_patient') || e.contains('not in') || e.contains('boarding')) {
      return 'Rota não está em embarque';
    }
    if (e.contains('already closed') ||
        e.contains('already completed') ||
        e.contains('already closed on server')) {
      return 'Viagem já encerrada';
    }
    if (e.contains('conflito') || e.contains('conflict')) {
      return 'Conflito operacional detectado';
    }
    if (e.contains('invalid') || e.contains('inválido')) return 'QR inválido';
    if (e.contains('falha') || e.contains('fail') || e.contains('error')) {
      return 'Falha ao sincronizar';
    }
    return 'Falha ao sincronizar';
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
                  style: const TextStyle(
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
                  style: const TextStyle(
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
