// lib/auth/screens/login_screen.dart
// ─────────────────────────────────────────────────────────────────────────────
// Login screen — large buttons, high-contrast, easy for tablet / gloved hands.
// Uses /auth/driver/login exclusively. Never uses admin credentials.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../auth_service.dart';
import '../../driver/driver_state.dart';
import '../../core/constants.dart';
import '../../core/l10n.dart';
import '../../shared/widgets/operational_button.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    final driverState = context.read<DriverState>();
    final auth = context.read<AuthService>();

    // Ensure device ID is initialised before login
    if (driverState.deviceId == null) await driverState.init();

    final ok = await auth.login(
      _emailCtrl.text.trim(),
      _passCtrl.text,
      deviceId: driverState.deviceId,
      platform: 'android',
      appVersion: '1.0.0',
    );

    if (!mounted) return;
    setState(() => _loading = false);

    if (ok) {
      // Pre-populate vehicle from login response if backend returned one
      if (auth.vehicle != null) {
        driverState.setVehicle(auth.vehicle!);
        Navigator.pushReplacementNamed(context, AppRoutes.home);
      } else {
        Navigator.pushReplacementNamed(context, AppRoutes.vehicleSelect);
      }
    } else {
      setState(() => _error = context.l10n.loginInvalidCredentials);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ─── Logo / Title ────────────────────────────────────────────
              const Icon(Icons.local_hospital_rounded,
                  color: AppColors.primary, size: 56),
              const SizedBox(height: 12),
              Text(
                context.l10n.appTitle,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 2,
                ),
              ),
              Text(
                context.l10n.loginSubtitle,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    color: AppColors.textSecondary, fontSize: 14),
              ),
              const SizedBox(height: 48),

              // ─── Email ───────────────────────────────────────────────────
              TextField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                style:
                    const TextStyle(color: AppColors.textPrimary, fontSize: 18),
                decoration: _inputDeco(context.l10n.email),
              ),
              const SizedBox(height: 16),

              // ─── Password ────────────────────────────────────────────────
              TextField(
                controller: _passCtrl,
                obscureText: true,
                style:
                    const TextStyle(color: AppColors.textPrimary, fontSize: 18),
                decoration: _inputDeco(context.l10n.password),
                onSubmitted: (_) => _submit(),
              ),
              const SizedBox(height: 12),

              if (_error != null)
                Text(_error!,
                    textAlign: TextAlign.center,
                    style:
                        const TextStyle(color: AppColors.danger, fontSize: 14)),

              const SizedBox(height: 24),

              // ─── Login button ─────────────────────────────────────────────
              OperationalButton(
                label: _loading
                    ? context.l10n.loginEntering
                    : context.l10n.loginAction,
                icon: Icons.login,
                onPressed: _loading ? null : _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }

  InputDecoration _inputDeco(String label) => InputDecoration(
        labelText: label,
        labelStyle:
            const TextStyle(color: AppColors.textSecondary, fontSize: 16),
        filled: true,
        fillColor: AppColors.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
      );
}
