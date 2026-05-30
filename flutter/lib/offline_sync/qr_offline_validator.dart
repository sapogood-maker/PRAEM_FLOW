import 'dart:convert';

import 'package:crypto/crypto.dart';

class QrOfflineValidationResult {
  final bool valid;
  final String reason;
  final Map<String, dynamic>? payload;

  const QrOfflineValidationResult._({
    required this.valid,
    required this.reason,
    this.payload,
  });

  factory QrOfflineValidationResult.ok(Map<String, dynamic> payload) {
    return QrOfflineValidationResult._(
        valid: true, reason: 'ok', payload: payload);
  }

  factory QrOfflineValidationResult.invalid(String reason) {
    return QrOfflineValidationResult._(valid: false, reason: reason);
  }
}

class QrOfflineValidator {
  final String secret;

  const QrOfflineValidator({required this.secret});

  QrOfflineValidationResult validate(String raw) {
    final parsed = _parse(raw);
    if (parsed == null) {
      return QrOfflineValidationResult.invalid('QR inválido');
    }
    final payload = _normalize(parsed);

    final required = [
      'uniqueId',
      'patientReference',
      'operationReference',
      'expiration',
      'signature'
    ];
    for (final field in required) {
      if (payload[field] == null || payload[field].toString().isEmpty) {
        return QrOfflineValidationResult.invalid('QR incompleto');
      }
    }

    final expiresAt = DateTime.tryParse(payload['expiration'].toString());
    if (expiresAt == null) {
      return QrOfflineValidationResult.invalid('Expiração inválida');
    }
    if (expiresAt.isBefore(DateTime.now().toUtc())) {
      return QrOfflineValidationResult.invalid('QR expirado');
    }

    final expected = _sign(payload);
    final signature = payload['signature'].toString();
    if (!_constantTimeEquals(expected, signature)) {
      return QrOfflineValidationResult.invalid('Assinatura inválida');
    }

    return QrOfflineValidationResult.ok(payload);
  }

  Map<String, dynamic>? _parse(String raw) {
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
    } catch (_) {
      return null;
    }
    return null;
  }

  String _sign(Map<String, dynamic> payload) {
    final canonical = payload['format'] == 'legacy'
        ? [
            payload['tripId'],
            payload['patientReference'],
            payload['operationReference'],
            payload['expiration'],
          ].map((value) => value.toString()).join('|')
        : [
            payload['uniqueId'],
            payload['patientReference'],
            payload['operationReference'],
            payload['checkpoint'],
            payload['expiration'],
            payload['tripId'] ?? '',
            payload['routeId'] ?? '',
          ].map((value) => value.toString()).join('|');
    final digest =
        Hmac(sha256, utf8.encode(secret)).convert(utf8.encode(canonical));
    return digest.toString();
  }

  Map<String, dynamic> _normalize(Map<String, dynamic> payload) {
    final uniqueId =
        payload['uniqueId']?.toString() ?? payload['id']?.toString();
    final patientReference = payload['patientReference']?.toString() ??
        payload['patientId']?.toString();
    final operationReference = payload['operationReference']?.toString() ??
        payload['boardingCode']?.toString() ??
        payload['operationRef']?.toString();
    final expiration =
        payload['expiration']?.toString() ?? payload['expiresAt']?.toString();
    final signature =
        payload['secureHash']?.toString() ?? payload['signature']?.toString();
    final checkpoint =
        (payload['checkpoint']?.toString() ?? 'BOARDING').toUpperCase();

    return {
      'format': uniqueId == null ? 'legacy' : 'v1',
      'uniqueId': uniqueId ??
          '${payload['tripId'] ?? 'trip'}:${patientReference ?? 'patient'}:${operationReference ?? 'op'}',
      'patientReference': patientReference,
      'operationReference': operationReference,
      'expiration': expiration,
      'signature': signature,
      'checkpoint': checkpoint,
      'tripId': payload['tripId'],
      'routeId': payload['routeId'],
      'raw': payload,
    };
  }

  bool _constantTimeEquals(String a, String b) {
    if (a.length != b.length) return false;
    var result = 0;
    for (var i = 0; i < a.length; i++) {
      result |= a.codeUnitAt(i) ^ b.codeUnitAt(i);
    }
    return result == 0;
  }
}
