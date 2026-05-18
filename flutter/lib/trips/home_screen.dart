// lib/trips/home_screen.dart
// ─────────────────────────────────────────────────────────────────────────────
// Main operational screen — shows active route, patient list, and action btns.
// Connects WebSocket and starts GPS tracking on init.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:dio/dio.dart';
import '../auth/auth_service.dart';
import '../driver/driver_state.dart';
import '../websocket/ws_service.dart';
import '../tracking/gps_tracking_service.dart';
import '../config/app_config.dart';
import '../core/constants.dart';
import '../shared/widgets/operational_button.dart';
import '../shared/widgets/status_badge.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _dio = Dio();
  bool _loadingRoute = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _init());
  }

  Future<void> _init() async {
    final auth = context.read<AuthService>();
    final driver = context.read<DriverState>();
    final ws = context.read<WsService>();
    final gps = context.read<GpsTrackingService>();

    // ─── Connect WS ──────────────────────────────────────────────────────────
    ws.connect(auth.token!, auth.tenantId!);

    // ─── Listen for operational alerts ───────────────────────────────────────
    ws.on('operational.alert', (data) {
      if (!mounted) return;
      final alert = data as Map?;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(alert?['message']?.toString() ?? 'Alerta operacional'),
        backgroundColor: AppColors.warning,
      ));
    });

    // ─── Load today's route ──────────────────────────────────────────────────
    await _loadRoute(auth, driver);

    // ─── Start GPS tracking ──────────────────────────────────────────────────
    final vehicle = driver.vehicle;
    if (vehicle != null) {
      await gps.start(
        vehicleId: vehicle['id'] as String,
        tenantId: auth.tenantId!,
        deviceId: driver.deviceId ?? 'unknown',
        authToken: auth.token!,
      );
    }
  }

  Future<void> _loadRoute(AuthService auth, DriverState driver) async {
    final vehicleId = driver.vehicle?['id'];
    if (vehicleId == null) {
      setState(() => _loadingRoute = false);
      return;
    }
    try {
      final today = DateTime.now().toIso8601String().substring(0, 10);
      final resp = await _dio.get(
        '${AppConfig.apiBaseUrl}/routes',
        queryParameters: {
          'vehicleId': vehicleId,
          'date': today,
          'status': 'ACTIVE',
        },
        options:
            Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
      );
      final data = resp.data;
      final items = (data is Map ? data['items'] : data) as List? ?? [];
      if (items.isNotEmpty) {
        final route =
            Map<String, dynamic>.from(items.first as Map);
        driver.setActiveRoute(route);
        await _loadPatients(auth, driver, route['id'] as String);
      }
    } catch (e) {
      debugPrint('[HomeScreen] loadRoute error: $e');
    } finally {
      if (mounted) setState(() => _loadingRoute = false);
    }
  }

  Future<void> _loadPatients(
      AuthService auth, DriverState driver, String routeId) async {
    try {
      final resp = await _dio.get(
        '${AppConfig.apiBaseUrl}/trips',
        queryParameters: {'routeId': routeId},
        options:
            Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
      );
      final data = resp.data;
      final items = (data is Map ? data['items'] : data) as List? ?? [];
      driver.setPatients(
          items.map((t) => Map<String, dynamic>.from(t as Map)).toList());
    } catch (e) {
      debugPrint('[HomeScreen] loadPatients error: $e');
    }
  }

  Future<void> _changeStatus(String status) async {
    final auth = context.read<AuthService>();
    final driver = context.read<DriverState>();
    final ws = context.read<WsService>();
    final vehicleId = driver.vehicle?['id'] as String?;
    if (vehicleId == null) return;

    driver.setOperationalStatus(status);
    ws.emitStatusChange(vehicleId, status);

    // Persist via REST
    try {
      await _dio.post(
        '${AppConfig.apiBaseUrl}/tracking/offline-check',
        options:
            Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
      );
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final driver = context.watch<DriverState>();
    final ws = context.watch<WsService>();
    final gps = context.watch<GpsTrackingService>();

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: Row(
          children: [
            const Icon(Icons.local_hospital_rounded,
                color: AppColors.primary, size: 20),
            const SizedBox(width: 8),
            const Text('PRAEM OPS',
                style: TextStyle(color: AppColors.textPrimary,
                    fontWeight: FontWeight.bold)),
            const Spacer(),
            StatusBadge(
                label: ws.connected ? 'AO VIVO' : 'OFFLINE',
                color: ws.connected ? AppColors.primary : AppColors.danger),
          ],
        ),
        automaticallyImplyLeading: false,
        actions: [
          IconButton(
            icon: const Icon(Icons.qr_code_scanner,
                color: AppColors.primary),
            tooltip: 'Scan QR',
            onPressed: () =>
                Navigator.pushNamed(context, AppRoutes.qrScanner),
          ),
          IconButton(
            icon: const Icon(Icons.logout, color: AppColors.textSecondary),
            tooltip: 'Sair',
            onPressed: () async {
              context.read<GpsTrackingService>().stop();
              context.read<WsService>().disconnect();
              await context.read<AuthService>().logout();
              if (mounted) {
                Navigator.pushReplacementNamed(context, AppRoutes.login);
              }
            },
          ),
        ],
      ),
      body: _loadingRoute
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.primary))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // ─── Vehicle card ──────────────────────────────────────────
                  _VehicleCard(vehicle: driver.vehicle, gps: gps),
                  const SizedBox(height: 12),

                  // ─── Route card ────────────────────────────────────────────
                  _RouteCard(route: driver.activeRoute),
                  const SizedBox(height: 12),

                  // ─── Operational status buttons ────────────────────────────
                  _StatusButtons(
                    currentStatus: driver.operationalStatus,
                    onTap: _changeStatus,
                  ),
                  const SizedBox(height: 16),

                  // ─── Patient list ──────────────────────────────────────────
                  _PatientList(patients: driver.patients),
                ],
              ),
            ),
    );
  }
}

// ─── Vehicle card ─────────────────────────────────────────────────────────────
class _VehicleCard extends StatelessWidget {
  final Map<String, dynamic>? vehicle;
  final GpsTrackingService gps;
  const _VehicleCard({required this.vehicle, required this.gps});

  @override
  Widget build(BuildContext context) {
    final pos = gps.lastPosition;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          const Icon(Icons.directions_car,
              color: AppColors.primary, size: 40),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  vehicle != null
                      ? '${vehicle!['plate']} · ${vehicle!['model']}'
                      : 'Sem veículo',
                  style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 18,
                      fontWeight: FontWeight.bold),
                ),
                if (pos != null)
                  Text(
                    '${(pos.speed * 3.6).toStringAsFixed(0)} km/h · '
                    'GPS: ${pos.latitude.toStringAsFixed(4)}, '
                    '${pos.longitude.toStringAsFixed(4)}',
                    style: const TextStyle(
                        color: AppColors.textSecondary, fontSize: 13),
                  ),
              ],
            ),
          ),
          StatusBadge(
              label: gps.active ? 'GPS ON' : 'GPS OFF',
              color: gps.active ? AppColors.primary : AppColors.danger),
        ],
      ),
    );
  }
}

// ─── Route card ───────────────────────────────────────────────────────────────
class _RouteCard extends StatelessWidget {
  final Map<String, dynamic>? route;
  const _RouteCard({required this.route});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: route == null
          ? const Text('Sem rota ativa para hoje',
              style:
                  TextStyle(color: AppColors.textSecondary, fontSize: 15))
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  const Icon(Icons.route, color: AppColors.info, size: 20),
                  const SizedBox(width: 8),
                  const Text('ROTA ATIVA',
                      style: TextStyle(
                          color: AppColors.info,
                          fontSize: 12,
                          letterSpacing: 1)),
                ]),
                const SizedBox(height: 8),
                Text(route!['origin'] as String? ?? '—',
                    style: const TextStyle(
                        color: AppColors.textPrimary, fontSize: 15)),
                const Icon(Icons.arrow_downward,
                    color: AppColors.textSecondary, size: 16),
                Text(route!['destination'] as String? ?? '—',
                    style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 15,
                        fontWeight: FontWeight.bold)),
              ],
            ),
    );
  }
}

// ─── Status buttons ───────────────────────────────────────────────────────────
class _StatusButtons extends StatelessWidget {
  final String currentStatus;
  final void Function(String) onTap;
  const _StatusButtons(
      {required this.currentStatus, required this.onTap});

  @override
  Widget build(BuildContext context) {
    const statuses = [
      ('INICIAR ROTA', 'MOVING', Icons.play_arrow_rounded),
      ('EMBARCANDO', 'BOARDING', Icons.people_rounded),
      ('EM TRÂNSITO', 'MOVING', Icons.directions_car),
      ('CHEGADA', 'ARRIVED', Icons.local_hospital_rounded),
      ('FINALIZAR', 'IDLE', Icons.check_circle_rounded),
    ];
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final (label, status, icon) in statuses)
          SizedBox(
            width: (MediaQuery.of(context).size.width - 56) / 2,
            child: OperationalButton(
              label: label,
              icon: icon,
              onPressed: () => onTap(status),
              color: currentStatus == status
                  ? AppColors.primary
                  : AppColors.surface,
              outlined: currentStatus != status,
            ),
          ),
      ],
    );
  }
}

// ─── Patient list ─────────────────────────────────────────────────────────────
class _PatientList extends StatelessWidget {
  final List<Map<String, dynamic>> patients;
  const _PatientList({required this.patients});

  @override
  Widget build(BuildContext context) {
    if (patients.isEmpty) {
      return const Center(
        child: Text('Nenhum paciente na rota',
            style:
                TextStyle(color: AppColors.textSecondary, fontSize: 14)),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('PACIENTES (${patients.length})',
            style: const TextStyle(
                color: AppColors.textSecondary,
                fontSize: 12,
                letterSpacing: 1)),
        const SizedBox(height: 8),
        for (final p in patients) _PatientTile(patient: p),
      ],
    );
  }
}

class _PatientTile extends StatelessWidget {
  final Map<String, dynamic> patient;
  const _PatientTile({required this.patient});

  @override
  Widget build(BuildContext context) {
    final patientData = patient['patient'] as Map? ?? patient;
    final status = patient['status'] as String? ?? 'SCHEDULED';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          const Icon(Icons.person, color: AppColors.textSecondary, size: 28),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(patientData['name'] as String? ?? '—',
                    style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 16,
                        fontWeight: FontWeight.bold)),
                Text(patientData['address'] as String? ?? '—',
                    style: const TextStyle(
                        color: AppColors.textSecondary, fontSize: 12)),
              ],
            ),
          ),
          StatusBadge(label: status, color: statusColor(status)),
        ],
      ),
    );
  }
}
