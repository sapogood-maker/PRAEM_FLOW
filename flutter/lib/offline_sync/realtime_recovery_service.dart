import 'package:flutter/foundation.dart';

import 'connectivity_service.dart';

class RealtimeRecoveryService extends ChangeNotifier {
  final ConnectivityService _connectivity;
  final Future<void> Function() _syncNow;
  final Future<void> Function() _restoreSnapshot;
  final Future<void> Function()? _reconnectWebsocket;

  bool _recovering = false;

  RealtimeRecoveryService(
    this._connectivity,
    this._syncNow,
    this._restoreSnapshot, {
    Future<void> Function()? reconnectWebsocket,
  }) : _reconnectWebsocket = reconnectWebsocket;

  bool get recovering => _recovering;

  Future<void> recover() async {
    if (_recovering) return;
    _recovering = true;
    _connectivity.setSyncing(true);
    notifyListeners();
    try {
      if (_reconnectWebsocket != null) {
        await _reconnectWebsocket!();
      }
      await _syncNow();
      await _restoreSnapshot();
    } finally {
      _connectivity.setSyncing(false);
      _recovering = false;
      notifyListeners();
    }
  }
}
