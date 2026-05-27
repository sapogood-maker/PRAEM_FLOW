import 'package:flutter/foundation.dart';

import '../auth/auth_service.dart';
import '../offline/offline_queue.dart';
import '../offline_sync/conflict_resolver.dart';
import '../offline_sync/connectivity_service.dart';
import '../offline_sync/sync_engine.dart';

class SyncManager extends ChangeNotifier {
  final SyncEngine _engine;
  final ConnectivityService _connectivity;

  SyncManager._(this._connectivity, this._engine);

  factory SyncManager(
    OfflineQueue queue,
    AuthService auth, {
    ConnectivityService? connectivity,
  }) {
    final connectivityService = connectivity ?? ConnectivityService();
    final engine = SyncEngine(queue, connectivityService, auth, ConflictResolver());
    return SyncManager._(connectivityService, engine);
  }

  bool get syncing => _engine.syncing;
  String? get lastError => _engine.lastError;
  ConnectivityService get connectivity => _connectivity;

  Future<void> syncAll() async {
    await _engine.syncNow();
  }

  @override
  void dispose() {
    _engine.dispose();
    super.dispose();
  }
}
