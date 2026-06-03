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
    if (parsed == null) return QrOfflineValidationResult.ok(_rawTokenPayload(raw));

    final payload = _normalize(parsed);
    final format = payload['format']?.toString();

    if (format == 'patient_v1') {
      final required = ['patientId', 'praemId', 'validationToken', 'signature'];
      for (final field in required) {
        if (payload[field] == null || payload[field].toString().isEmpty) {
          return QrOfflineValidationResult.invalid('QR incompleto');
        }
      }
      final expected = _sign(payload);
      final signature = payload['signature'].toString();
      if (!_constantTimeEquals(expected, signature)) {
        return QrOfflineValidationResult.invalid('Assinatura inválida');
      }
      return QrOfflineValidationResult.ok(payload);
    }

    if (format == 'trip_v1') {
      final required = [
        'tripId',
        'patientId',
        'routeId',
        'operationId',
        'validationToken',
        'signature',
        'expiresAt'
      ];
      for (final field in required) {
        if (payload[field] == null || payload[field].toString().isEmpty) {
          return QrOfflineValidationResult.invalid('QR incompleto');
        }
      }
      final expiresAt = DateTime.tryParse(payload['expiresAt'].toString());
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
    final format = payload['format']?.toString();
    final canonical = format == 'legacy'
        ? [
            payload['tripId'],
            payload['patientReference'],
            payload['operationReference'],
            payload['expiration'],
          ].map((value) => value.toString()).join('|')
        : format == 'patient_v1'
            ? [
                payload['patientId'],
                payload['praemId'],
                payload['validationToken'],
              ].map((value) => value.toString()).join('|')
            : format == 'trip_v1'
                ? [
                    payload['tripId'],
                    payload['patientId'],
                    payload['routeId'],
                    payload['operationId'],
                    payload['validationToken'],
                    payload['expiresAt'],
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
    final kind = payload['type']?.toString().toUpperCase();
    if (kind == 'PATIENT') {
      final patientId = payload['patient_id']?.toString() ??
          payload['patientId']?.toString() ??
          payload['patientReference']?.toString();
      final praemId =
          payload['praem_id']?.toString() ?? payload['praemId']?.toString();
      final validationToken = payload['validation_token']?.toString() ??
          payload['validationToken']?.toString() ??
          payload['qrToken']?.toString();
      final signature = payload['secure_hash']?.toString() ??
          payload['secureHash']?.toString() ??
          payload['signature']?.toString();
      return {
        'format': 'patient_v1',
        'type': 'PATIENT',
        'patientId': patientId,
        'praemId': praemId,
        'validationToken': validationToken,
        'signature': signature,
        'issuedAt': payload['issued_at']?.toString() ?? payload['issuedAt']?.toString(),
        'expiresAt':
            payload['expires_at']?.toString() ?? payload['expiresAt']?.toString(),
        'raw': payload,
      };
    }

    if (kind == 'TRIP') {
      final tripId =
          payload['trip_id']?.toString() ?? payload['tripId']?.toString();
      final patientId = payload['patient_id']?.toString() ??
          payload['patientId']?.toString() ??
          payload['patientReference']?.toString();
      final routeId =
          payload['route_id']?.toString() ?? payload['routeId']?.toString();
      final operationId = payload['operation_id']?.toString() ??
          payload['operationId']?.toString();
      final validationToken = payload['validation_token']?.toString() ??
          payload['validationToken']?.toString() ??
          payload['qrToken']?.toString();
      final signature = payload['secure_hash']?.toString() ??
          payload['secureHash']?.toString() ??
          payload['signature']?.toString();
      final expiresAt =
          payload['expires_at']?.toString() ?? payload['expiresAt']?.toString();
      return {
        'format': 'trip_v1',
        'type': 'TRIP',
        'tripId': tripId,
        'patientId': patientId,
        'routeId': routeId,
        'operationId': operationId,
        'validationToken': validationToken,
        'signature': signature,
        'issuedAt': payload['issued_at']?.toString() ?? payload['issuedAt']?.toString(),
        'expiresAt': expiresAt,
        'raw': payload,
      };
    }

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

  Map<String, dynamic> _rawTokenPayload(String raw) {
    return {
      'format': 'raw_token',
      'type': 'PATIENT',
      'validationToken': raw.trim(),
      'raw': raw.trim(),
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
