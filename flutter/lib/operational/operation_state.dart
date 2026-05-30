// lib/operational/operation_state.dart
// Explicit operational state machine for the PRAEM driver app.

import 'package:flutter/material.dart';
import '../core/constants.dart';

/// All valid operational states for a driver session.
enum OperationalState {
  offline, // Sem rota ativa
  created, // Rota criada, aguardando despacho
  dispatched, // Rota despachada pela central
  driverAccepted, // Motorista aceitou
  waitingPatient, // Aguardando passageiro no ponto
  boarding, // Passageiro escaneado, embarcando
  boarded, // Todos embarcados, pronto para partir
  inTransit, // Em deslocamento
  arrived, // Chegou ao destino
  completed, // Viagem concluída
  noShow, // Passageiro não compareceu
}

/// Valid state transitions — key: from state, value: allowed next states.
const Map<OperationalState, Set<OperationalState>> kValidTransitions = {
  OperationalState.offline: {
    OperationalState.created,
    OperationalState.dispatched,
  },
  OperationalState.created: {
    OperationalState.dispatched,
    OperationalState.offline,
  },
  OperationalState.dispatched: {
    OperationalState.driverAccepted,
    OperationalState.offline,
  },
  OperationalState.driverAccepted: {
    OperationalState.waitingPatient,
    OperationalState.dispatched,
  },
  OperationalState.waitingPatient: {
    OperationalState.boarding,
    OperationalState.noShow,
    OperationalState.driverAccepted,
  },
  OperationalState.boarding: {
    OperationalState.boarded,
    OperationalState.inTransit,
    OperationalState.noShow,
    OperationalState.waitingPatient,
  },
  OperationalState.boarded: {
    OperationalState.inTransit,
    OperationalState.boarding,
  },
  OperationalState.inTransit: {
    OperationalState.arrived,
    OperationalState.completed,
  },
  OperationalState.arrived: {
    OperationalState.completed,
    OperationalState.inTransit,
  },
  OperationalState.completed: {
    OperationalState.offline,
    OperationalState.created,
  },
  OperationalState.noShow: {
    OperationalState.inTransit,
    OperationalState.completed,
    OperationalState.offline,
  },
};

/// Convert a raw string (from API / WS) to an OperationalState.
OperationalState operationalStateFromString(String? raw) {
  switch ((raw ?? '').toUpperCase()) {
    case 'DISPATCHED':
      return OperationalState.dispatched;
    case 'DRIVER_ACCEPTED':
      return OperationalState.driverAccepted;
    case 'WAITING_PATIENT':
      return OperationalState.waitingPatient;
    case 'BOARDING':
      return OperationalState.boarding;
    case 'BOARDED':
      return OperationalState.boarded;
    case 'IN_TRANSIT':
    case 'IN_PROGRESS':
      return OperationalState.inTransit;
    case 'ARRIVED':
      return OperationalState.arrived;
    case 'COMPLETED':
      return OperationalState.completed;
    case 'NO_SHOW':
      return OperationalState.noShow;
    case 'CREATED':
    case 'SCHEDULED':
    case 'PLANNED':
    case 'PENDING':
    case 'PREPARING':
      return OperationalState.created;
    default:
      return OperationalState.offline;
  }
}

/// Serialize OperationalState to a string for storage.
String operationalStateToString(OperationalState state) {
  switch (state) {
    case OperationalState.offline:
      return 'OFFLINE';
    case OperationalState.created:
      return 'CREATED';
    case OperationalState.dispatched:
      return 'DISPATCHED';
    case OperationalState.driverAccepted:
      return 'DRIVER_ACCEPTED';
    case OperationalState.waitingPatient:
      return 'WAITING_PATIENT';
    case OperationalState.boarding:
      return 'BOARDING';
    case OperationalState.boarded:
      return 'BOARDED';
    case OperationalState.inTransit:
      return 'IN_TRANSIT';
    case OperationalState.arrived:
      return 'ARRIVED';
    case OperationalState.completed:
      return 'COMPLETED';
    case OperationalState.noShow:
      return 'NO_SHOW';
  }
}

/// PT-BR display label for each operational state.
String operationalStateLabel(OperationalState state) {
  switch (state) {
    case OperationalState.offline:
      return 'OFFLINE';
    case OperationalState.created:
      return 'AGUARDANDO DESPACHO';
    case OperationalState.dispatched:
      return 'ROTA DESPACHADA';
    case OperationalState.driverAccepted:
      return 'ROTA ACEITA';
    case OperationalState.waitingPatient:
      return 'AGUARDANDO PASSAGEIRO';
    case OperationalState.boarding:
      return 'EMBARQUE';
    case OperationalState.boarded:
      return 'TODOS EMBARCADOS';
    case OperationalState.inTransit:
      return 'EM DESLOCAMENTO';
    case OperationalState.arrived:
      return 'CHEGADA';
    case OperationalState.completed:
      return 'CONCLUÍDO';
    case OperationalState.noShow:
      return 'NÃO COMPARECEU';
  }
}

/// UI accent color for each state.
Color operationalStateColor(OperationalState state) {
  switch (state) {
    case OperationalState.offline:
      return AppColors.danger;
    case OperationalState.created:
      return AppColors.textSecondary;
    case OperationalState.dispatched:
      return AppColors.warning;
    case OperationalState.driverAccepted:
      return AppColors.warning;
    case OperationalState.waitingPatient:
      return AppColors.warning;
    case OperationalState.boarding:
      return AppColors.boarding;
    case OperationalState.boarded:
      return AppColors.primary;
    case OperationalState.inTransit:
      return AppColors.primary;
    case OperationalState.arrived:
      return AppColors.info;
    case OperationalState.completed:
      return AppColors.completed;
    case OperationalState.noShow:
      return AppColors.danger;
  }
}
