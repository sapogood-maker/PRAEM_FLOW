import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

class OfflineStorageService {
  static const _dbName = 'praem_offline_sync.db';
  static const _schemaVersion = 1;

  Database? _db;

  Future<Database> get _database async {
    final existing = _db;
    if (existing != null) return existing;

    final dbPath = p.join(await getDatabasesPath(), _dbName);
    _db = await openDatabase(
      dbPath,
      version: _schemaVersion,
      onCreate: (db, version) async {
        await db.execute(_createOfflineEventsTable('offline_events'));
        await db.execute(_createOfflineEventsTable('offline_boardings'));
        await db.execute(_createOfflineEventsTable('offline_gps'));
        await db.execute(_createOfflineEventsTable('offline_qr_scans'));
        await db.execute(_createOfflineEventsTable('offline_sync_queue'));
        await db.execute(_createRouteStateTable());
        await db.execute(_createProcessedEventsTable());
        await db.execute(_createConflictLogsTable());
      },
    );
    return _db!;
  }

  Future<void> init() async {
    await _database;
  }

  String _createOfflineEventsTable(String table) {
    return '''
      CREATE TABLE IF NOT EXISTS $table (
        id TEXT PRIMARY KEY,
        eventId TEXT NOT NULL UNIQUE,
        tableName TEXT NOT NULL,
        operationId TEXT,
        deviceId TEXT NOT NULL,
        type TEXT NOT NULL,
        payloadJson TEXT NOT NULL,
        routeId TEXT,
        tripId TEXT,
        createdAt TEXT NOT NULL,
        syncedAt TEXT,
        syncStatus TEXT NOT NULL,
        retryCount INTEGER NOT NULL DEFAULT 0
      )
    ''';
  }

  String _createRouteStateTable() {
    return '''
      CREATE TABLE IF NOT EXISTS offline_route_state (
        routeId TEXT PRIMARY KEY,
        snapshotJson TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    ''';
  }

  String _createProcessedEventsTable() {
    return '''
      CREATE TABLE IF NOT EXISTS processed_events (
        id TEXT PRIMARY KEY,
        eventId TEXT NOT NULL UNIQUE,
        operationId TEXT,
        deviceId TEXT NOT NULL,
        type TEXT NOT NULL,
        payloadJson TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        syncedAt TEXT,
        syncStatus TEXT NOT NULL,
        retryCount INTEGER NOT NULL DEFAULT 0
      )
    ''';
  }

  String _createConflictLogsTable() {
    return '''
      CREATE TABLE IF NOT EXISTS conflict_logs (
        id TEXT PRIMARY KEY,
        eventId TEXT NOT NULL,
        operationId TEXT,
        deviceId TEXT,
        entityType TEXT NOT NULL,
        entityId TEXT,
        localStateJson TEXT,
        serverStateJson TEXT,
        resolution TEXT NOT NULL,
        reason TEXT NOT NULL,
        createdAt TEXT NOT NULL
      )
    ''';
  }

  Map<String, Object?> _rowForEvent(Map<String, dynamic> event) {
    final now = DateTime.now().toUtc().toIso8601String();
    final eventId =
        (event['eventId'] as String?) ?? event['id'] as String? ?? now;
    final id = (event['id'] as String?) ?? eventId;
    return {
      'id': id,
      'eventId': eventId,
      'tableName': event['tableName'] as String? ??
          event['table'] as String? ??
          'offline_sync_queue',
      'operationId': event['operationId'] as String?,
      'deviceId': event['deviceId'] as String? ?? '',
      'type': event['type'] as String? ?? 'UNKNOWN',
      'payloadJson':
          jsonEncode(event['payload'] ?? event['payloadJson'] ?? event),
      'routeId': event['routeId'] as String?,
      'tripId': event['tripId'] as String?,
      'createdAt': event['createdAt'] as String? ?? now,
      'syncedAt': event['syncedAt'] as String?,
      'syncStatus': event['syncStatus'] as String? ?? 'pending',
      'retryCount': event['retryCount'] as int? ?? 0,
    };
  }

  Future<void> upsertEvent(String table, Map<String, dynamic> event) async {
    final db = await _database;
    final row = _rowForEvent(event);
    await db.insert(
      table,
      row,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<Map<String, dynamic>>> loadEvents(
    String table, {
    String syncStatus = 'pending',
    int? limit,
  }) async {
    final db = await _database;
    if (table == 'offline_sync_queue') {
      final rows = await db.rawQuery(
        '''
        SELECT *
        FROM offline_sync_queue
        WHERE syncStatus = ?
        ORDER BY
          CASE
            WHEN type = 'GPS_UPDATE' THEN 1
            WHEN type IN ('CHECK_IN', 'PATIENT_CHECKIN', 'TRIP_CHECK_IN') THEN 2
            WHEN type IN ('ROUTE_START', 'ROUTE_COMPLETE', 'ROUTE_FORCE_COMPLETE', 'TRIP_STOP_STATUS') THEN 3
            WHEN type IN ('QR_SCAN', 'BOARDING') THEN 4
            ELSE 5
          END,
          createdAt ASC
        ${limit != null ? 'LIMIT ?' : ''}
        ''',
        limit != null ? [syncStatus, limit] : [syncStatus],
      );
      return rows.map(_mapEventRow).toList();
    }
    final rows = await db.query(
      table,
      where: 'syncStatus = ?',
      whereArgs: [syncStatus],
      orderBy: 'createdAt ASC',
      limit: limit,
    );
    return rows.map(_mapEventRow).toList();
  }

  Future<int> pendingCount() async {
    final db = await _database;
    final rows = await db.rawQuery('''
      SELECT COUNT(*) AS count
      FROM offline_sync_queue
      WHERE syncStatus = 'pending'
    ''');
    return Sqflite.firstIntValue(rows) ?? 0;
  }

  Future<DateTime?> lastSyncedAt() async {
    final db = await _database;
    final rows = await db.rawQuery('''
      SELECT syncedAt FROM offline_sync_queue WHERE syncedAt IS NOT NULL
      ORDER BY syncedAt DESC
      LIMIT 1
    ''');
    if (rows.isEmpty) return null;
    final raw = rows.first['syncedAt'] as String?;
    return raw == null ? null : DateTime.tryParse(raw)?.toLocal();
  }

  Future<void> markSynced(String table, String eventId,
      {DateTime? syncedAt}) async {
    final db = await _database;
    await db.update(
      table,
      {
        'syncStatus': 'synced',
        'syncedAt': (syncedAt ?? DateTime.now().toUtc()).toIso8601String(),
      },
      where: 'eventId = ?',
      whereArgs: [eventId],
    );
  }

  Future<void> markConflict(String table, String eventId,
      {required String reason}) async {
    final db = await _database;
    await db.update(
      table,
      {
        'syncStatus': 'conflict',
        'syncedAt': DateTime.now().toUtc().toIso8601String(),
      },
      where: 'eventId = ?',
      whereArgs: [eventId],
    );
  }

  Future<void> incrementRetry(String table, String eventId) async {
    final db = await _database;
    await db.rawUpdate(
      'UPDATE $table SET retryCount = retryCount + 1, syncStatus = ? WHERE eventId = ?',
      ['pending', eventId],
    );
  }

  Future<void> saveRouteSnapshot(
      String routeId, Map<String, dynamic> snapshot) async {
    final db = await _database;
    final now = DateTime.now().toUtc().toIso8601String();
    await db.insert(
      'offline_route_state',
      {
        'routeId': routeId,
        'snapshotJson': jsonEncode(snapshot),
        'createdAt': now,
        'updatedAt': now,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<Map<String, dynamic>?> loadRouteSnapshot([String? routeId]) async {
    final db = await _database;
    final rows = await db.query(
      'offline_route_state',
      where: routeId == null ? null : 'routeId = ?',
      whereArgs: routeId == null ? null : [routeId],
      orderBy: 'updatedAt DESC',
      limit: 1,
    );
    if (rows.isEmpty) return null;
    final raw = rows.first['snapshotJson'] as String?;
    if (raw == null) return null;
    final decoded = jsonDecode(raw);
    if (decoded is Map) {
      return Map<String, dynamic>.from(decoded);
    }
    return null;
  }

  Future<void> saveConflictLog({
    required String eventId,
    String? operationId,
    String? deviceId,
    required String entityType,
    String? entityId,
    Map<String, dynamic>? localState,
    Map<String, dynamic>? serverState,
    required String resolution,
    required String reason,
  }) async {
    final db = await _database;
    await db.insert('conflict_logs', {
      'id': eventId,
      'eventId': eventId,
      'operationId': operationId,
      'deviceId': deviceId,
      'entityType': entityType,
      'entityId': entityId,
      'localStateJson': localState == null ? null : jsonEncode(localState),
      'serverStateJson': serverState == null ? null : jsonEncode(serverState),
      'resolution': resolution,
      'reason': reason,
      'createdAt': DateTime.now().toUtc().toIso8601String(),
    });
  }

  Map<String, dynamic> _mapEventRow(Map<String, dynamic> row) {
    return {
      'id': row['id'],
      'eventId': row['eventId'],
      'tableName': row['tableName'],
      'operationId': row['operationId'],
      'deviceId': row['deviceId'],
      'type': row['type'],
      'payload': _decodePayload(row['payloadJson'] as String?),
      'routeId': row['routeId'],
      'tripId': row['tripId'],
      'createdAt': row['createdAt'],
      'syncedAt': row['syncedAt'],
      'syncStatus': row['syncStatus'],
      'retryCount': row['retryCount'],
    };
  }

  Map<String, dynamic>? _decodePayload(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map) {
        return Map<String, dynamic>.from(decoded);
      }
      return {'value': decoded};
    } catch (err) {
      debugPrint('[OfflineStorage] payload decode failed: $err');
      return null;
    }
  }

  Future<void> clearAll() async {
    final db = await _database;
    await db.transaction((txn) async {
      for (final table in const [
        'offline_events',
        'offline_boardings',
        'offline_gps',
        'offline_qr_scans',
        'offline_sync_queue',
        'offline_route_state',
        'processed_events',
        'conflict_logs',
      ]) {
        await txn.delete(table);
      }
    });
  }
}
