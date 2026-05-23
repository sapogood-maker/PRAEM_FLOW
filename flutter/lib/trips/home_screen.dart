// lib/trips/home_screen.dart
// ─────────────────────────────────────────────────────────────────────────────
// Main operational screen — shows active route, patient list, and action btns.
// Connects WebSocket and starts GPS tracking on init.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:dio/dio.dart';
import 'package:geolocator/geolocator.dart';
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
  bool _isOvernightRoute = false;

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
    if (tripStatus == 'BOARDED') return 'BOARDED';
    if (tripStatus == 'IN_TRANSIT' || tripStatus == 'IN_PROGRESS') return 'IN_TRANSIT';
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

  Future<void> _ensureGpsTracking({
    required AuthService auth,
    required DriverState driver,
    required GpsTrackingService gps,
    String? routeId,
  }) async {
    final vehicleId = driver.vehicle?['id'] as String? ?? auth.vehicle?['id'] as String?;
    final deviceId = driver.deviceId;
    if (vehicleId == null || deviceId == null || auth.token == null || auth.tenantId == null) {
      return;
    }
    await gps.start(
      vehicleId: vehicleId,
      tenantId: auth.tenantId!,
      deviceId: deviceId,
      authToken: auth.token!,
      routeId: routeId,
    );
  }

  String _displayStatusLabel(String status) {
    switch (status.toUpperCase()) {
      case 'CREATED':
      case 'SCHEDULED':
      case 'PLANNED':
      case 'PENDING':
      case 'PREPARING':
        return 'AGUARDANDO DESPACHO';
      case 'DISPATCHED':
        return 'ROTA DISPARADA';
      case 'DRIVER_ACCEPTED':
        return 'ROTA ACEITA';
      case 'WAITING_PATIENT':
        return 'AGUARDANDO PASSAGEIRO';
      case 'BOARDING':
        return 'EMBARQUE';
      case 'BOARDED':
        return 'EMBARCADO';
      case 'IN_TRANSIT':
      case 'IN_PROGRESS':
        return 'EM DESLOCAMENTO';
      case 'ARRIVED':
        return 'CHEGADA';
      case 'COMPLETED':
        return 'CONCLUÍDO';
      case 'NO_SHOW':
        return 'NÃO COMPARECEU';
      case 'CANCELLED':
        return 'CANCELADO';
      default:
        return 'OFFLINE';
    }
  }

  Color _displayStatusColor(String status) {
    switch (status.toUpperCase()) {
      case 'WAITING_PATIENT':
        return AppColors.warning;
      case 'BOARDING':
        return AppColors.boarding;
      case 'BOARDED':
        return AppColors.info;
      case 'IN_TRANSIT':
      case 'IN_PROGRESS':
        return AppColors.primary;
      case 'NO_SHOW':
      case 'CANCELLED':
        return AppColors.danger;
      case 'COMPLETED':
        return AppColors.completed;
      case 'ARRIVED':
        return AppColors.info;
      case 'DISPATCHED':
      case 'DRIVER_ACCEPTED':
        return AppColors.textSecondary;
      case 'CREATED':
      case 'SCHEDULED':
      case 'PLANNED':
      case 'PENDING':
      case 'PREPARING':
        return AppColors.textSecondary;
      default:
        return AppColors.textSecondary;
    }
  }

  bool _isBoardedPassenger(Map<String, dynamic> patient) {
    final status = (patient['status'] as String? ?? '').toUpperCase();
    return patient['boardedAt'] != null ||
        status == 'BOARDED' ||
        status == 'IN_PROGRESS' ||
        status == 'IN_TRANSIT' ||
        status == 'ARRIVED' ||
        status == 'COMPLETED';
  }

  bool _isMissingPassenger(Map<String, dynamic> patient) {
    final status = (patient['status'] as String? ?? '').toUpperCase();
    return status == 'NO_SHOW' || status == 'CANCELLED';
  }

  bool _isCompletedPassenger(Map<String, dynamic> patient) {
    final status = (patient['status'] as String? ?? '').toUpperCase();
    return status == 'COMPLETED';
  }

  String? _nextActionFor(String status, {required int boardedCount, required int pendingCount}) {
    switch (status.toUpperCase()) {
      case 'DISPATCHED':
        return 'ACEITAR ROTA';
      case 'DRIVER_ACCEPTED':
      case 'WAITING_PATIENT':
        return 'ESCANEAR PASSAGEIRO';
      case 'BOARDING':
        if (pendingCount > 0) return 'ESCANEAR PASSAGEIRO';
        return boardedCount > 0 ? 'CONFIRMAR EMBARCADO' : 'ESCANEAR PASSAGEIRO';
      case 'BOARDED':
        return 'INICIAR DESLOCAMENTO';
      case 'IN_TRANSIT':
      case 'IN_PROGRESS':
        return 'CHEGADA';
      case 'ARRIVED':
        return 'FINALIZAR ROTA';
      default:
        return null;
    }
  }

  String _nextActionHint(String status, {required int boardedCount, required int pendingCount}) {
    switch (status.toUpperCase()) {
      case 'DISPATCHED':
        return 'A rota está pronta para aceite.';
      case 'CREATED':
      case 'SCHEDULED':
      case 'PLANNED':
      case 'PENDING':
      case 'PREPARING':
        return 'Aguardando despacho da central.';
      case 'DRIVER_ACCEPTED':
      case 'WAITING_PATIENT':
        return 'Abra o scanner para confirmar o passageiro.';
      case 'BOARDING':
        if (boardedCount == 0) {
          return 'Escaneie o primeiro passageiro.';
        }
        if (pendingCount > 0) {
          return 'Confirme os passageiros já embarcados.';
        }
        return 'Pronto para confirmar embarque.';
      case 'BOARDED':
        return 'Todos os passageiros confirmados. Inicie o deslocamento.';
      case 'IN_TRANSIT':
      case 'IN_PROGRESS':
        return 'Siga até o destino da rota.';
      case 'ARRIVED':
        return 'Confirme a chegada e finalize a operação.';
      case 'COMPLETED':
        return 'Operação concluída com sucesso.';
      case 'NO_SHOW':
        return 'Registre os ausentes e encerre a etapa.';
      default:
        return 'Sem ação disponível no momento.';
    }
  }

  String _gpsOperationalLabel(Position? pos) {
    if (pos == null) return 'Aguardando sinal GPS';
    return 'Atualizado agora';
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
          _ensureGpsTracking(auth: auth, driver: driver, gps: gps, routeId: routeId);
        });
      }
    });

    ws.on('ws:connected', (_) async {
      debugPrint('[FLUTTER] socket reconnect callback');
      await _loadRoute(auth, driver);
      await _ensureGpsTracking(
        auth: auth,
        driver: driver,
        gps: gps,
        routeId: driver.activeRoute?['id'] as String?,
      );
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
        _ensureGpsTracking(auth: auth, driver: driver, gps: gps, routeId: routeId);
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
      _ensureGpsTracking(auth: auth, driver: driver, gps: gps, routeId: routeId);
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
        context.read<DriverState>().updateTripStatus(tripId, 'IN_TRANSIT');
        context.read<DriverState>().setOperationalStatus('IN_TRANSIT');
      }
    });

    ws.on('trip:boarded', (data) {
      if (!mounted) return;
      final event = data as Map?;
      final tripId = event?['tripId'] as String?;
      if (tripId != null) {
        context.read<DriverState>().updateTripStatus(tripId, 'BOARDED');
        context.read<DriverState>().setOperationalStatus('BOARDED');
      }
    });

    ws.on('trip:in_transit', (data) {
      if (!mounted) return;
      final event = data as Map?;
      final tripId = event?['tripId'] as String?;
      if (tripId != null) {
        context.read<DriverState>().updateTripStatus(tripId, 'IN_TRANSIT');
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
        context.read<DriverState>().updateTripStatus(tripId, 'BOARDED');
        context.read<DriverState>().setOperationalStatus('BOARDED');
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
      await _ensureGpsTracking(
        auth: auth,
        driver: driver,
        gps: gps,
        routeId: driver.activeRoute?['id'] as String?,
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
        if (mounted) setState(() => _isOvernightRoute = false);
        driver.setActiveRoute(foundRoute);
        await _loadPatients(auth, driver, foundRoute['id'] as String);
        await _loadStops(auth, driver, foundRoute['id'] as String);
        driver.setOperationalStatus(_deriveOperationalStatus(foundRoute, driver.patients));
      } else {
        // ── Overnight recovery: search last 7 days for stuck ACTIVE routes ──
        debugPrint('[OPS] no route today — searching for overnight stuck route driverId=$driverId');
        Map<String, dynamic>? stuckRoute;
        try {
          final sevenDaysAgo = DateTime.now().subtract(const Duration(days: 7)).toIso8601String().substring(0, 10);
          final yesterday = DateTime.now().subtract(const Duration(days: 1)).toIso8601String().substring(0, 10);
          for (final st in ['ACTIVE', 'DISPATCHED', 'PREPARING']) {
            final resp = await _dio.get(
              '${AppConfig.apiBaseUrl}/routes',
              queryParameters: {
                'startDate': sevenDaysAgo,
                'endDate': yesterday,
                'status': st,
                if (driverId != null) 'driverId': driverId,
              },
              options: Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
            );
            final data = resp.data;
            final items = (data is Map ? data['items'] : data) as List? ?? [];
            debugPrint('[OPS] overnight search status=$st items=${items.length}');
            if (items.isNotEmpty) {
              stuckRoute = Map<String, dynamic>.from(items.last as Map);
              break;
            }
          }
        } catch (e) {
          debugPrint('[OPS] overnight search error: $e');
        }

        if (stuckRoute != null) {
          debugPrint('[RECOVERY] overnight route found routeId=${stuckRoute['id']} status=${stuckRoute['status']}');
          if (mounted) setState(() => _isOvernightRoute = true);
          driver.setActiveRoute(stuckRoute);
          await _loadPatients(auth, driver, stuckRoute['id'] as String);
          await _loadStops(auth, driver, stuckRoute['id'] as String);
          driver.setOperationalStatus(_deriveOperationalStatus(stuckRoute, driver.patients));
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) _showRecoveryDialog(stuckRoute!);
          });
        } else {
          debugPrint('[FLUTTER] no active route found driverId=$driverId vehicleId=$vehicleId');
          if (mounted) setState(() => _isOvernightRoute = false);
          driver.setOperationalStatus('OFFLINE');
        }
      }
    } catch (e) {
      debugPrint('[FLUTTER] loadRoute error: $e');
    } finally {
      if (mounted) setState(() => _loadingRoute = false);
    }
  }

  void _showRecoveryDialog(Map<String, dynamic> route) {
    final routeDate = _formatDate(route['createdAt'] as String? ?? '');
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Row(
          children: const [
            Icon(Icons.warning_amber_rounded, color: Colors.orange, size: 24),
            SizedBox(width: 8),
            Text(
              'Viagem anterior detectada',
              style: TextStyle(color: AppColors.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        content: Text(
          'Rota do dia $routeDate ainda está ativa.\nO que deseja fazer?',
          style: const TextStyle(color: AppColors.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Continuar viagem', style: TextStyle(color: AppColors.primary)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.orange),
            onPressed: () {
              Navigator.of(context).pop();
              _forceFinalize();
            },
            child: const Text('Finalizar viagem', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  Future<void> _forceFinalize() async {
    final auth = context.read<AuthService>();
    final driver = context.read<DriverState>();
    final routeId = driver.activeRoute?['id'] as String?;
    if (routeId == null) return;
    debugPrint('[FINALIZE] force-finalize routeId=$routeId');
    try {
      final resp = await _dio.post(
        '${AppConfig.apiBaseUrl}/routes/$routeId/force-complete',
        options: Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
      );
      debugPrint('[FINALIZE] force-complete response status=${resp.statusCode} data=${resp.data}');
      driver.setOperationalStatus('COMPLETED');
      driver.clearActiveRoute();
      if (mounted) setState(() => _isOvernightRoute = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Viagem finalizada com sucesso'),
          backgroundColor: AppColors.primary,
        ));
      }
    } on DioException catch (e) {
      debugPrint('[FINALIZE] force-complete error status=${e.response?.statusCode} data=${e.response?.data}');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Erro ao finalizar viagem: ${e.response?.statusCode ?? 'sem conexão'}'),
          backgroundColor: AppColors.danger,
        ));
      }
    } catch (e) {
      debugPrint('[FINALIZE] force-complete unexpected error: $e');
    }
  }

  String _formatDate(String isoDate) {
    if (isoDate.isEmpty) return '?';
    try {
      final dt = DateTime.parse(isoDate).toLocal();
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}';
    } catch (_) {
      return isoDate.length >= 10 ? isoDate.substring(0, 10) : isoDate;
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
    final gps = context.read<GpsTrackingService>();
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
      } else if (status == 'BOARDED') {
        if (trip == null) return;
        actionUrl = '/trips/${trip['id']}/boarded';
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
      if (status == 'DRIVER_ACCEPTED' || status == 'WAITING_PATIENT') {
        await _ensureGpsTracking(
          auth: auth,
          driver: driver,
          gps: gps,
          routeId: routeId,
        );
      }
    } on DioException catch (e) {
      debugPrint('[FLUTTER] REST error status=${e.response?.statusCode} data=${e.response?.data} message=${e.message}');
      if (e.response == null) {
        final routeIdToUse = routeId ?? '';
        final tripIdToUse = trip?['id'] as String?;
        String? fallbackUrl;
        if ((status == 'DRIVER_ACCEPTED' || status == 'WAITING_PATIENT') && routeIdToUse.isNotEmpty) fallbackUrl = '/routes/$routeIdToUse/start';
        if (status == 'BOARDING' && tripIdToUse != null) fallbackUrl = '/trips/$tripIdToUse/board';
        if (status == 'BOARDED' && tripIdToUse != null) fallbackUrl = '/trips/$tripIdToUse/boarded';
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
          if (status == 'DRIVER_ACCEPTED' || status == 'WAITING_PATIENT') {
            await _ensureGpsTracking(
              auth: auth,
              driver: driver,
              gps: gps,
              routeId: routeIdToUse,
            );
          }
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
    final route = driver.activeRoute;
    final patients = driver.patients;
    final boardedPatients = patients.where(_isBoardedPassenger).toList();
    final missingPatients = patients.where(_isMissingPassenger).toList();
    final completedPatients = patients.where(_isCompletedPassenger).toList();
    final waitingPatients = patients.where((p) =>
        !_isBoardedPassenger(p) &&
        !_isMissingPassenger(p) &&
        !_isCompletedPassenger(p)).toList();
    final currentStatus = driver.operationalStatus.toUpperCase();
    final nextAction = _nextActionFor(
      currentStatus,
      boardedCount: boardedPatients.length,
      pendingCount: waitingPatients.length,
    );
    final showScanner = nextAction == 'ESCANEAR PASSAGEIRO';
    // Show emergency finalize for overnight routes, boarded passengers, or active IN_TRANSIT
    final showForceFinalize = _isOvernightRoute ||
        currentStatus == 'IN_TRANSIT' ||
        (currentStatus == 'BOARDED' && boardedPatients.isNotEmpty);
    final statusColor = _displayStatusColor(currentStatus);
    final routeTitle = route == null
        ? 'Sem rota ativa'
        : '${route['origin'] as String? ?? 'Origem'} → ${route['destination'] as String? ?? 'Destino'}';
    final gpsLabel = _gpsOperationalLabel(gps.lastPosition);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: Row(
          children: [
            const Icon(Icons.local_hospital_rounded,
                color: AppColors.primary, size: 20),
            const SizedBox(width: 8),
            const Text('Fluxo operacional',
                style: TextStyle(color: AppColors.textPrimary,
                    fontWeight: FontWeight.bold)),
            const Spacer(),
            StatusBadge(
                label: ws.connected ? 'CONEXÃO ATIVA' : 'SEM CONEXÃO',
                color: ws.connected ? AppColors.primary : AppColors.danger),
          ],
        ),
        automaticallyImplyLeading: false,
        actions: [
          IconButton(
            icon: const Icon(Icons.logout, color: AppColors.textSecondary),
            tooltip: 'Sair',
            onPressed: () async {
              final navigator = Navigator.of(context);
              context.read<GpsTrackingService>().stop();
              context.read<WsService>().disconnect();
              await context.read<AuthService>().logout();
              if (!mounted) return;
              navigator.pushReplacementNamed(AppRoutes.login);
            },
          ),
        ],
      ),
      body: _loadingRoute
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.primary))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _GuidedStatusCard(
                  statusLabel: _displayStatusLabel(currentStatus),
                  statusColor: statusColor,
                  routeTitle: routeTitle,
                  nextAction: nextAction ?? '',
                  nextActionHint: _nextActionHint(
                    currentStatus,
                    boardedCount: boardedPatients.length,
                    pendingCount: waitingPatients.length,
                  ),
                  boardedCount: boardedPatients.length,
                  pendingCount: waitingPatients.length,
                  missingCount: missingPatients.length,
                  completedCount: completedPatients.length,
                ),
                const SizedBox(height: 12),
                _NextActionCard(
                  currentStatus: currentStatus,
                  nextAction: nextAction,
                  showScanner: showScanner,
                  onAcceptRoute: () => _changeStatus('DRIVER_ACCEPTED'),
                  onOpenScanner: () => Navigator.pushNamed(context, AppRoutes.qrScanner),
                  onStartTransit: () => _changeStatus('IN_TRANSIT'),
                  onArrive: () => _changeStatus('ARRIVED'),
                  onComplete: () => _changeStatus('COMPLETED'),
                  onForceFinalize: showForceFinalize ? _forceFinalize : null,
                ),
                const SizedBox(height: 12),
                _PassengerOverviewCard(
                  boardedCount: boardedPatients.length,
                  waitingCount: waitingPatients.length,
                  missingCount: missingPatients.length,
                ),
                const SizedBox(height: 12),
                _PassengerGroupsCard(
                  boarded: boardedPatients,
                  waiting: waitingPatients,
                  missing: missingPatients,
                  completed: completedPatients,
                ),
                const SizedBox(height: 12),
                _GpsOperationalCard(
                  vehicle: driver.vehicle,
                  gpsLabel: gpsLabel,
                  position: gps.lastPosition,
                ),
                const SizedBox(height: 12),
                const _MapPlaceholderCard(),
              ],
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
      ('INICIAR EMBARQUE', 'BOARDING', Icons.people_rounded),
      ('CONFIRMAR EMBARCADO', 'BOARDED', Icons.verified_user_rounded),
      ('INICIAR TRÂNSITO', 'IN_TRANSIT', Icons.directions_car),
      ('CHEGADA', 'ARRIVED', Icons.local_hospital_rounded),
      ('FINALIZAR', 'COMPLETED', Icons.check_circle_rounded),
    ];
    bool enabledFor(String target) {
      if (!hasActiveRoute) return false;
      if ((target == 'BOARDING' || target == 'BOARDED' || target == 'IN_TRANSIT' || target == 'ARRIVED' || target == 'COMPLETED') && !hasActiveTrip) {
        return false;
      }
      switch (target) {
        case 'DRIVER_ACCEPTED':
          return currentStatus == 'DISPATCHED' || currentStatus == 'CREATED' || currentStatus == 'OFFLINE';
        case 'WAITING_PATIENT':
          return currentStatus == 'DRIVER_ACCEPTED';
        case 'BOARDING':
          return currentStatus == 'WAITING_PATIENT';
        case 'BOARDED':
          return currentStatus == 'BOARDING' && hasBoardedPassenger;
        case 'IN_TRANSIT':
          return currentStatus == 'BOARDED' && hasBoardedPassenger;
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
          StatusBadge(label: _label(status), color: statusColor(status)),
        ],
      ),
    );
  }

  String _label(String status) {
    switch (status.toUpperCase()) {
      case 'BOARDING':
        return 'Embarcando';
      case 'BOARDED':
        return 'EMBARCADO';
      case 'IN_PROGRESS':
      case 'IN_TRANSIT':
        return 'EM DESLOCAMENTO';
      case 'ARRIVED':
        return 'Chegou';
      case 'COMPLETED':
        return 'Concluído';
      case 'NO_SHOW':
        return 'Não compareceu';
      case 'CANCELLED':
        return 'Cancelado';
      default:
        return 'Aguardando';
    }
  }
}

class _GuidedStatusCard extends StatelessWidget {
  final String statusLabel;
  final Color statusColor;
  final String routeTitle;
  final String nextAction;
  final String nextActionHint;
  final int boardedCount;
  final int pendingCount;
  final int missingCount;
  final int completedCount;

  const _GuidedStatusCard({
    required this.statusLabel,
    required this.statusColor,
    required this.routeTitle,
    required this.nextAction,
    required this.nextActionHint,
    required this.boardedCount,
    required this.pendingCount,
    required this.missingCount,
    required this.completedCount,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: statusColor.withOpacity(0.35), width: 1.2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: statusColor,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  statusLabel,
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            routeTitle,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _miniStat('Embarcados', boardedCount, AppColors.primary),
              _miniStat('Aguardando', pendingCount, AppColors.warning),
              _miniStat('Ausentes', missingCount, AppColors.danger),
              _miniStat('Concluídos', completedCount, AppColors.completed),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            nextAction.isEmpty ? 'Sem próxima ação' : 'Próxima ação',
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 11,
              letterSpacing: 1,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            nextAction.isEmpty ? 'Acompanhe a operação.' : nextAction,
            style: TextStyle(
              color: statusColor,
              fontSize: 24,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            nextActionHint,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }

  Widget _miniStat(String label, int value, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withOpacity(0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value.toString(),
            style: TextStyle(
              color: color,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
          Text(
            label,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}

class _NextActionCard extends StatelessWidget {
  final String currentStatus;
  final String? nextAction;
  final bool showScanner;
  final VoidCallback onAcceptRoute;
  final VoidCallback onOpenScanner;
  final VoidCallback onStartTransit;
  final VoidCallback onArrive;
  final VoidCallback onComplete;
  final VoidCallback? onForceFinalize;

  const _NextActionCard({
    required this.currentStatus,
    required this.nextAction,
    required this.showScanner,
    required this.onAcceptRoute,
    required this.onOpenScanner,
    required this.onStartTransit,
    required this.onArrive,
    required this.onComplete,
    this.onForceFinalize,
  });

  @override
  Widget build(BuildContext context) {
    final action = nextAction ?? '';
    final child = _actionButton(
      label: action.isEmpty ? 'Sem ação' : action,
      onPressed: action == 'ACEITAR ROTA'
          ? onAcceptRoute
          : action == 'ESCANEAR PASSAGEIRO'
              ? onOpenScanner
              : action == 'INICIAR DESLOCAMENTO'
                  ? onStartTransit
                  : action == 'CHEGADA'
                      ? onArrive
                      : action == 'FINALIZAR ROTA'
                          ? onComplete
                          : null,
      color: action == 'ACEITAR ROTA'
          ? AppColors.warning
          : action == 'ESCANEAR PASSAGEIRO'
              ? AppColors.boarding
              : action == 'INICIAR DESLOCAMENTO'
                  ? AppColors.primary
                  : action == 'CHEGADA'
                      ? AppColors.info
                      : action == 'FINALIZAR ROTA'
                          ? AppColors.completed
                          : AppColors.surface,
      icon: action == 'ACEITAR ROTA'
          ? Icons.play_arrow_rounded
          : action == 'ESCANEAR PASSAGEIRO'
              ? Icons.qr_code_scanner
              : action == 'INICIAR DESLOCAMENTO'
                  ? Icons.directions_car
                  : action == 'CHEGADA'
                      ? Icons.place_rounded
                      : action == 'FINALIZAR ROTA'
                          ? Icons.check_circle_rounded
                          : Icons.remove_circle_outline,
      outlined: false,
    );

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'AÇÃO DE HOJE',
            style: TextStyle(
              color: AppColors.textSecondary,
              fontSize: 11,
              letterSpacing: 1,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 10),
          child,
          if (showScanner && action != 'ESCANEAR PASSAGEIRO') ...[
            const SizedBox(height: 10),
            _actionButton(
              label: 'ESCANEAR PASSAGEIRO',
              onPressed: onOpenScanner,
              color: AppColors.boarding,
              icon: Icons.qr_code_scanner,
              outlined: true,
            ),
          ],
          if (onForceFinalize != null) ...[
            const SizedBox(height: 10),
            _actionButton(
              label: 'FINALIZAR VIAGEM',
              onPressed: onForceFinalize,
              color: Colors.orange,
              icon: Icons.warning_amber_rounded,
              outlined: true,
            ),
          ],
        ],
      ),
    );
  }

  Widget _actionButton({
    required String label,
    required VoidCallback? onPressed,
    required Color color,
    required IconData icon,
    required bool outlined,
  }) {
    return OperationalButton(
      label: label,
      icon: icon,
      onPressed: onPressed,
      color: color,
      outlined: outlined,
    );
  }
}

class _PassengerOverviewCard extends StatelessWidget {
  final int boardedCount;
  final int waitingCount;
  final int missingCount;

  const _PassengerOverviewCard({
    required this.boardedCount,
    required this.waitingCount,
    required this.missingCount,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Expanded(child: _countTile('Embarcados', boardedCount, AppColors.primary)),
          const SizedBox(width: 8),
          Expanded(child: _countTile('Aguardando', waitingCount, AppColors.warning)),
          const SizedBox(width: 8),
          Expanded(child: _countTile('Ausentes', missingCount, AppColors.danger)),
        ],
      ),
    );
  }

  Widget _countTile(String label, int value, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        children: [
          Text(
            value.toString(),
            style: TextStyle(
              color: color,
              fontSize: 22,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}

class _PassengerGroupsCard extends StatelessWidget {
  final List<Map<String, dynamic>> boarded;
  final List<Map<String, dynamic>> waiting;
  final List<Map<String, dynamic>> missing;
  final List<Map<String, dynamic>> completed;

  const _PassengerGroupsCard({
    required this.boarded,
    required this.waiting,
    required this.missing,
    required this.completed,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'PASSAGEIROS',
            style: TextStyle(
              color: AppColors.textSecondary,
              fontSize: 11,
              letterSpacing: 1,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),
          if (boarded.isNotEmpty) ...[
            _section('Embarcados', boarded, AppColors.primary),
            const SizedBox(height: 12),
          ],
          if (waiting.isNotEmpty) ...[
            _section('Aguardando', waiting, AppColors.warning),
            const SizedBox(height: 12),
          ],
          if (missing.isNotEmpty) ...[
            _section('Não compareceu', missing, AppColors.danger),
            const SizedBox(height: 12),
          ],
          if (completed.isNotEmpty) _section('Concluídos', completed, AppColors.completed),
          if (boarded.isEmpty && waiting.isEmpty && missing.isEmpty && completed.isEmpty)
            const Text(
              'Nenhum passageiro disponível.',
              style: TextStyle(color: AppColors.textSecondary),
            ),
        ],
      ),
    );
  }

  Widget _section(String title, List<Map<String, dynamic>> items, Color color) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              title,
              style: TextStyle(
                color: color,
                fontSize: 13,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(width: 6),
            StatusBadge(label: items.length.toString(), color: color),
          ],
        ),
        const SizedBox(height: 8),
        for (final passenger in items) _PatientTile(patient: passenger),
      ],
    );
  }
}

class _GpsOperationalCard extends StatelessWidget {
  final Map<String, dynamic>? vehicle;
  final String gpsLabel;
  final Position? position;

  const _GpsOperationalCard({
    required this.vehicle,
    required this.gpsLabel,
    required this.position,
  });

  @override
  Widget build(BuildContext context) {
    final speed = position == null ? null : (position!.speed * 3.6);
    final accuracy = position?.accuracy;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'GEOLOCALIZAÇÃO',
            style: TextStyle(
              color: AppColors.textSecondary,
              fontSize: 11,
              letterSpacing: 1,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            vehicle != null
                ? '${vehicle!['plate'] ?? 'Veículo'} · ${vehicle!['model'] ?? ''}'
                : 'Sem veículo vinculado',
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontSize: 18,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            gpsLabel,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              StatusBadge(
                label: position == null ? 'SEM LEITURA' : 'SINAL AO VIVO',
                color: position == null ? AppColors.warning : AppColors.primary,
              ),
              if (speed != null)
                StatusBadge(
                  label: '${speed.toStringAsFixed(0)} KM/H',
                  color: AppColors.primary,
                ),
              if (accuracy != null)
                StatusBadge(
                  label: 'PRECISÃO ${accuracy.toStringAsFixed(0)} M',
                  color: AppColors.boarding,
                ),
            ],
          ),
          if (position == null) ...[
            const SizedBox(height: 12),
            const Text(
              'Aguardando primeira posição do veículo.',
              style: TextStyle(color: AppColors.textSecondary),
            ),
          ],
        ],
      ),
    );
  }
}

class _MapPlaceholderCard extends StatelessWidget {
  const _MapPlaceholderCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 160,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border, style: BorderStyle.solid),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'MAPA OPERACIONAL',
            style: TextStyle(
              color: AppColors.textSecondary,
              fontSize: 11,
              letterSpacing: 1,
              fontWeight: FontWeight.w700,
            ),
          ),
          SizedBox(height: 12),
          Expanded(
            child: Center(
              child: Text(
                'Espaço reservado para o mapa operacional em tempo real.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 14,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
