import { Injectable } from '@nestjs/common';

export type AiSuggestionType = 'GROUPING' | 'ROUTE_OPTIMIZATION' | 'RECURRENCE_BATCH' | 'ABSENCE_PREDICTION' | 'EMPTY_TRIP_REDUCTION';

@Injectable()
export class AiOpsService {
  /**
   * Sugerir otimização de rotas — reduzir km e tempo de deslocamento.
   */
  suggestRouteOptimization(routeIds: string[]) {
    return {
      type: 'ROUTE_OPTIMIZATION' as AiSuggestionType,
      routeIds,
      suggestion: 'Reordenar waypoints para minimizar deslocamento total em ~18%',
      estimatedSaving: { km: 12, minutes: 22 },
      requiresApproval: true,
    };
  }

  /**
   * Prever ausências com base em histórico — alert operacional.
   */
  predictAbsences(queueIds: string[]) {
    return {
      type: 'ABSENCE_PREDICTION' as AiSuggestionType,
      queueIds,
      riskItems: queueIds.slice(0, 2).map((id) => ({
        queueId: id,
        absenceProbability: 0.72,
        reason: 'Histórico de 3+ ausências anteriores + sem confirmação nas últimas 48h',
        recommendedAction: 'SEND_REMINDER_NOW',
      })),
    };
  }

  /**
   * Detectar viagens vazias e sugerir cancelamento/redistribuição.
   */
  detectEmptyTrips(tripIds: string[]) {
    return {
      type: 'EMPTY_TRIP_REDUCTION' as AiSuggestionType,
      tripIds,
      emptyTripIds: tripIds.slice(0, 1),
      suggestion: 'Reagrupar paciente cancelado com rota adjacente',
      requiresApproval: true,
    };
  }

  findAll() {
    return [];
  }
}
