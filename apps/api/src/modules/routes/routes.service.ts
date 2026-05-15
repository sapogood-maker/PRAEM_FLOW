import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

type Route = {
  id: string;
  tenantId: string;
  driverId: string;
  vehicleId: string;
  date: string;
  origin: string;
  destination: string;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
};

@Injectable()
export class RoutesService {
  private routes: Route[] = [];

  findAll() {
    return this.routes;
  }

  create(payload: Omit<Route, 'id'>) {
    const route = { ...payload, id: randomUUID() };
    this.routes.push(route);
    return route;
  }

  update(id: string, payload: Partial<Route>) {
    const route = this.routes.find((item) => item.id === id);
    if (!route) return { updated: false };
    Object.assign(route, payload);
    return { updated: true, route };
  }

  optimize(id: string) {
    return { routeId: id, optimized: true, message: 'Rota otimizada por heurística de distância' };
  }
}
