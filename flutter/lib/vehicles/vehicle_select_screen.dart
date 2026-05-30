// lib/vehicles/vehicle_select_screen.dart
// ─────────────────────────────────────────────────────────────────────────────
// After login the driver selects their assigned vehicle for this shift.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:dio/dio.dart';
import '../auth/auth_service.dart';
import '../driver/driver_state.dart';
import '../config/app_config.dart';
import '../core/constants.dart';
import '../core/l10n.dart';
import '../shared/widgets/operational_button.dart';

class VehicleSelectScreen extends StatefulWidget {
  const VehicleSelectScreen({super.key});

  @override
  State<VehicleSelectScreen> createState() => _VehicleSelectScreenState();
}

class _VehicleSelectScreenState extends State<VehicleSelectScreen> {
  final _dio = Dio();
  List<Map<String, dynamic>> _vehicles = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final auth = context.read<AuthService>();
    try {
      final resp = await _dio.get(
        '${AppConfig.apiBaseUrl}/vehicles',
        queryParameters: {'active': true, 'status': 'AVAILABLE'},
        options: Options(headers: {'Authorization': 'Bearer ${auth.token}'}),
      );
      final data = resp.data;
      final items = (data is Map ? data['items'] : data) as List? ?? [];
      setState(() {
        _vehicles =
            items.map((v) => Map<String, dynamic>.from(v as Map)).toList();
        _loading = false;
      });
    } on DioException catch (e) {
      setState(() {
        _error = context.l10n.vehicleLoadError(e.message ?? '');
        _loading = false;
      });
    }
  }

  void _select(Map<String, dynamic> vehicle) {
    context.read<DriverState>().setVehicle(vehicle);
    Navigator.pushReplacementNamed(context, AppRoutes.home);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        title: Text(context.l10n.vehicleSelectTitle,
            style: const TextStyle(color: AppColors.textPrimary)),
        automaticallyImplyLeading: false,
      ),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.primary))
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(_error!,
                          style: const TextStyle(
                              color: AppColors.danger, fontSize: 14),
                          textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      OperationalButton(
                          label: context.l10n.retry,
                          icon: Icons.refresh,
                          onPressed: () {
                            setState(() {
                              _loading = true;
                              _error = null;
                            });
                            _load();
                          }),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _vehicles.length,
                  itemBuilder: (_, i) {
                    final v = _vehicles[i];
                    return Card(
                      color: AppColors.surface,
                      margin: const EdgeInsets.only(bottom: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10),
                        side: const BorderSide(color: AppColors.border),
                      ),
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 20, vertical: 12),
                        leading: const Icon(Icons.directions_car,
                            color: AppColors.primary, size: 36),
                        title: Text(
                          '${v['plate']} — ${v['model']}',
                          style: const TextStyle(
                              color: AppColors.textPrimary,
                              fontSize: 18,
                              fontWeight: FontWeight.bold),
                        ),
                        subtitle: Text(
                          '${v['type']} · ${context.l10n.vehicleCapacity(v['capacity'])}',
                          style: const TextStyle(
                              color: AppColors.textSecondary, fontSize: 14),
                        ),
                        trailing: const Icon(Icons.chevron_right,
                            color: AppColors.textSecondary),
                        onTap: () => _select(v),
                      ),
                    );
                  },
                ),
    );
  }
}
