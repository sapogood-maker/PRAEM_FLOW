import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface OperationalKpis {
  patientsToday: number;
  waitingPatients: number;
  boardedPatients: number;
  inTransitPatients: number;
  arrivedPatients: number;
  criticalPatients: number;
  activeRoutes: number;
  completedTrips: number;
  activeVehicles: number;
  averageOccupancy: number;
  absences: number;
  delays: number;
  confirmationRate: number;
  absenceRate: number;
  unreachablePatients: number;
  estimatedKmToday: number;
  emptyTrips: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async kpis(tenantId: string): Promise<OperationalKpis> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      patientsToday,
      waitingPatients,
      boardedPatients,
      inTransitPatients,
      arrivedPatients,
      criticalPatients,
      activeRoutes,
      completedTrips,
      activeVehicles,
      confirmedCount,
      unreachablePatients,
      absences,
      routesWithKm,
    ] = await Promise.all([
      // Pacientes com agendamento hoje
      this.prisma.operationalQueue.count({
        where: { tenantId, appointmentDate: { gte: today, lt: tomorrow } },
      }),
      // Aguardando
      this.prisma.trip.count({
        where: { tenantId, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
      }),
      // Embarque em andamento
      this.prisma.trip.count({
        where: { tenantId, status: { in: ['BOARDING', 'BOARDED'] as any[] } },
      }),
      // Em trânsito
      this.prisma.trip.count({
        where: { tenantId, status: { in: ['IN_TRANSIT'] as any[] } },
      }),
      // Chegou ao destino
      this.prisma.trip.count({
        where: { tenantId, status: 'ARRIVED' },
      }),
      // Críticos
      this.prisma.operationalQueue.count({
        where: { tenantId, priority: 'CRITICAL', status: { in: ['WAITING', 'ASSIGNED'] } },
      }),
      // Rotas ativas
      this.prisma.route.count({ where: { tenantId, status: 'ACTIVE' } }),
      // Viagens concluídas
      this.prisma.trip.count({ where: { tenantId, status: 'COMPLETED' } }),
      // Veículos ativos
      this.prisma.vehicle.count({ where: { tenantId, status: 'ON_ROUTE', active: true } }),
      // Confirmados hoje
      this.prisma.operationalQueue.count({
        where: { tenantId, confirmationStatus: 'CONFIRMED', appointmentDate: { gte: today, lt: tomorrow } },
      }),
      // Inacessíveis
      this.prisma.operationalQueue.count({
        where: { tenantId, confirmationStatus: 'UNREACHABLE' },
      }),
      // Faltas (NO_SHOW)
      this.prisma.trip.count({ where: { tenantId, status: 'NO_SHOW' } }),
      // Km estimado
      this.prisma.route.findMany({
        where: { tenantId, date: { gte: today, lt: tomorrow }, estimatedKm: { not: null } },
        select: { estimatedKm: true },
      }),
    ]);

    const estimatedKmToday = routesWithKm.reduce((sum: number, r: { estimatedKm: number | null }) => sum + (r.estimatedKm ?? 0), 0);
    const confirmationRate = patientsToday > 0 ? Math.round((confirmedCount / patientsToday) * 100) : 0;
    const absenceRate = patientsToday > 0 ? Math.round((absences / patientsToday) * 100) : 0;

    return {
      patientsToday,
      waitingPatients,
      boardedPatients,
      inTransitPatients,
      arrivedPatients,
      criticalPatients,
      activeRoutes,
      completedTrips,
      activeVehicles,
      averageOccupancy: 0, // computed separately when trip data richer
      absences,
      delays: 0,
      confirmationRate,
      absenceRate,
      unreachablePatients,
      estimatedKmToday: Math.round(estimatedKmToday),
      emptyTrips: 0,
    };
  }
}
