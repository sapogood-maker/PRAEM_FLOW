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

  Map<String, dynamic>? _activeTrip(DriverState driver) {
    for (final trip in driver.patients) {
      final status = trip['status'] as String? ?? 'SCHEDULED';
      if (status != 'COMPLETED' && status != 'CANCELLED' && status != 'NO_SHOW') {
        return trip;
      }
    }
    return null;
  }

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
    final vehicleId = driver.vehicle?['id'] as String?;

    // ─── Connect WS (join tenant + driver rooms) ──────────────────────────────
    ws.connect(
      auth.token!,
      auth.tenantId!,
      driverId: auth.driverId,
      vehicleId: vehicleId,
      deviceId: driver.deviceId,
    );

    // ─── Listen for new route dispatched to this driver ──────────────────────
    ws.on('route:dispatched', (data) {
      if (!mounted) return;
      final event = data as Map?;
      final driverId = event?['driverId'] as String?;
      if (driverId != null && driverId == auth.driverId) {
        final routeId = event?['routeId'] as String?;
        // Acknowledge receipt
        if (routeId != null) {
          ws.emitAck('route.received', routeId: routeId, status: 'RECEIVED');
        }
        // Reload route and auto-open trip screen
        _loadRoute(auth, driver).then((_) {
          if (!mounted) return;
          if (driver.activeRoute != null) {
            Navigator.pushNamed(context, AppRoutes.trip);
          }
        });
      }
    });

    ws.on('route.cancelled', (data) {
      if (!mounted) return;
      final event = data as Map?;
      final driverId = event?['driverId'] as String?;
      if (driverId == null || driverId == auth.driverId) {
        driver.clearActiveRoute();
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('⚠️ Rota cancelada pela central'),
          backgroundColor: Colors.red,
        ));
      }
    });

    ws.on('route:started', (data) {
      if (!mounted) return;
      final event = data as Map?;
      final routeId = event?['routeId'] as String?;
      if (routeId != null) {
        context.read<DriverState>().updateRouteStatus(routeId, 'ACTIVE');
        context.read<DriverState>().setOperationalStatus('START_ROUTE');
      }
    });

    ws.on('route.status_changed', (data) {
      if (!mounted) return;
      final event = data as Map?;
      final routeId = event?['routeId'] as String?;
      final status = event?['status'] as String?;
      if (routeId != null && status != null) {
        context.read<DriverState>().updateRouteStatus(routeId, status);
        if (status == 'COMPLETED') {
          context.read<DriverState>().setOperationalStatus('COMPLETED');
        }
      }
    });

    ws.on('route:completed', (data) {
      if (!mounted) return;
      final event = data as Map?;
      final routeId = event?['routeId'] as String?;
      if (routeId != null) {
        context.read<DriverState>().updateRouteStatus(routeId, 'COMPLETED');
        context.read<DriverState>().setOperationalStatus('COMPLETED');
      }
    });

    ws.on('operational.alert', (data) {
      if (!mounted) return;
      final alert = data as Map?;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(alert?['message']?.toString() ?? 'Alerta operacional'),
        backgroundColor: AppColors.warning,
      ));
    });

    // ─── Listen for patient boarding events (emitted by API after QR scan) ──
    ws.on('trip:boarding', (data) {
      if (!mounted) return;
      final event = data as Map?;
      final tripId = event?['tripId'] as String?;
      final routeId = event?['routeId'] as String?;
      if (tripId != null) {
        context.read<DriverState>().updateTripStatus(tripId, 'BOARDING');
        context.read<DriverState>().setOperationalStatus('BOARDING');
      }
      if (routeId != null) {
        context.read<DriverState>().updateRouteStatus(routeId, 'ACTIVE');
      }
    });

    ws.on('trip:started', (data) {
      if (!mounted) return;
      final event = data as Map?;
      final tripId = event?['tripId'] as String?;
      if (tripId != null) {
        context.read<DriverState>().updateTripStatus(tripId, 'IN_PROGRESS');
        context.read<DriverState>().setOperationalStatus('IN_TRANSIT');
      }
    });

    ws.on('trip:in_transit', (data) {
      if (!mounted) return;
      final event = data as Map?;
      final tripId = event?['tripId'] as String?;
      if (tripId != null) {
        context.read<DriverState>().updateTripStatus(tripId, 'IN_PROGRESS');
        context.read<DriverState>().setOperationalStatus('IN_TRANSIT');
      }
    });

    ws.on('trip:arrived', (data) {
      if (!mounted) return;
      final event = data as Map?;
      final tripId = event?['tripId'] as String?;
      if (tripId != null) {
        context.read<DriverState>().updateTripStatus(tripId, 'ARRIVED');
        context.read<DriverState>().setOperationalStatus('ARRIVED');
      }
    });

    ws.on('patient:boarded', (data) {
      if (!mounted) return;
      final event = data as Map?;
      final tripId = event?['tripId'] as String?;
      if (tripId != null) {
        context.read<DriverState>().updateTripStatus(tripId, 'BOARDING');
        context.read<DriverState>().setOperationalStatus('BOARDING');
      }
    });

    // ─── Listen for trip completed events ─────────────────────────────────
    ws.on('trip:completed', (data) {
      if (!mounted) return;
      final event = data as Map?;
      final tripId = event?['tripId'] as String?;
      if (tripId != null) {
        context.read<DriverState>().updateTripStatus(tripId, 'COMPLETED');
        context.read<DriverState>().setOperationalStatus('COMPLETED');
      }
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
    final driverId = auth.driverId;
    final vehicleId = driver.vehicle?['id'];
    if (driverId == null && vehicleId == null) {
      setState(() => _loadingRoute = false);
      return;
    }
    try {
      final today = DateTime.now().toIso8601String().substring(0, 10);
      // Search all non-terminal statuses — DISPATCHED covers new realtime dispatch
      final statuses = ['DISPATCHED', 'PLANNED', 'PREPARING', 'ACTIVE', 'SCHEDULED', 'PENDING'];
      Map<String, dynamic>? foundRoute;
      for (final st in statuses) {
        final params = <String, String>{
          'date': today,
          'status': st,
          if (driverId != null) 'driverId': driverId,
          if (vehicleId != null && driverId == null) 'vehicleId': vehicleId as String,
        };
        final resp = await _dio.get(
          '${AppConfig.apiBaseUrl}/routes',
          queryParameters: params,
          options: Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
        );
        final data = resp.data;
        final items = (data is Map ? data['items'] : data) as List? ?? [];
        if (items.isNotEmpty) {
          foundRoute = Map<String, dynamic>.from(items.first as Map);
          break;
        }
      }
      if (foundRoute != null) {
        driver.setActiveRoute(foundRoute);
        await _loadPatients(auth, driver, foundRoute['id'] as String);
        await _loadStops(auth, driver, foundRoute['id'] as String);
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

  Future<void> _loadStops(
      AuthService auth, DriverState driver, String routeId) async {
    try {
      // Fetch stops for all trips of this route
      final tripsResp = await _dio.get(
        '${AppConfig.apiBaseUrl}/trips',
        queryParameters: {'routeId': routeId},
        options: Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
      );
      final tripsData = tripsResp.data;
      final trips = (tripsData is Map ? tripsData['items'] : tripsData) as List? ?? [];

      final allStops = <Map<String, dynamic>>[];
      for (final trip in trips) {
        final tripId = (trip as Map)['id'] as String?;
        if (tripId == null) continue;
        try {
          final stopsResp = await _dio.get(
            '${AppConfig.apiBaseUrl}/trips/$tripId/stops',
            options: Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
          );
          final stopsData = stopsResp.data;
          final stops = (stopsData is List ? stopsData : (stopsData as Map?)?.values.first) as List? ?? [];
          allStops.addAll(stops.map((s) => Map<String, dynamic>.from(s as Map)));
        } catch (_) {}
      }

      // Sort by sequence
      allStops.sort((a, b) =>
          ((a['sequence'] as num?) ?? 0).compareTo((b['sequence'] as num?) ?? 0));
      driver.setStops(allStops);
    } catch (e) {
      debugPrint('[HomeScreen] loadStops error: $e');
    }
  }

  Future<void> _changeStatus(String status) async {
    final auth = context.read<AuthService>();
    final driver = context.read<DriverState>();
    final routeId = driver.activeRoute?['id'] as String?;
    final trip = _activeTrip(driver);

    try {
      if (status == 'START_ROUTE') {
        if (routeId == null) return;
        await _dio.post(
          '${AppConfig.apiBaseUrl}/routes/$routeId/start',
          options: Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
        );
      } else if (status == 'BOARDING') {
        if (trip == null) return;
        await _dio.post(
          '${AppConfig.apiBaseUrl}/trips/${trip['id']}/board',
          options: Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
        );
      } else if (status == 'IN_TRANSIT') {
        if (trip == null) return;
        await _dio.post(
          '${AppConfig.apiBaseUrl}/trips/${trip['id']}/in-transit',
          options: Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
        );
      } else if (status == 'ARRIVED') {
        if (trip == null) return;
        await _dio.post(
          '${AppConfig.apiBaseUrl}/trips/${trip['id']}/arrived',
          options: Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
        );
      } else if (status == 'COMPLETED') {
        if (trip == null) return;
        await _dio.post(
          '${AppConfig.apiBaseUrl}/trips/${trip['id']}/complete',
          options: Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
        );
      }
      driver.setOperationalStatus(status);
    } catch (e) {
      debugPrint('[HomeScreen] status change error: $e');
    }
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
                  _RouteCard(
                    route: driver.activeRoute,
                    currentStop: driver.currentStop,
                    nextStop: driver.nextStop,
                  ),
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
  final Map<String, dynamic>? currentStop;
  final Map<String, dynamic>? nextStop;
  const _RouteCard({required this.route, this.currentStop, this.nextStop});

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
                  const Spacer(),
                  GestureDetector(
                    onTap: () => Navigator.pushNamed(context, AppRoutes.trip),
                    child: const Text('VER DETALHES →',
                        style: TextStyle(
                            color: AppColors.primary,
                            fontSize: 11,
                            letterSpacing: 0.5)),
                  ),
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

                // ─── Current / next stop summary ───────────────────────────
                if (currentStop != null) ...[
                  const Divider(height: 20, color: AppColors.border),
                  Row(children: [
                    const Text('📍 ', style: TextStyle(fontSize: 14)),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('PARADA ATUAL',
                              style: TextStyle(
                                  color: AppColors.textSecondary,
                                  fontSize: 10,
                                  letterSpacing: 1)),
                          Text(
                            currentStop!['name'] as String? ?? '—',
                            style: const TextStyle(
                                color: AppColors.textPrimary,
                                fontSize: 14,
                                fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                    ),
                    StatusBadge(
                      label: _stopStatusPt(currentStop!['status'] as String? ?? 'PENDING'),
                      color: AppColors.warning,
                    ),
                  ]),
                ],
                if (nextStop != null) ...[
                  const SizedBox(height: 8),
                  Row(children: [
                    const Text('⏭️ ', style: TextStyle(fontSize: 13)),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('PRÓXIMA PARADA',
                              style: TextStyle(
                                  color: AppColors.textSecondary,
                                  fontSize: 10,
                                  letterSpacing: 1)),
                          Text(
                            nextStop!['name'] as String? ?? '—',
                            style: const TextStyle(
                                color: AppColors.textSecondary, fontSize: 13),
                          ),
                        ],
                      ),
                    ),
                  ]),
                ],
              ],
            ),
    );
  }

  String _stopStatusPt(String status) {
    switch (status) {
      case 'PENDING':
        return 'Pendente';
      case 'EN_ROUTE':
        return 'Em rota';
      case 'ARRIVED':
        return 'Chegou';
      case 'BOARDING':
        return 'Embarcando';
      case 'COMPLETED':
        return 'Concluída';
      case 'SKIPPED':
        return 'Pulada';
      default:
        return status;
    }
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
      ('INICIAR ROTA', 'START_ROUTE', Icons.play_arrow_rounded),
      ('EMBARCANDO', 'BOARDING', Icons.people_rounded),
      ('EM TRÂNSITO', 'IN_TRANSIT', Icons.directions_car),
      ('CHEGADA', 'ARRIVED', Icons.local_hospital_rounded),
      ('FINALIZAR', 'COMPLETED', Icons.check_circle_rounded),
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
