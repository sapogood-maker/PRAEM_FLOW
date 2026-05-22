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
import 'package:dio/dio.dart';

import '../auth/auth_service.dart';
import '../driver/driver_state.dart';
import '../config/app_config.dart';
import '../core/constants.dart';
import '../shared/widgets/operational_button.dart';
import '../offline/offline_queue.dart';

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
  final _dio = Dio();

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
    if (_lastToken == code && _lastScanAt != null && now.difference(_lastScanAt!) < const Duration(seconds: 2)) {
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

    await _flushQueuedQr(auth, offline);

    final payload = {
      'qrToken': token,
      'vehicleId': driver.vehicle?['id'],
      'routeId': driver.activeRoute?['id'],
      'deviceId': driver.deviceId,
      'source': 'TABLET_SMART_SCANNER',
      'timestamp': DateTime.now().toIso8601String(),
    };

    try {
      final resp = await _dio.post(
        '${AppConfig.apiBaseUrl}/patients/qr/scan',
        data: payload,
        options: Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
      );
      final data = resp.data as Map<String, dynamic>;
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
          'name': data['name'] ?? data['patient']?['name'] ?? '—',
          'destination': data['destination'] ?? data['queue']?['destination'] ?? '—',
          'status': 'SUCCESS',
          'tripId': data['tripId'],
          'routeId': data['routeId'],
        };
        _error = null;
      });
      HapticFeedback.mediumImpact();
      SystemSound.play(SystemSoundType.click);
    } on DioException catch (e) {
      if (e.response == null) {
        await offline.enqueueQr({
          ...payload,
          'offline': true,
        });
        if (!mounted) return;
        setState(() {
          _error = 'Sem conexão — scan salvo offline';
          _result = null;
        });
      } else {
        final responseBody = e.response?.data;
        final apiMessage = responseBody is Map ? responseBody['message']?.toString() : null;
        if (!mounted) return;
        setState(() {
          _error = apiMessage ?? 'QR inválido';
          _result = null;
        });
      }
      HapticFeedback.lightImpact();
    }
  }

  Future<void> _flushQueuedQr(AuthService auth, OfflineQueue offline) async {
    final pending = await offline.pendingQr();
    if (pending.isEmpty) return;
    final remaining = <Map<String, dynamic>>[];
    for (final item in pending) {
      try {
        await _dio.post(
          '${AppConfig.apiBaseUrl}/patients/qr/scan',
          data: item,
          options: Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
        );
      } on DioException catch (e) {
        if (e.response == null) {
          remaining.add(item);
          remaining.addAll(pending.skip(pending.indexOf(item) + 1));
          break;
        }
      }
    }
    await offline.replaceQr(remaining);
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
        title: const Text(
          'Scan Passenger QR',
          style: TextStyle(color: AppColors.textPrimary),
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
                      child: CircularProgressIndicator(color: AppColors.primary),
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
            const Row(
              children: [
                Icon(Icons.check_circle, color: AppColors.primary),
                SizedBox(width: 8),
                Text(
                  'Boarding confirmed',
                  style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold, fontSize: 16),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _line('Passenger', _result!['name'] as String? ?? '—'),
            _line('Destination', _result!['destination'] as String? ?? '—'),
            _line('Trip', (_result!['tripId'] ?? '—').toString()),
            const SizedBox(height: 12),
            const Text(
              'Continue scanning next passengers...',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
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
            const Row(
              children: [
                Icon(Icons.warning_amber_rounded, color: AppColors.warning),
                SizedBox(width: 8),
                Text(
                  'Operational validation failed',
                  style: TextStyle(color: AppColors.warning, fontWeight: FontWeight.bold),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: AppColors.textPrimary, fontSize: 14)),
            const Spacer(),
            OperationalButton(
              label: 'CLEAR MESSAGE',
              icon: Icons.clear,
              onPressed: () => setState(() => _error = null),
              color: AppColors.warning,
            ),
          ],
        ),
      );
    }

    return const Center(
      child: Text(
        'One-tap operational flow:\nOpen scanner -> scan passengers -> start transit',
        textAlign: TextAlign.center,
        style: TextStyle(color: AppColors.textSecondary, fontSize: 15),
      ),
    );
  }

  Widget _line(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
