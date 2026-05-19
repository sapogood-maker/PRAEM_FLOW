// lib/qr/qr_scanner_screen.dart
// ─────────────────────────────────────────────────────────────────────────────
// QR scanner screen — scans patient QR token, validates with backend,
// displays name / destination / priority. NEVER shows CPF or sensitive data.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
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
  final _controller = MobileScannerController();
  final _dio = Dio();

  bool _scanning = true;
  bool _loading = false;
  Map<String, dynamic>? _result;
  String? _error;

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (!_scanning || _loading) return;
    final code = capture.barcodes.firstOrNull?.rawValue;
    if (code == null || code.isEmpty) return;

    setState(() {
      _scanning = false;
      _loading = true;
      _error = null;
      _result = null;
    });

    await _validateToken(code);
  }

  Future<void> _validateToken(String token) async {
    final auth = context.read<AuthService>();
    final driver = context.read<DriverState>();

    final payload = {
      'qrToken': token,
      'vehicleId': driver.vehicle?['id'],
      'routeId': driver.activeRoute?['id'],
      'deviceId': driver.deviceId,
      'source': 'TABLET',
      'timestamp': DateTime.now().toIso8601String(),
    };

    try {
      final resp = await _dio.post(
        '${AppConfig.apiBaseUrl}/patients/qr/validate',
        data: payload,
        options: Options(
          headers: {'Authorization': 'Bearer ${auth.token}'},
        ),
      );
      final data = resp.data as Map<String, dynamic>;
      setState(() {
        _result = {
          'name': data['patient']?['name'] ?? '—',
          'destination': data['patient']?['destination'] ?? '—',
          'priority': data['patient']?['clinicalRisk'] ?? '—',
          'status': data['status'] ?? 'SUCCESS',
          'tripId': data['tripId'],
        };
        _loading = false;
      });
    } on DioException catch (e) {
      if (e.response == null) {
        // Offline — queue for later sync
        await context.read<OfflineQueue>().enqueueQr({
          ...payload,
          'offline': true,
        });
        setState(() {
          _error = 'Sem conexão — scan salvo offline';
          _loading = false;
        });
      } else {
        setState(() {
          _error = 'QR inválido ou expirado';
          _loading = false;
        });
      }
    }
  }

  void _reset() {
    setState(() {
      _scanning = true;
      _loading = false;
      _result = null;
      _error = null;
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: const Text('Scan QR Paciente',
            style: TextStyle(color: AppColors.textPrimary)),
        iconTheme: const IconThemeData(color: AppColors.textPrimary),
      ),
      body: Column(
        children: [
          // ─── Camera ─────────────────────────────────────────────────────
          Expanded(
            flex: 3,
            child: _result != null || _loading
                ? const SizedBox()
                : MobileScanner(
                    controller: _controller,
                    onDetect: _onDetect,
                  ),
          ),

          // ─── Result / Error ──────────────────────────────────────────────
          Expanded(
            flex: 2,
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: _loading
                  ? const Center(
                      child: CircularProgressIndicator(
                          color: AppColors.primary))
                  : _result != null
                      ? _buildResult()
                      : _error != null
                          ? _buildError()
                          : const Center(
                              child: Text(
                                'Aponte a câmera para o QR do paciente',
                                style: TextStyle(
                                    color: AppColors.textSecondary,
                                    fontSize: 16),
                                textAlign: TextAlign.center,
                              ),
                            ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildResult() {
    final status = _result!['status'] as String;
    final color = status == 'SUCCESS' ? AppColors.primary : AppColors.warning;
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Icon(status == 'SUCCESS' ? Icons.check_circle : Icons.warning_rounded,
            color: color, size: 48),
        const SizedBox(height: 12),
        _infoRow('Paciente', _result!['name'] as String),
        _infoRow('Destino', _result!['destination'] as String),
        _infoRow('Prioridade', _result!['priority'] as String),
        const SizedBox(height: 20),
        OperationalButton(
          label: 'PRÓXIMO SCAN',
          icon: Icons.qr_code_scanner,
          onPressed: _reset,
        ),
      ],
    );
  }

  Widget _buildError() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.error_rounded, color: AppColors.danger, size: 48),
        const SizedBox(height: 12),
        Text(_error!,
            style: const TextStyle(
                color: AppColors.textPrimary, fontSize: 16),
            textAlign: TextAlign.center),
        const SizedBox(height: 20),
        OperationalButton(
          label: 'TENTAR NOVAMENTE',
          icon: Icons.refresh,
          onPressed: _reset,
          color: AppColors.warning,
        ),
      ],
    );
  }

  Widget _infoRow(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label,
                style: const TextStyle(
                    color: AppColors.textSecondary, fontSize: 14)),
            Text(value,
                style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 16,
                    fontWeight: FontWeight.bold)),
          ],
        ),
      );
}
