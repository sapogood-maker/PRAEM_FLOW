// lib/trips/home_screen.dart
// ─────────────────────────────────────────────────────────────────────────────
// Main operational screen — shows active route, patient list, and action btns.
// Connects WebSocket and starts GPS tracking on init.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';
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
import '../offline/offline_queue.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _dio = Dio();
  bool _loadingRoute = true;
  Timer? _offlineSyncTimer;
  bool _dioLoggingConfigured = false;

  Map<String, dynamic>? _activeTrip(DriverState driver) {
    for (final trip in driver.patients) {
      final status = trip['status'] as String? ?? 'SCHEDULED';
      if (status != 'COMPLETED' && status != 'CANCELLED' && status != 'NO_SHOW') {
        return trip;
      }
    }
    return null;
  }

  String _deriveOperationalStatus(Map<String, dynamic>? route, List<Map<String, dynamic>> trips) {
    final routeStatus = route?['status'] as String?;
    final activeTrip = trips.firstWhere(
      (t) => !['COMPLETED', 'CANCELLED', 'NO_SHOW'].contains((t['status'] as String?) ?? ''),
      orElse: () => <String, dynamic>{},
    );
    final tripStatus = activeTrip['status'] as String?;

    if (tripStatus == 'BOARDING') return 'BOARDING';
    if (tripStatus == 'IN_PROGRESS') return 'IN_TRANSIT';
    if (tripStatus == 'ARRIVED') return 'ARRIVED';
    if (tripStatus == 'COMPLETED') return 'COMPLETED';
    if (tripStatus == 'NO_SHOW') return 'NO_SHOW';
    if (routeStatus == 'DISPATCHED') return 'DISPATCHED';
    if (routeStatus == 'ACTIVE') return 'WAITING_PATIENT';
    if (routeStatus == 'PLANNED' || routeStatus == 'SCHEDULED' || routeStatus == 'PENDING' || routeStatus == 'PREPARING') {
      return 'CREATED';
    }
    return 'OFFLINE';
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
    _configureDioLogging();

    // ─── Connect WS (join tenant + driver rooms) ──────────────────────────────
    debugPrint('[FLUTTER] WS connect tokenPresent=${auth.token != null} tenantId=${auth.tenantId} driverId=${auth.driverId} vehicleId=$vehicleId');
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
      debugPrint('[FLUTTER] socket response route:dispatched data=$data');
      final event = data as Map?;
      final driverId = event?['driverId'] as String?;
      if (driverId != null && driverId == auth.driverId) {
        context.read<DriverState>().setOperationalStatus('DISPATCHED');
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

    ws.on('ws:connected', (_) async {
      debugPrint('[FLUTTER] socket reconnect callback');
      await _loadRoute(auth, driver);
      await _syncOfflineQueues();
    });

    ws.on('ws:disconnected', (_) {
      debugPrint('[FLUTTER] socket disconnected callback');
    });

    ws.on('ops:state:replay', (data) {
      if (!mounted) return;
      debugPrint('[FLUTTER] socket response ops:state:replay data=$data');
      final replay = (data as Map?) ?? const {};
      final route = replay['route'];
      if (route is Map) {
        driver.setActiveRoute(Map<String, dynamic>.from(route));
        final trips = (route['trips'] as List?) ?? [];
        driver.setPatients(trips.map((t) => Map<String, dynamic>.from(t as Map)).toList());
        final allStops = <Map<String, dynamic>>[];
        for (final trip in trips) {
          final stops = (trip as Map)['stops'] as List? ?? [];
          allStops.addAll(stops.map((s) => Map<String, dynamic>.from(s as Map)));
        }
        allStops.sort((a, b) =>
            ((a['sequence'] as num?) ?? 0).compareTo((b['sequence'] as num?) ?? 0));
        driver.setStops(allStops);
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
        context.read<DriverState>().setOperationalStatus('DRIVER_ACCEPTED');
      }
    });

    ws.on('route:waiting_patient', (data) {
      if (!mounted) return;
      final event = data as Map?;
      final routeId = event?['routeId'] as String?;
      if (routeId != null) {
        context.read<DriverState>().updateRouteStatus(routeId, 'ACTIVE');
      }
      context.read<DriverState>().setOperationalStatus('WAITING_PATIENT');
    });

    ws.on('route.status_changed', (data) {
      if (!mounted) return;
      final event = data as Map?;
      final routeId = event?['routeId'] as String?;
      final status = event?['status'] as String?;
      if (routeId != null && status != null) {
        context.read<DriverState>().updateRouteStatus(routeId, status);
        if (status == 'DISPATCHED') {
          context.read<DriverState>().setOperationalStatus('DISPATCHED');
        }
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

    ws.on('operational:state_changed', (data) {
      if (!mounted) return;
      final event = data as Map?;
      final operationalState = event?['operationalState'] as String?;
      final routeId = event?['routeId'] as String?;
      final tripId = event?['tripId'] as String?;
      final status = event?['status'] as String?;
      if (routeId != null && event?['routeStatus'] is String) {
        context.read<DriverState>().updateRouteStatus(routeId, event!['routeStatus'] as String);
      }
      if (tripId != null && status != null) {
        context.read<DriverState>().updateTripStatus(tripId, status);
      }
      if (operationalState != null) {
        context.read<DriverState>().setOperationalStatus(operationalState);
      }
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

    ws.on('trip:no_show', (data) {
      if (!mounted) return;
      final event = data as Map?;
      final tripId = event?['tripId'] as String?;
      if (tripId != null) {
        context.read<DriverState>().updateTripStatus(tripId, 'NO_SHOW');
        context.read<DriverState>().setOperationalStatus('NO_SHOW');
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
    _offlineSyncTimer?.cancel();
    _offlineSyncTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      _syncOfflineQueues();
    });
  }

  Future<void> _syncOfflineQueues() async {
    final auth = context.read<AuthService>();
    if (!mounted || auth.token == null) return;
    await _syncOfflineQr(auth);
    await _syncOfflineOperational(auth);
  }

  Future<void> _syncOfflineQr(AuthService auth) async {
    final queue = context.read<OfflineQueue>();
    final pending = await queue.pendingQr();
    if (pending.isEmpty) return;

    final remaining = <Map<String, dynamic>>[];
    for (final payload in pending) {
      try {
        await _dio.post(
          '${AppConfig.apiBaseUrl}/patients/qr/scan',
          data: payload,
          options: Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
        );
      } on DioException catch (e) {
        if (e.response == null) {
          remaining.add(payload);
          remaining.addAll(pending.skip(pending.indexOf(payload) + 1));
          break;
        }
      }
    }
    await queue.replaceQr(remaining);
  }

  Future<void> _syncOfflineOperational(AuthService auth) async {
    final queue = context.read<OfflineQueue>();
    final pending = await queue.pendingOperational();
    if (pending.isEmpty) return;

    final remaining = <Map<String, dynamic>>[];
    for (final item in pending) {
      final url = item['url'] as String?;
      if (url == null) continue;
      try {
        await _dio.post(
          '${AppConfig.apiBaseUrl}$url',
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
    await queue.replaceOperational(remaining);
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
        debugPrint('[FLUTTER] route lookup status=$st items=${items.length}');
        if (items.isNotEmpty) {
          foundRoute = Map<String, dynamic>.from(items.first as Map);
          break;
        }
      }
      if (foundRoute != null) {
        debugPrint('[FLUTTER] active route loaded routeId=${foundRoute['id']} status=${foundRoute['status']}');
        driver.setActiveRoute(foundRoute);
        await _loadPatients(auth, driver, foundRoute['id'] as String);
        await _loadStops(auth, driver, foundRoute['id'] as String);
        driver.setOperationalStatus(_deriveOperationalStatus(foundRoute, driver.patients));
      } else {
        debugPrint('[FLUTTER] no active route found driverId=$driverId vehicleId=$vehicleId');
        driver.setOperationalStatus('OFFLINE');
      }
    } catch (e) {
      debugPrint('[FLUTTER] loadRoute error: $e');
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
      debugPrint('[FLUTTER] loadPatients error: $e');
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
        } catch (e) {
          debugPrint('[FLUTTER] loadStops tripId=$tripId error: $e');
        }
      }

      // Sort by sequence
      allStops.sort((a, b) =>
          ((a['sequence'] as num?) ?? 0).compareTo((b['sequence'] as num?) ?? 0));
      driver.setStops(allStops);
    } catch (e) {
      debugPrint('[FLUTTER] loadStops error: $e');
    }
  }

  Future<void> _changeStatus(String status) async {
    final auth = context.read<AuthService>();
    final driver = context.read<DriverState>();
    final ws = context.read<WsService>();
    final offlineQueue = context.read<OfflineQueue>();
    String? routeId = driver.activeRoute?['id'] as String?;
    Map<String, dynamic>? trip = _activeTrip(driver);
    debugPrint('[FLUTTER] button pressed status=$status routeId=$routeId tripId=${trip?['id']} wsConnected=${ws.connected}');

    try {
      await _syncOfflineQueues();
      if (routeId == null) {
        await _loadRoute(auth, driver);
        routeId = driver.activeRoute?['id'] as String?;
        trip = _activeTrip(driver);
      }

      if ((status == 'DRIVER_ACCEPTED' || status == 'WAITING_PATIENT') && routeId == null) {
        debugPrint('[FLUTTER] cannot proceed because routeId is null for status=$status');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Nenhuma rota ativa para iniciar'),
            backgroundColor: AppColors.warning,
          ));
        }
        return;
      }

      String? actionUrl;
      if (status == 'DRIVER_ACCEPTED' || status == 'WAITING_PATIENT') {
        actionUrl = '/routes/$routeId/start';
      } else if (status == 'BOARDING') {
        if (trip == null) return;
        actionUrl = '/trips/${trip['id']}/board';
      } else if (status == 'IN_TRANSIT') {
        if (trip == null) return;
        actionUrl = '/trips/${trip['id']}/in-transit';
      } else if (status == 'ARRIVED') {
        if (trip == null) return;
        actionUrl = '/trips/${trip['id']}/arrived';
      } else if (status == 'COMPLETED') {
        if (trip == null) return;
        actionUrl = '/trips/${trip['id']}/complete';
      }
      if (actionUrl == null) return;

      ws.emitDriverStatus(
        status,
        vehicleId: driver.vehicle?['id'] as String?,
        routeId: routeId,
      );
      debugPrint('[FLUTTER] websocket emit driver.status_changed status=$status routeId=$routeId tripId=${trip?['id']}');

      final payload = {
        'routeId': routeId,
        'tripId': trip?['id'],
        'status': status,
        'source': 'FLUTTER_BUTTON',
        'timestamp': DateTime.now().toIso8601String(),
      };
      debugPrint('[FLUTTER] REST request POST $actionUrl payload=$payload');
      final resp = await _dio.post(
        '${AppConfig.apiBaseUrl}$actionUrl',
        data: payload,
        options: Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
      );
      debugPrint('[FLUTTER] REST response POST $actionUrl status=${resp.statusCode} data=${resp.data}');
      driver.setOperationalStatus(status);
    } on DioException catch (e) {
      debugPrint('[FLUTTER] REST error status=${e.response?.statusCode} data=${e.response?.data} message=${e.message}');
      if (e.response == null) {
        final routeIdToUse = routeId ?? '';
        final tripIdToUse = trip?['id'] as String?;
        String? fallbackUrl;
        if ((status == 'DRIVER_ACCEPTED' || status == 'WAITING_PATIENT') && routeIdToUse.isNotEmpty) fallbackUrl = '/routes/$routeIdToUse/start';
        if (status == 'BOARDING' && tripIdToUse != null) fallbackUrl = '/trips/$tripIdToUse/board';
        if (status == 'IN_TRANSIT' && tripIdToUse != null) fallbackUrl = '/trips/$tripIdToUse/in-transit';
        if (status == 'ARRIVED' && tripIdToUse != null) fallbackUrl = '/trips/$tripIdToUse/arrived';
        if (status == 'COMPLETED' && tripIdToUse != null) fallbackUrl = '/trips/$tripIdToUse/complete';
        if (fallbackUrl != null) {
          await offlineQueue.enqueueOperational({
            'url': fallbackUrl,
            'status': status,
            'routeId': routeIdToUse,
            'tripId': tripIdToUse,
            'timestamp': DateTime.now().toIso8601String(),
          });
          debugPrint('[FLUTTER] offline queue enqueue status=$status url=$fallbackUrl');
          driver.setOperationalStatus(status);
        }
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Falha operacional: ${e.response?.statusCode ?? 'sem conexão'}'),
          backgroundColor: AppColors.warning,
        ));
      }
      debugPrint('[FLUTTER] status change error: $e');
    } catch (e) {
      debugPrint('[FLUTTER] status change error: $e');
    }
  }

  void _configureDioLogging() {
    if (_dioLoggingConfigured) return;
    _dioLoggingConfigured = true;
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          debugPrint('[FLUTTER] REST request ${options.method} ${options.uri} payload=${options.data}');
          handler.next(options);
        },
        onResponse: (response, handler) {
          debugPrint('[FLUTTER] REST response ${response.requestOptions.method} ${response.requestOptions.uri} status=${response.statusCode} data=${response.data}');
          handler.next(response);
        },
        onError: (error, handler) {
          debugPrint('[FLUTTER] REST error ${error.requestOptions.method} ${error.requestOptions.uri} status=${error.response?.statusCode} data=${error.response?.data}');
          handler.next(error);
        },
      ),
    );
  }

  @override
  void dispose() {
    _offlineSyncTimer?.cancel();
    super.dispose();
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
              if (!context.mounted) return;
              Navigator.pushReplacementNamed(context, AppRoutes.login);
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
                    hasActiveRoute: driver.activeRoute != null,
                    hasActiveTrip: _activeTrip(driver) != null,
                    hasBoardedPassenger: (() {
                      final trip = _activeTrip(driver);
                      if (trip == null) return false;
                      final status = (trip['status'] as String?) ?? '';
                      return trip['boardedAt'] != null || status == 'BOARDING' || status == 'IN_PROGRESS' || status == 'ARRIVED' || status == 'COMPLETED';
                    })(),
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
  final bool hasActiveRoute;
  final bool hasActiveTrip;
  final bool hasBoardedPassenger;
  final void Function(String) onTap;
  const _StatusButtons(
      {required this.currentStatus, required this.hasActiveRoute, required this.hasActiveTrip, required this.hasBoardedPassenger, required this.onTap});

  @override
  Widget build(BuildContext context) {
    const statuses = [
      ('ACEITAR ROTA', 'DRIVER_ACCEPTED', Icons.play_arrow_rounded),
      ('AGUARDAR PACIENTE', 'WAITING_PATIENT', Icons.person_search_rounded),
      ('CONFIRMAR EMBARQUE', 'BOARDING', Icons.people_rounded),
      ('INICIAR TRÂNSITO', 'IN_TRANSIT', Icons.directions_car),
      ('CHEGADA', 'ARRIVED', Icons.local_hospital_rounded),
      ('FINALIZAR', 'COMPLETED', Icons.check_circle_rounded),
    ];
    bool enabledFor(String target) {
      if (!hasActiveRoute) return false;
      if ((target == 'BOARDING' || target == 'IN_TRANSIT' || target == 'ARRIVED' || target == 'COMPLETED') && !hasActiveTrip) {
        return false;
      }
      switch (target) {
        case 'DRIVER_ACCEPTED':
          return currentStatus == 'DISPATCHED' || currentStatus == 'CREATED' || currentStatus == 'OFFLINE';
        case 'WAITING_PATIENT':
          return currentStatus == 'DRIVER_ACCEPTED';
        case 'BOARDING':
          return currentStatus == 'WAITING_PATIENT';
        case 'IN_TRANSIT':
          return currentStatus == 'BOARDING' && hasBoardedPassenger;
        case 'ARRIVED':
          return currentStatus == 'IN_TRANSIT';
        case 'COMPLETED':
          return currentStatus == 'ARRIVED';
        default:
          return false;
      }
    }
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final (label, target, icon) in statuses)
          SizedBox(
            width: (MediaQuery.of(context).size.width - 56) / 2,
            child: OperationalButton(
              label: label,
              icon: icon,
              onPressed: enabledFor(target) ? () => onTap(target) : null,
              color: currentStatus == target
                  ? AppColors.primary
                  : AppColors.surface,
              outlined: currentStatus != target,
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
