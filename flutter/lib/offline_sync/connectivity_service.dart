import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

enum OfflineConnectivityState {
  online,
  degraded,
  offline,
  syncing,
}

class ConnectivityService extends ChangeNotifier {
  final Connectivity _connectivity = Connectivity();

  StreamSubscription<List<ConnectivityResult>>? _subscription;
  List<ConnectivityResult> _results = const [ConnectivityResult.none];
  bool _websocketConnected = false;
  bool _syncing = false;
  DateTime _lastChangedAt = DateTime.now();

  OfflineConnectivityState get state {
    if (_syncing) return OfflineConnectivityState.syncing;
    if (_results.isEmpty || _results.contains(ConnectivityResult.none)) {
      return OfflineConnectivityState.offline;
    }
    if (!_websocketConnected) return OfflineConnectivityState.degraded;
    return OfflineConnectivityState.online;
  }

  bool get websocketConnected => _websocketConnected;
  bool get syncing => _syncing;
  DateTime get lastChangedAt => _lastChangedAt;
  List<ConnectivityResult> get connectivity => List.unmodifiable(_results);

  Future<void> init() async {
    final current = await _connectivity.checkConnectivity();
    _update(current);
    _subscription = _connectivity.onConnectivityChanged.listen(_update);
  }

  void setWebsocketConnected(bool connected) {
    if (_websocketConnected == connected) return;
    _websocketConnected = connected;
    _lastChangedAt = DateTime.now();
    notifyListeners();
  }

  void setSyncing(bool syncing) {
    if (_syncing == syncing) return;
    _syncing = syncing;
    _lastChangedAt = DateTime.now();
    notifyListeners();
  }

  void _update(List<ConnectivityResult> results) {
    _results = results;
    _lastChangedAt = DateTime.now();
    notifyListeners();
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }
}
