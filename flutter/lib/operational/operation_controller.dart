// lib/operational/operation_controller.dart
// Central operational controller for the PRAEM driver app.
// Owns state machine, route/patient data, WS event handling,
// lifecycle management, and action dispatch.

import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:dio/dio.dart';
import '../auth/auth_service.dart';
import '../driver/driver_state.dart';
import '../websocket/ws_service.dart';
import '../tracking/gps_tracking_service.dart';
import '../offline/offline_queue.dart';
import '../config/app_config.dart';
import '../navigation/navigation_service.dart';
import 'operation_state.dart';
import 'local_store.dart';
import 'sync_manager.dart';

class OperationController extends ChangeNotifier with WidgetsBindingObserver {
  final AuthService _auth;
  final DriverState _driverState;
  final WsService _ws;
  final GpsTrackingService _gps;
  final OfflineQueue _offlineQueue;
  final LocalStore _localStore;
  final SyncManager _syncManager;
  final Dio _dio = Dio();

  OperationalState _state = OperationalState.offline;
  Map<String, dynamic>? _activeRoute;
  List<Map<String, dynamic>> _patients = [];
  List<Map<String, dynamic>> _stops = [];
  bool _loading = false;
  bool _actionInProgress = false;
  Timer? _offlineSyncTimer;
  String? _lastError;
  String? _staleRecoveryAcknowledgedRouteId;

  // ─── Getters ────────────────────────────────────────────────────────────────

  OperationalState get state => _state;
  Map<String, dynamic>? get activeRoute => _activeRoute;
  List<Map<String, dynamic>> get patients => List.unmodifiable(_patients);
  List<Map<String, dynamic>> get stops => List.unmodifiable(_stops);
  bool get loading => _loading;
  bool get actionInProgress => _actionInProgress;
  String? get lastError => _lastError;
  bool get hasActiveRoute => _activeRoute != null;
  String get staleLevel {
    final topLevel = _activeRoute?['staleLevel'] as String?;
    final policy = _activeRoute?['stalePolicy'];
    final policyMap = policy is Map ? Map<String, dynamic>.from(policy) : null;
    final nested = policyMap?['level'] as String?;
    return (topLevel ?? nested ?? 'FRESH').toUpperCase();
  }
  int get staleElapsedHours {
    final top = _activeRoute?['staleHours'];
    final policy = _activeRoute?['stalePolicy'];
    final policyMap = policy is Map ? Map<String, dynamic>.from(policy) : null;
    final nested = policyMap?['elapsedHours'];
    final value = top ?? nested;
    if (value is num) return value.toInt();
    return 0;
  }
  bool get isStaleRoute {
    if (_activeRoute == null) return false;
    if (_activeRoute?['isStale'] == true) return true;
    final routeDateRaw = _activeRoute?['date'] as String?;
    if (routeDateRaw == null) return false;
    final routeDate = DateTime.tryParse(routeDateRaw);
    if (routeDate == null) return false;
    final now = DateTime.now();
    final elapsed = now.difference(routeDate.toLocal()).inHours;
    return elapsed > 12;
  }
  bool get hasInTransitPassengers => _patients.any((p) {
        final s = (p['status'] as String? ?? '').toUpperCase();
        return s == 'IN_TRANSIT' || s == 'IN_PROGRESS';
      });
  bool get hasBoardedPassengers => _patients.any(_isBoarded);
  bool get hasUnresolvedTrips => _patients.any((p) {
        final s = (p['status'] as String? ?? '').toUpperCase();
        return s != 'COMPLETED' && s != 'CANCELLED' && s != 'NO_SHOW';
      });
  bool get hasUnresolvedRoute {
    if (_activeRoute == null) return false;
    final status = (_activeRoute?['status'] as String? ?? '').toUpperCase();
    return status != 'COMPLETED' && status != 'CANCELLED';
  }
  bool get mustShowFinalizeOperation =>
      hasActiveRoute && (isStaleRoute || hasBoardedPassengers || hasInTransitPassengers || hasUnresolvedRoute || hasUnresolvedTrips);
  bool get requiresStaleRecoveryScreen {
    final routeId = _activeRoute?['id'] as String?;
    if (routeId == null) return false;
    final acknowledged = _staleRecoveryAcknowledgedRouteId == routeId;
    return isStaleRoute && hasUnresolvedRoute && !acknowledged;
  }

  /// True when the current state is a primary boarding state (direct scanner access).
  bool get isQrScanningValid => _state == OperationalState.waitingPatient ||
      _state == OperationalState.boarding ||
      _state == OperationalState.boarded;

  /// PT-BR contextual warning when QR scanning is allowed but state is non-primary.
  /// Null when scanning is fully valid (no warning needed).
  String? get qrScanningWarning {
    if (!hasActiveRoute) return null;
    if (isQrScanningValid) return null;
    switch (_state) {
      case OperationalState.dispatched:
      case OperationalState.driverAccepted:
        return 'Rota ainda não iniciada. Confirme o aceite antes de escanear.';
      case OperationalState.inTransit:
        return 'Em deslocamento — escaneie para embarque em parada intermediária.';
      case OperationalState.arrived:
        return 'Chegada registrada. Escaneie para confirmar desembarque se necessário.';
      case OperationalState.noShow:
        return 'Passageiro marcado como não comparecido. Escaneie para reclassificar.';
      case OperationalState.completed:
        return 'Operação concluída. Scanner disponível apenas para revisão.';
      default:
        return 'Não há embarque pendente nesta operação.';
    }
  }

  /// True when QR action buttons should be visible (boarding, boarded states with active route)
  bool get canPerformQrAction =>
      hasActiveRoute && (
        _state == OperationalState.boarding ||
        _state == OperationalState.boarded ||
        _state == OperationalState.waitingPatient
      );

  /// Navigation destination based on current operational state.
  /// - Pre-boarding: first pending patient with coords → PATIENT_PICKUP
  /// - Boarding/boarded/in-transit: next TripStop with coords → HOSPITAL/RETURN
  /// - Arrived: first return/dropoff stop → RETURN
  /// Returns null when no navigation coordinates are available.
  OpsNavDestination? get currentOpsNavDestination {
    if (!hasActiveRoute) return null;
    switch (_state) {
      case OperationalState.dispatched:
      case OperationalState.driverAccepted:
      case OperationalState.waitingPatient:
      case OperationalState.boarding:
        for (final trip in _patients) {
          final s = (trip['status'] as String? ?? '').toUpperCase();
          if (['COMPLETED', 'CANCELLED', 'NO_SHOW', 'ARRIVED'].contains(s)) continue;
          final patient = (trip['patient'] as Map?) ?? trip;
          final lat = (patient['lat'] as num?)?.toDouble();
          final lng = (patient['lng'] as num?)?.toDouble();
          if (lat != null && lng != null) {
            debugPrint('[NAVIGATION] pickup dest: ${patient['name']} lat=$lat lng=$lng');
            return OpsNavDestination(
              type: OpsNavDestType.patientPickup,
              name: (patient['name'] as String?) ?? 'Paciente',
              address: patient['address'] as String?,
              lat: lat,
              lng: lng,
            );
          }
        }
        break;
      case OperationalState.boarded:
      case OperationalState.inTransit:
        final stop = currentStop;
        if (stop != null) {
          final lat = (stop['lat'] as num?)?.toDouble();
          final lng = (stop['lng'] as num?)?.toDouble();
          if (lat != null && lng != null) {
            final typeRaw = (stop['type'] as String? ?? '').toUpperCase();
            debugPrint('[NAVIGATION] stop dest: ${stop['name']} type=$typeRaw lat=$lat lng=$lng');
            return OpsNavDestination(
              type: ['RETURN', 'DROPOFF'].contains(typeRaw)
                  ? OpsNavDestType.returnDest
                  : OpsNavDestType.hospital,
              name: (stop['name'] as String?) ?? 'Destino',
              address: stop['address'] as String?,
              lat: lat,
              lng: lng,
            );
          }
        }
        // Fallback: API-computed OpsNavDestination on the route object
        final apiDest = OpsNavDestination.fromMap(
          _activeRoute?['OpsNavDestination'] as Map<String, dynamic>?,
        );
        if (apiDest != null) {
          debugPrint('[NAVIGATION] api dest fallback: ${apiDest.name}');
          return apiDest;
        }
        break;
      case OperationalState.arrived:
        for (final stop in _stops) {
          final type = (stop['type'] as String? ?? '').toUpperCase();
          final status = (stop['status'] as String? ?? '').toUpperCase();
          if (!['RETURN', 'DROPOFF'].contains(type)) continue;
          if (['COMPLETED', 'SKIPPED'].contains(status)) continue;
          final lat = (stop['lat'] as num?)?.toDouble();
          final lng = (stop['lng'] as num?)?.toDouble();
          if (lat != null && lng != null) {
            debugPrint('[NAVIGATION] return dest: ${stop['name']} lat=$lat lng=$lng');
            return OpsNavDestination(
              type: OpsNavDestType.returnDest,
              name: (stop['name'] as String?) ?? 'Retorno',
              address: stop['address'] as String?,
              lat: lat,
              lng: lng,
            );
          }
        }
        break;
      default:
        break;
    }
    return null;
  }

  int get boardedCount => _patients.where(_isBoarded).length;
  int get pendingBoardingCount => _patients.where((p) {
        final s = (p['status'] as String? ?? '').toUpperCase();
        return s != 'BOARDING' &&
            s != 'IN_PROGRESS' &&
            s != 'IN_TRANSIT' &&
            s != 'ARRIVED' &&
            s != 'COMPLETED' &&
            s != 'NO_SHOW' &&
            s != 'CANCELLED';
      }).length;

  Map<String, dynamic>? get currentStop {
    final pending = _stops.where((s) {
      final st = s['status'] as String?;
      return st != 'COMPLETED' && st != 'SKIPPED';
    }).toList();
    if (pending.isEmpty) return null;
    pending.sort((a, b) =>
        ((a['sequence'] as num?) ?? 0).compareTo((b['sequence'] as num?) ?? 0));
    return pending.first;
  }

  /// PT-BR label for next driver action.
  String? get nextActionLabel {
    switch (_state) {
      case OperationalState.dispatched:
        return 'ACEITAR ROTA';
      case OperationalState.driverAccepted:
      case OperationalState.waitingPatient:
        return 'ESCANEAR PASSAGEIRO';
      case OperationalState.boarding:
        if (pendingBoardingCount > 0) return 'ESCANEAR PRÓXIMO';
        return boardedCount > 0 ? 'INICIAR DESLOCAMENTO' : 'ESCANEAR PASSAGEIRO';
      case OperationalState.boarded:
        return 'INICIAR DESLOCAMENTO';
      case OperationalState.inTransit:
        return 'REGISTRAR CHEGADA';
      case OperationalState.arrived:
        return 'FINALIZAR ROTA';
      default:
        return null;
    }
  }

  /// PT-BR hint text for current state.
  String get nextActionHint {
    switch (_state) {
      case OperationalState.offline:
        if (isStaleRoute) return 'Operação anterior detectada. Ação obrigatória de recuperação.';
        return 'Sem rota ativa no momento.';
      case OperationalState.created:
        return 'Aguardando despacho da central.';
      case OperationalState.dispatched:
        return 'Nova rota disponível. Aceite para iniciar.';
      case OperationalState.driverAccepted:
        return 'Dirija-se ao ponto de embarque.';
      case OperationalState.waitingPatient:
        return 'Aguardando passageiro. Abra o scanner para confirmar.';
      case OperationalState.boarding:
        if (boardedCount == 0) return 'Escaneie o QR do primeiro passageiro.';
        if (pendingBoardingCount > 0) return 'Confirme os demais embarques.';
        return 'Todos os passageiros embarcados. Pronto para partir.';
      case OperationalState.boarded:
        return 'Todos embarcados. Inicie o deslocamento.';
      case OperationalState.inTransit:
        return 'Em deslocamento ao destino.';
      case OperationalState.arrived:
        return 'Chegou ao destino. Confirme para encerrar.';
      case OperationalState.completed:
        return 'Operação concluída com sucesso.';
      case OperationalState.noShow:
        return 'Passageiro não compareceu.';
    }
  }

  bool _isBoarded(Map<String, dynamic> p) {
    final s = (p['status'] as String? ?? '').toUpperCase();
    return p['boardedAt'] != null ||
        s == 'BOARDING' ||
        s == 'IN_PROGRESS' ||
        s == 'IN_TRANSIT' ||
        s == 'ARRIVED' ||
        s == 'COMPLETED';
  }

  Map<String, dynamic>? get _activeTrip {
    for (final trip in _patients) {
      final status = (trip['status'] as String? ?? '').toUpperCase();
      if (status != 'COMPLETED' && status != 'CANCELLED' && status != 'NO_SHOW') {
        return trip;
      }
    }
    return null;
  }

  // ─── Constructor ────────────────────────────────────────────────────────────

  OperationController({
    required AuthService auth,
    required DriverState driverState,
    required WsService ws,
    required GpsTrackingService gps,
    required OfflineQueue offlineQueue,
    required LocalStore localStore,
    required SyncManager syncManager,
  })  : _auth = auth,
        _driverState = driverState,
        _ws = ws,
        _gps = gps,
        _offlineQueue = offlineQueue,
        _localStore = localStore,
        _syncManager = syncManager;

  // ─── Init ────────────────────────────────────────────────────────────────────

  Future<void> init() async {
    WidgetsBinding.instance.addObserver(this);

    // Restore persisted state
    _state = _localStore.loadOperationalState();
    _activeRoute = _localStore.loadRoute();
    _patients = _localStore.loadPatients();
    _stops = _localStore.loadStops();
    await _restoreOfflineSnapshot();

    debugPrint(
        '[OPS] init — restored state=${operationalStateToString(_state)} routeId=${_activeRoute?['id']}');

    _attachWsListeners();
    _startSyncTimer();

    notifyListeners();
  }

  // ─── WS event listeners ──────────────────────────────────────────────────────

  void _attachWsListeners() {
    _ws.on('ws:connected', (_) async {
      debugPrint('[OPS] WS reconnected — refreshing state');
      await loadRoute();
      _ensureGps();
    });

    _ws.on('route:dispatched', (data) {
      final event = data as Map? ?? {};
      final driverId = event['driverId'] as String?;
      if (driverId != null && driverId != _auth.driverId) return;
      debugPrint('[OPS] route:dispatched routeId=${event['routeId']}');
      _transition(OperationalState.dispatched);
      final routeId = event['routeId'] as String?;
      if (routeId != null) {
        _ws.emitAck('route.received', routeId: routeId, status: 'RECEIVED');
      }
      loadRoute().then((_) => _ensureGps(routeId: routeId));
    });

    _ws.on('route.dispatched', (data) {
      final event = data as Map? ?? {};
      final driverId = event['driverId'] as String?;
      if (driverId != null && driverId != _auth.driverId) return;
      _transition(OperationalState.dispatched);
      loadRoute();
    });

    _ws.on('route:started', (data) {
      final event = data as Map? ?? {};
      final routeId = event['routeId'] as String?;
      if (routeId != null) _updateRouteStatus(routeId, 'ACTIVE');
      _transition(OperationalState.driverAccepted);
    });

    _ws.on('route:waiting_patient', (data) {
      final event = data as Map? ?? {};
      final routeId = event['routeId'] as String?;
      if (routeId != null) _updateRouteStatus(routeId, 'ACTIVE');
      _transition(OperationalState.waitingPatient);
    });

    _ws.on('route.status_changed', (data) {
      final event = data as Map? ?? {};
      final routeId = event['routeId'] as String?;
      final status = event['status'] as String?;
      if (routeId != null && status != null) {
        _updateRouteStatus(routeId, status);
        if (status == 'DISPATCHED') _transition(OperationalState.dispatched);
        if (status == 'COMPLETED') _transition(OperationalState.completed);
        if (status == 'ACTIVE') _transition(OperationalState.driverAccepted);
      }
    });

    _ws.on('route:completed', (data) {
      final event = data as Map? ?? {};
      final routeId = event['routeId'] as String?;
      if (routeId != null) _updateRouteStatus(routeId, 'COMPLETED');
      _transition(OperationalState.completed);
    });

    _ws.on('route.completed', (data) {
      final event = data as Map? ?? {};
      final routeId = event['routeId'] as String?;
      if (routeId != null) _updateRouteStatus(routeId, 'COMPLETED');
      _transition(OperationalState.completed);
    });

    _ws.on('route.cancelled', (data) {
      final event = data as Map? ?? {};
      final driverId = event['driverId'] as String?;
      if (driverId == null || driverId == _auth.driverId) {
        debugPrint('[OPS] route cancelled by central');
        _clearRoute();
      }
    });

    _ws.on('trip:boarding', (data) {
      final event = data as Map? ?? {};
      final tripId = event['tripId'] as String?;
      if (tripId != null) _updateTripStatus(tripId, 'BOARDING');
      _transition(OperationalState.boarding);
    });

    _ws.on('patient:boarded', (data) {
      final event = data as Map? ?? {};
      final tripId = event['tripId'] as String?;
      if (tripId != null) _updateTripStatus(tripId, 'BOARDING');
      _transition(OperationalState.boarding);
    });

    _ws.on('trip:started', (data) {
      final event = data as Map? ?? {};
      final tripId = event['tripId'] as String?;
      if (tripId != null) _updateTripStatus(tripId, 'IN_TRANSIT');
      _transition(OperationalState.inTransit);
    });

    _ws.on('trip:in_transit', (data) {
      final event = data as Map? ?? {};
      final tripId = event['tripId'] as String?;
      if (tripId != null) _updateTripStatus(tripId, 'IN_TRANSIT');
      _transition(OperationalState.inTransit);
    });

    _ws.on('trip:arrived', (data) {
      final event = data as Map? ?? {};
      final tripId = event['tripId'] as String?;
      if (tripId != null) _updateTripStatus(tripId, 'ARRIVED');
      _transition(OperationalState.arrived);
    });

    _ws.on('trip:completed', (data) {
      final event = data as Map? ?? {};
      final tripId = event['tripId'] as String?;
      if (tripId != null) _updateTripStatus(tripId, 'COMPLETED');
      if (_patients.every((p) {
        final s = (p['status'] as String? ?? '').toUpperCase();
        return s == 'COMPLETED' || s == 'CANCELLED' || s == 'NO_SHOW';
      })) {
        _transition(OperationalState.completed);
      }
    });

    _ws.on('trip:no_show', (data) {
      final event = data as Map? ?? {};
      final tripId = event['tripId'] as String?;
      if (tripId != null) _updateTripStatus(tripId, 'NO_SHOW');
      _transition(OperationalState.noShow);
    });

    _ws.on('ops:state:replay', (data) {
      final replay = (data as Map? ?? {});
      final route = replay['route'];
      if (route is Map) {
        _activeRoute = Map<String, dynamic>.from(route);
        final trips = (route['trips'] as List?) ?? [];
        _patients =
            trips.map((t) => Map<String, dynamic>.from(t as Map)).toList();
        final allStops = <Map<String, dynamic>>[];
        for (final trip in trips) {
          final s = ((trip as Map)['stops'] as List?) ?? [];
          allStops
              .addAll(s.map((st) => Map<String, dynamic>.from(st as Map)));
        }
        allStops.sort((a, b) => ((a['sequence'] as num?) ?? 0)
            .compareTo((b['sequence'] as num?) ?? 0));
        _stops = allStops;
        _state = _deriveState(_activeRoute, _patients);
        debugPrint(
            '[OPS] ops:state:replay applied — state=${operationalStateToString(_state)}');
        _persist();
        _syncToDriverState();
        notifyListeners();
      }
    });

    _ws.on('operational.alert', (data) {
      debugPrint('[OPS] operational alert: $data');
    });

    _ws.on('operational:state_changed', (data) {
      final event = data as Map? ?? {};
      final opState = event['operationalState'] as String?;
      final routeId = event['routeId'] as String?;
      final tripId = event['tripId'] as String?;
      final status = event['status'] as String?;
      if (routeId != null && event['routeStatus'] is String) {
        _updateRouteStatus(routeId, event['routeStatus'] as String);
      }
      if (tripId != null && status != null) _updateTripStatus(tripId, status);
      if (opState != null) {
        _transition(operationalStateFromString(opState), force: true);
      }
    });
  }

  // ─── State machine ───────────────────────────────────────────────────────────

  /// Apply a state transition. Validates against kValidTransitions unless force=true.
  void _transition(OperationalState next, {bool force = false}) {
    if (_state == next) return;
    final allowed = kValidTransitions[_state] ?? {};
    if (!force && !allowed.contains(next)) {
      debugPrint(
          '[OPS] BLOCKED transition ${operationalStateToString(_state)} → ${operationalStateToString(next)}');
      return;
    }
    debugPrint(
        '[OPS] transition ${operationalStateToString(_state)} → ${operationalStateToString(next)}');
    _state = next;
    _driverState.setOperationalStatus(operationalStateToString(next));
    _localStore.saveOperationalState(next);
    notifyListeners();
  }

  // ─── Action dispatch ─────────────────────────────────────────────────────────

  /// Perform the primary next action for the current state.
  Future<void> performPrimaryAction() async {
    switch (_state) {
      case OperationalState.dispatched:
        await _acceptRoute();
        break;
      case OperationalState.boarding:
      case OperationalState.boarded:
        if (pendingBoardingCount == 0 && boardedCount > 0) {
          await _startTransit();
        }
        break;
      case OperationalState.inTransit:
        await _registerArrival();
        break;
      case OperationalState.arrived:
        await _completeRoute();
        break;
      default:
        debugPrint(
            '[OPS] no action for state=${operationalStateToString(_state)}');
    }
  }

  Future<void> startMission() async {
    await performPrimaryAction();
  }

  Future<void> finalizeMission() async {
    await finalizeOperationRecovery();
  }

  Future<void> confirmPassengerBoarded(String tripId) async {
    await _postTripAction(
      '/trips/$tripId/boarded',
      tripId: tripId,
      onSuccess: () {
        _updateTripStatus(tripId, 'BOARDED');
        if (_patients.every((p) {
          final s = (p['status'] as String? ?? '').toUpperCase();
          return s == 'COMPLETED' || s == 'CANCELLED' || s == 'NO_SHOW';
        })) {
          _transition(OperationalState.boarded, force: true);
        } else {
          _transition(OperationalState.boarding, force: true);
        }
      },
    );
  }

  Future<void> markPassengerNoShow(String tripId) async {
    await _postTripAction(
      '/trips/$tripId/no-show',
      tripId: tripId,
      onSuccess: () {
        _updateTripStatus(tripId, 'NO_SHOW');
        _transition(OperationalState.noShow, force: true);
      },
    );
  }

  Future<void> reportPassengerIssue(String tripId, {String? reason}) async {
    final routeId = _activeRoute?['id'] as String?;
    final deviceId = _driverState.deviceId ?? 'unknown-device';
    await _offlineQueue.enqueueOperationalAction(
      type: 'TRIP_ISSUE',
      payload: {
        'tripId': tripId,
        'routeId': routeId,
        'driverId': _auth.driverId,
        'vehicleId': _driverState.vehicle?['id'] as String? ?? _auth.vehicle?['id'] as String?,
        'reason': reason ?? 'Issue reported by driver',
        'timestamp': DateTime.now().toIso8601String(),
      },
      deviceId: deviceId,
      operationId: routeId,
      routeId: routeId,
      tripId: tripId,
    );
    await _syncManager.syncAll();
  }

  Future<void> _acceptRoute() async {
    final routeId = _activeRoute?['id'] as String?;
    if (routeId == null) {
      await loadRoute();
      return;
    }
    await _apiPost('/routes/$routeId/start', onSuccess: () {
      _transition(OperationalState.driverAccepted);
      _ws.emitDriverStatus(
        'DRIVER_ACCEPTED',
        vehicleId: _driverState.vehicle?['id'] as String?,
        routeId: routeId,
      );
      _ensureGps(routeId: routeId);
    });
  }

  Future<void> _startTransit() async {
    final trip = _activeTrip;
    if (trip == null) return;
    final tripId = trip['id'] as String?;
    if (tripId == null) return;
    await _apiPost('/trips/$tripId/in-transit', onSuccess: () {
      _updateTripStatus(tripId, 'IN_TRANSIT');
      _transition(OperationalState.inTransit);
      _ws.emitDriverStatus(
        'IN_TRANSIT',
        vehicleId: _driverState.vehicle?['id'] as String?,
        routeId: _activeRoute?['id'] as String?,
      );
    });
  }

  Future<void> _registerArrival() async {
    final trip = _activeTrip;
    if (trip == null) return;
    final tripId = trip['id'] as String?;
    if (tripId == null) return;
    await _apiPost('/trips/$tripId/arrived', onSuccess: () {
      _updateTripStatus(tripId, 'ARRIVED');
      _transition(OperationalState.arrived);
    });
  }

  Future<void> _completeRoute() async {
    final trip = _activeTrip;
    if (trip == null) return;
    final tripId = trip['id'] as String?;
    if (tripId == null) return;
    await _apiPost('/trips/$tripId/complete', onSuccess: () {
      _updateTripStatus(tripId, 'COMPLETED');
      _transition(OperationalState.completed);
      _gps.stop();
    });
  }

  void continueStaleOperation() {
    final routeId = _activeRoute?['id'] as String?;
    if (routeId == null) return;
    _staleRecoveryAcknowledgedRouteId = routeId;
    debugPrint('[RECOVERY] [STALE_ROUTE] continue operation routeId=$routeId staleLevel=$staleLevel elapsedHours=$staleElapsedHours');
    _ensureGps(routeId: routeId);
    notifyListeners();
  }

  Future<void> finalizeOperationRecovery() async {
    final routeId = _activeRoute?['id'] as String?;
    if (routeId == null) return;
    await _apiPost('/routes/$routeId/force-complete', onSuccess: () {
      debugPrint('[RECOVERY] [FINALIZE] force-complete success routeId=$routeId staleLevel=$staleLevel elapsedHours=$staleElapsedHours');
      _staleRecoveryAcknowledgedRouteId = routeId;
      _transition(OperationalState.completed, force: true);
      _gps.stop();
      _clearRoute();
    });
  }

  Future<void> _apiPost(String path, {required VoidCallback onSuccess}) async {
    if (_actionInProgress) return;
    _actionInProgress = true;
    _lastError = null;
    notifyListeners();
    try {
      final routeId = _activeRoute?['id'] as String?;
      final trip = _activeTrip;
      final tripId = trip?['id'] as String?;
      final type = _eventTypeFromPath(path);
      final payload = <String, dynamic>{
        'path': path,
        'routeId': routeId,
        if (tripId != null) 'tripId': tripId,
        'driverId': _auth.driverId,
        'vehicleId': _driverState.vehicle?['id'] as String? ?? _auth.vehicle?['id'] as String?,
        'deviceId': _driverState.deviceId,
        'tenantId': _auth.tenantId,
        'timestamp': DateTime.now().toIso8601String(),
      };
      await _offlineQueue.enqueueOperationalAction(
        type: type,
        payload: payload,
        deviceId: _driverState.deviceId ?? 'unknown-device',
        operationId: routeId,
        routeId: routeId,
        tripId: tripId,
      );
      await _syncManager.syncAll();
      onSuccess();
    } catch (e) {
      _lastError = e.toString();
      debugPrint('[OPS] queue action error path=$path error=$e');
    } finally {
      _actionInProgress = false;
      notifyListeners();
    }
  }

  Future<void> _postTripAction(
    String path, {
    required String tripId,
    required VoidCallback onSuccess,
  }) async {
    if (_actionInProgress) return;
    _actionInProgress = true;
    _lastError = null;
    notifyListeners();
    try {
      final routeId = _activeRoute?['id'] as String?;
      final type = _eventTypeFromPath(path);
      final payload = <String, dynamic>{
        'path': path,
        'routeId': routeId,
        'tripId': tripId,
        'driverId': _auth.driverId,
        'vehicleId': _driverState.vehicle?['id'] as String? ?? _auth.vehicle?['id'] as String?,
        'deviceId': _driverState.deviceId,
        'tenantId': _auth.tenantId,
        'timestamp': DateTime.now().toIso8601String(),
      };
      await _offlineQueue.enqueueOperationalAction(
        type: type,
        payload: payload,
        deviceId: _driverState.deviceId ?? 'unknown-device',
        operationId: routeId,
        routeId: routeId,
        tripId: tripId,
      );
      await _syncManager.syncAll();
      onSuccess();
    } catch (e) {
      _lastError = e.toString();
      debugPrint('[OPS] queue trip action error path=$path error=$e');
    } finally {
      _actionInProgress = false;
      notifyListeners();
    }
  }

  // ─── Route loading ───────────────────────────────────────────────────────────

  Future<void> loadRoute() async {
    final driverId = _auth.driverId;
    final vehicleId = _driverState.vehicle?['id'] as String? ??
        _auth.vehicle?['id'] as String?;
    if (driverId == null && vehicleId == null) {
      _setLoading(false);
      return;
    }
    _setLoading(true);
    try {
      final today = DateTime.now().toIso8601String().substring(0, 10);
      final statuses = [
        'DISPATCHED',
        'ACTIVE',
        'PLANNED',
        'PREPARING',
        'SCHEDULED',
        'PENDING'
      ];
      Map<String, dynamic>? found;
      for (final st in statuses) {
        final params = <String, String>{
          'date': today,
          'status': st,
          if (driverId != null) 'driverId': driverId,
          if (vehicleId != null && driverId == null) 'vehicleId': vehicleId,
        };
        final resp = await _dio.get(
          '${AppConfig.apiBaseUrl}/routes',
          queryParameters: params,
          options: Options(
              headers: {'Authorization': 'Bearer ${_auth.token}'}),
        );
        final data = resp.data;
        final items = (data is Map ? data['items'] : data) as List? ?? [];
        debugPrint('[OPS] route lookup status=$st found=${items.length}');
        if (items.isNotEmpty) {
          found = Map<String, dynamic>.from(items.first as Map);
          break;
        }
      }
      if (found == null) {
        final staleResp = await _dio.get(
          '${AppConfig.apiBaseUrl}/routes',
          queryParameters: {
            'status': 'DISPATCHED,ACTIVE,RETURNING,PREPARING,PLANNED,SCHEDULED,PENDING',
            'limit': 20,
            if (driverId != null) 'driverId': driverId,
            if (vehicleId != null && driverId == null) 'vehicleId': vehicleId,
          },
          options: Options(headers: {'Authorization': 'Bearer ${_auth.token}'}),
        );
        final staleData = staleResp.data;
        final staleItems = (staleData is Map ? staleData['items'] : staleData) as List? ?? [];
        if (staleItems.isNotEmpty) {
          found = Map<String, dynamic>.from(staleItems.first as Map);
        }
      }
      if (found != null) {
        _activeRoute = found;
        final routeId = found['id'] as String?;
        if (_staleRecoveryAcknowledgedRouteId != routeId) {
          _staleRecoveryAcknowledgedRouteId = null;
        }
        await _loadPatients(found['id'] as String);
        await _loadStops(found['id'] as String);
        final derived = _deriveState(_activeRoute, _patients);
        _transition(derived, force: true);
        debugPrint(
            '[OPS] route loaded id=${found['id']} status=${found['status']} derivedState=${operationalStateToString(derived)}');
        _persist();
        _syncToDriverState();
        if (requiresStaleRecoveryScreen) {
          debugPrint(
              '[STALE_ROUTE] stale route detected routeId=${found['id']} staleLevel=$staleLevel elapsedHours=$staleElapsedHours state=${operationalStateToString(_state)}');
        }
      } else {
        final snapshot = await _offlineQueue.loadSnapshot();
        if (snapshot != null) {
          await _applySnapshot(snapshot);
        } else if (_state != OperationalState.offline) {
          _transition(OperationalState.offline, force: true);
        }
      }
    } catch (e) {
      debugPrint('[OPS] loadRoute error: $e');
      final snapshot = await _offlineQueue.loadSnapshot();
      if (snapshot != null) {
        await _applySnapshot(snapshot);
      }
    } finally {
      _setLoading(false);
    }
  }

  Future<void> _loadPatients(String routeId) async {
    try {
      final resp = await _dio.get(
        '${AppConfig.apiBaseUrl}/trips',
        queryParameters: {'routeId': routeId},
        options: Options(
            headers: {'Authorization': 'Bearer ${_auth.token}'}),
      );
      final data = resp.data;
      final items = (data is Map ? data['items'] : data) as List? ?? [];
      _patients =
          items.map((t) => Map<String, dynamic>.from(t as Map)).toList();
    } catch (e) {
      debugPrint('[OPS] loadPatients error: $e');
    }
  }

  Future<void> _loadStops(String routeId) async {
    try {
      final tripsResp = await _dio.get(
        '${AppConfig.apiBaseUrl}/trips',
        queryParameters: {'routeId': routeId},
        options: Options(
            headers: {'Authorization': 'Bearer ${_auth.token}'}),
      );
      final tripsData = tripsResp.data;
      final trips =
          (tripsData is Map ? tripsData['items'] : tripsData) as List? ?? [];
      final allStops = <Map<String, dynamic>>[];
      for (final trip in trips) {
        final tripId = (trip as Map)['id'] as String?;
        if (tripId == null) continue;
        try {
          final r = await _dio.get(
            '${AppConfig.apiBaseUrl}/trips/$tripId/stops',
            options: Options(
                headers: {'Authorization': 'Bearer ${_auth.token}'}),
          );
          final sd = r.data;
          final s = (sd is List ? sd : (sd as Map?)?.values.first) as List? ?? [];
          allStops
              .addAll(s.map((x) => Map<String, dynamic>.from(x as Map)));
        } catch (_) {}
      }
      allStops.sort((a, b) => ((a['sequence'] as num?) ?? 0)
          .compareTo((b['sequence'] as num?) ?? 0));
      _stops = allStops;
    } catch (e) {
      debugPrint('[OPS] loadStops error: $e');
    }
  }

  // ─── Lifecycle (WidgetsBindingObserver) ──────────────────────────────────────

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        debugPrint('[LIFECYCLE] app resumed — recovering operational state');
        _onAppResumed();
        break;
      case AppLifecycleState.paused:
      case AppLifecycleState.inactive:
        debugPrint('[LIFECYCLE] app backgrounded');
        break;
      case AppLifecycleState.detached:
        debugPrint('[LIFECYCLE] app detached');
        break;
      case AppLifecycleState.hidden:
        debugPrint('[LIFECYCLE] app hidden');
        break;
    }
  }

  void _onAppResumed() {
    if (!_ws.connected) {
      debugPrint('[LIFECYCLE] reconnecting WS after resume');
      if (_auth.isAuthenticated &&
          _auth.token != null &&
          _auth.tenantId != null) {
        _ws.connect(
          _auth.token!,
          _auth.tenantId!,
          driverId: _auth.driverId,
          vehicleId: _driverState.vehicle?['id'] as String?,
          deviceId: _driverState.deviceId,
        );
      }
    }
    _ensureGps();
    loadRoute();
    _syncManager.syncAll();
  }

  // ─── GPS ─────────────────────────────────────────────────────────────────────

  void _ensureGps({String? routeId}) {
    final vehicleId = _driverState.vehicle?['id'] as String? ??
        _auth.vehicle?['id'] as String?;
    final deviceId = _driverState.deviceId;
    if (vehicleId == null ||
        deviceId == null ||
        _auth.token == null ||
        _auth.tenantId == null) {
      return;
    }
    final rid = routeId ?? _activeRoute?['id'] as String?;
    _gps.start(
      vehicleId: vehicleId,
      tenantId: _auth.tenantId!,
      deviceId: deviceId,
      authToken: _auth.token!,
      routeId: rid,
    );
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  OperationalState _deriveState(
    Map<String, dynamic>? route,
    List<Map<String, dynamic>> trips,
  ) {
    final routeStatus = route?['status'] as String?;
    final activeTrip = trips.firstWhere(
      (t) => !['COMPLETED', 'CANCELLED', 'NO_SHOW']
          .contains((t['status'] as String? ?? '').toUpperCase()),
      orElse: () => <String, dynamic>{},
    );
    final tripStatus = (activeTrip['status'] as String? ?? '').toUpperCase();

    if (tripStatus == 'BOARDING') return OperationalState.boarding;
    if (tripStatus == 'BOARDED') return OperationalState.boarded;
    if (tripStatus == 'IN_TRANSIT') return OperationalState.inTransit;
    if (tripStatus == 'IN_PROGRESS') return OperationalState.inTransit;
    if (tripStatus == 'ARRIVED') return OperationalState.arrived;
    if (tripStatus == 'NO_SHOW') return OperationalState.noShow;
    if ((routeStatus ?? '').toUpperCase() == 'DISPATCHED') {
      return OperationalState.dispatched;
    }
    if ((routeStatus ?? '').toUpperCase() == 'ACTIVE') {
      return OperationalState.waitingPatient;
    }
    if (['PLANNED', 'SCHEDULED', 'PENDING', 'PREPARING']
        .contains((routeStatus ?? '').toUpperCase())) {
      return OperationalState.created;
    }
    return OperationalState.offline;
  }

  void _updateRouteStatus(String routeId, String status) {
    if (_activeRoute != null && _activeRoute!['id'] == routeId) {
      _activeRoute = {..._activeRoute!, 'status': status};
      _driverState.updateRouteStatus(routeId, status);
      _localStore.saveRoute(_activeRoute);
      notifyListeners();
    }
  }

  void _updateTripStatus(String tripId, String status) {
    final idx = _patients.indexWhere((p) => p['id'] == tripId);
    if (idx != -1) {
      _patients[idx] = {..._patients[idx], 'status': status};
      _driverState.updateTripStatus(tripId, status);
      _localStore.savePatients(_patients);
      notifyListeners();
    }
  }

  void updateStopStatus(String stopId, String status) {
    final idx = _stops.indexWhere((s) => s['id'] == stopId);
    if (idx != -1) {
      _stops[idx] = {..._stops[idx], 'status': status};
      _driverState.updateStopStatus(stopId, status);
      _localStore.saveStops(_stops);
      notifyListeners();
    }
  }

  void _clearRoute() {
    _activeRoute = null;
    _patients = [];
    _stops = [];
    _state = OperationalState.offline;
    _staleRecoveryAcknowledgedRouteId = null;
    _driverState.clearActiveRoute();
    _localStore.clear();
    notifyListeners();
  }

  Future<void> _restoreOfflineSnapshot() async {
    try {
      final snapshot = await _offlineQueue.loadSnapshot();
      if (snapshot == null) return;
      final currentRoute = snapshot['currentRoute'];
      if (currentRoute is Map) {
        _activeRoute = Map<String, dynamic>.from(currentRoute);
      }
      final currentTrip = snapshot['currentTrip'];
      if (currentTrip is Map) {
        final routeId = _activeRoute?['id'] as String?;
        if (routeId != null) {
          _activeRoute ??= {'id': routeId};
        }
      }
      final patients = snapshot['patients'];
      if (patients is List) {
        _patients = patients.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }
      final stops = snapshot['stops'];
      if (stops is List) {
        _stops = stops.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }
      final opStatus = snapshot['operationalStatus'] as String?;
      if (opStatus != null) {
        _state = operationalStateFromString(opStatus);
      }
      _syncToDriverState();
      notifyListeners();
    } catch (e) {
      debugPrint('[OPS] restoreOfflineSnapshot error: $e');
    }
  }

  String _eventTypeFromPath(String path) {
    if (path.contains('/routes/') && path.endsWith('/start')) return 'ROUTE_START';
    if (path.contains('/routes/') && path.endsWith('/complete')) return 'ROUTE_COMPLETE';
    if (path.contains('/routes/') && path.endsWith('/force-complete')) return 'ROUTE_FORCE_COMPLETE';
    if (path.contains('/trips/') && path.endsWith('/in-transit')) return 'TRIP_STARTED';
    if (path.contains('/trips/') && path.endsWith('/arrived')) return 'TRIP_ARRIVED';
    if (path.contains('/trips/') && path.endsWith('/complete')) return 'TRIP_COMPLETED';
    if (path.contains('/trips/') && path.endsWith('/boarded')) return 'TRIP_BOARDED';
    if (path.contains('/trips/') && path.endsWith('/no-show')) return 'TRIP_NO_SHOW';
    return 'OPERATIONAL_ACTION';
  }

  void _persist() {
    _localStore.saveRoute(_activeRoute);
    _localStore.savePatients(_patients);
    _localStore.saveStops(_stops);
    _localStore.saveOperationalState(_state);
    unawaited(_offlineQueue.saveSnapshot(
      snapshot: {
        'currentRoute': _activeRoute,
        'currentTrip': _activeTrip,
        'patients': _patients,
        'stops': _stops,
        'driver': {
          'id': _auth.driverId,
          'deviceId': _driverState.deviceId,
        },
        'vehicle': _driverState.vehicle ?? _auth.vehicle,
        'timeline': _activeRoute?['timeline'] ?? [],
        'operationalStatus': operationalStateToString(_state),
        'routeId': _activeRoute?['id'] as String? ?? 'global',
      },
    ));
  }

  void _syncToDriverState() {
    if (_activeRoute != null) _driverState.setActiveRoute(_activeRoute!);
    _driverState.setPatients(_patients);
    _driverState.setStops(_stops);
    _driverState.setOperationalStatus(operationalStateToString(_state));
  }

  Future<void> _applySnapshot(Map<String, dynamic> snapshot) async {
    final currentRoute = snapshot['currentRoute'];
    if (currentRoute is Map) {
      _activeRoute = Map<String, dynamic>.from(currentRoute);
    }
    final patients = snapshot['patients'];
    if (patients is List) {
      _patients = patients.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    }
    final stops = snapshot['stops'];
    if (stops is List) {
      _stops = stops.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    }
    final status = snapshot['operationalStatus'] as String?;
    if (status != null) {
      _state = operationalStateFromString(status);
    }
    _syncToDriverState();
    _persist();
    notifyListeners();
  }

  void _setLoading(bool v) {
    _loading = v;
    notifyListeners();
  }

  void _startSyncTimer() {
    _offlineSyncTimer?.cancel();
    _offlineSyncTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (_ws.connected) _syncManager.syncAll();
    });
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _offlineSyncTimer?.cancel();
    super.dispose();
  }
}
