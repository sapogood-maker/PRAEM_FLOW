import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../auth/auth_service.dart';
import '../config/app_config.dart';
import '../core/constants.dart';
import '../core/status_translations.dart';

class RouteHistoryScreen extends StatefulWidget {
  const RouteHistoryScreen({super.key});

  @override
  State<RouteHistoryScreen> createState() => _RouteHistoryScreenState();
}

class _RouteHistoryScreenState extends State<RouteHistoryScreen> {
  final Dio _dio = Dio();
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _routes = [];

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    final auth = context.read<AuthService>();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final resp = await _dio.get(
        '${AppConfig.apiBaseUrl}/routes',
        queryParameters: {
          'status': 'COMPLETED,CANCELLED',
          'limit': 100,
          if (auth.driverId != null) 'driverId': auth.driverId,
        },
        options: Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
      );
      final data = resp.data;
      final items = (data is Map ? data['items'] : data) as List? ?? [];
      final parsed = items.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      parsed.sort((a, b) => _safeDate(b['date']).compareTo(_safeDate(a['date'])));
      setState(() {
        _routes = parsed;
      });
    } catch (e) {
      setState(() {
        _error = 'Falha ao carregar histórico: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  DateTime _safeDate(dynamic raw) {
    if (raw is String) return DateTime.tryParse(raw)?.toLocal() ?? DateTime.fromMillisecondsSinceEpoch(0);
    return DateTime.fromMillisecondsSinceEpoch(0);
  }

  String _fmtDate(dynamic raw) {
    final d = _safeDate(raw);
    return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
  }

  String _routeSummaryStatus(Map<String, dynamic> route) {
    final trips = (route['trips'] as List?)?.cast<dynamic>() ?? const [];
    if (trips.isEmpty) {
      return (route['status'] as String? ?? '').toUpperCase() == 'CANCELLED'
          ? 'Cancelada'
          : 'Concluída';
    }
    final statuses = trips
        .map((t) => ((t as Map)['status'] as String? ?? '').toUpperCase())
        .toList();
    final allNoShowOrCancelled = statuses.every((s) => s == 'NO_SHOW' || s == 'CANCELLED');
    if (allNoShowOrCancelled) return 'Não compareceram';
    return 'Concluída';
  }

  Map<String, List<Map<String, dynamic>>> _groupByDate(List<Map<String, dynamic>> routes) {
    final grouped = <String, List<Map<String, dynamic>>>{};
    for (final route in routes) {
      final key = _fmtDate(route['date']);
      grouped.putIfAbsent(key, () => []).add(route);
    }
    return grouped;
  }

  @override
  Widget build(BuildContext context) {
    final grouped = _groupByDate(_routes);
    final orderedDates = grouped.keys.toList()
      ..sort((a, b) {
        final pa = a.split('/').reversed.join('-');
        final pb = b.split('/').reversed.join('-');
        return pb.compareTo(pa);
      });

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: const Text(
          'Histórico',
          style: TextStyle(color: AppColors.textPrimary),
        ),
        iconTheme: const IconThemeData(color: AppColors.textPrimary),
      ),
      body: RefreshIndicator(
        onRefresh: _loadHistory,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? ListView(
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
                      ),
                    ],
                  )
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      if (_routes.isEmpty)
                        const Text('Nenhuma rota finalizada encontrada.',
                            style: TextStyle(color: AppColors.textSecondary)),
                      for (final date in orderedDates) ...[
                        Padding(
                          padding: const EdgeInsets.only(top: 8, bottom: 10),
                          child: Text(
                            date,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                        ),
                        ...grouped[date]!.map((route) {
                          final destination = route['destination'] as String? ?? 'Destino não informado';
                          final trips = (route['trips'] as List?)?.cast<dynamic>() ?? const [];
                          final patientsCount = trips.length;
                          final summaryStatus = _routeSummaryStatus(route);
                          return InkWell(
                            onTap: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => RouteHistoryDetailScreen(routeId: route['id'] as String),
                              ),
                            ),
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 10),
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: AppColors.surface,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: AppColors.border),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(destination,
                                      style: const TextStyle(
                                        color: AppColors.textPrimary,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 15,
                                      )),
                                  const SizedBox(height: 6),
                                  Text(
                                    '$patientsCount paciente${patientsCount == 1 ? '' : 's'}',
                                    style: const TextStyle(color: AppColors.textSecondary),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    summaryStatus,
                                    style: TextStyle(
                                      color: summaryStatus == 'Não compareceram'
                                          ? AppColors.warning
                                          : AppColors.primary,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        }),
                      ],
                      const SizedBox(height: 20),
                    ],
                  ),
      ),
    );
  }
}

class RouteHistoryDetailScreen extends StatefulWidget {
  const RouteHistoryDetailScreen({super.key, required this.routeId});

  final String routeId;

  @override
  State<RouteHistoryDetailScreen> createState() => _RouteHistoryDetailScreenState();
}

class _RouteHistoryDetailScreenState extends State<RouteHistoryDetailScreen> {
  final Dio _dio = Dio();
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _route;
  List<Map<String, dynamic>> _trips = [];

  @override
  void initState() {
    super.initState();
    _loadDetail();
  }

  DateTime? _tryDate(dynamic raw) {
    if (raw is String) return DateTime.tryParse(raw)?.toLocal();
    return null;
  }

  String _fmtDateTime(dynamic raw) {
    final d = _tryDate(raw);
    if (d == null) return '—';
    return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year} '
        '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }

  String _statusLabel(String status) {
    return translateStatusPtBr(status);
  }

  Color _statusColor(String status) {
    switch (status.toUpperCase()) {
      case 'COMPLETED':
        return AppColors.primary;
      case 'NO_SHOW':
        return AppColors.warning;
      case 'CANCELLED':
        return AppColors.danger;
      default:
        return AppColors.textSecondary;
    }
  }

  Future<void> _loadDetail() async {
    final auth = context.read<AuthService>();
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final routeResp = await _dio.get(
        '${AppConfig.apiBaseUrl}/routes/${widget.routeId}',
        options: Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
      );
      final route = Map<String, dynamic>.from(routeResp.data as Map);
      var trips = ((route['trips'] as List?) ?? const [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      if (trips.isEmpty) {
        final tripResp = await _dio.get(
          '${AppConfig.apiBaseUrl}/trips',
          queryParameters: {'routeId': widget.routeId},
          options: Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
        );
        final data = tripResp.data;
        final items = (data is Map ? data['items'] : data) as List? ?? [];
        trips = items.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }
      setState(() {
        _route = route;
        _trips = trips;
      });
    } catch (e) {
      setState(() {
        _error = 'Falha ao carregar detalhes: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final route = _route;
    final startTime = route?['scheduledAt'] ?? route?['date'] ?? route?['createdAt'];
    final endTime = _trips
        .map((t) => _tryDate(t['completedAt']))
        .whereType<DateTime>()
        .fold<DateTime?>(null, (acc, t) => acc == null || t.isAfter(acc) ? t : acc)
        ?.toIso8601String() ??
        route?['updatedAt'];

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: const Text(
          'Detalhe do histórico',
          style: TextStyle(color: AppColors.textPrimary),
        ),
        iconTheme: const IconThemeData(color: AppColors.textPrimary),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
                )
              : route == null
                  ? const SizedBox.shrink()
                  : ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: AppColors.surface,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: AppColors.border),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(route['destination'] as String? ?? 'Destino não informado',
                                  style: const TextStyle(
                                    color: AppColors.textPrimary,
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                  )),
                              const SizedBox(height: 10),
                              Text('Veículo: ${route['vehicle']?['plate'] ?? '—'}',
                                  style: const TextStyle(color: AppColors.textSecondary)),
                              Text('Motorista: ${route['driver']?['user']?['name'] ?? '—'}',
                                  style: const TextStyle(color: AppColors.textSecondary)),
                              Text('Início: ${_fmtDateTime(startTime)}',
                                  style: const TextStyle(color: AppColors.textSecondary)),
                              Text('Fim: ${_fmtDateTime(endTime)}',
                                  style: const TextStyle(color: AppColors.textSecondary)),
                              Text('Total de pacientes: ${_trips.length}',
                                  style: const TextStyle(color: AppColors.textSecondary)),
                            ],
                          ),
                        ),
                        const SizedBox(height: 14),
                        const Text(
                          'Pacientes',
                          style: TextStyle(
                            color: AppColors.textPrimary,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        ..._trips.map((trip) {
                          final patient = (trip['patient'] as Map?) ?? trip;
                          final name = patient['name'] as String? ?? 'Paciente';
                          final status = (trip['status'] as String? ?? '').toUpperCase();
                          return Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: AppColors.surface,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: AppColors.border),
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(name, style: const TextStyle(color: AppColors.textPrimary)),
                                ),
                                Text(
                                  _statusLabel(status),
                                  style: TextStyle(
                                    color: _statusColor(status),
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          );
                        }),
                      ],
                    ),
    );
  }
}
