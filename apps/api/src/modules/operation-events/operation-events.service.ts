import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationsGateway } from '../../gateways/operations.gateway';

export type OperationActorType = 'SYSTEM' | 'USER' | 'DRIVER' | 'DEVICE' | 'PATIENT' | 'IMPORT';

export type RecordOperationEventInput = {
  tenantId: string;
  operationId: string;
  eventType: string;
  actorType?: OperationActorType;
  actorId?: string | null;
  routeId?: string | null;
  tripId?: string | null;
  patientId?: string | null;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class OperationEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: OperationsGateway,
  ) {}

  async record(input: RecordOperationEventInput) {
    const created = await this.prisma.operationEvent.create({
      data: {
        tenantId: input.tenantId,
        operationId: input.operationId,
        eventType: input.eventType,
        actorType: input.actorType ?? 'SYSTEM',
        actorId: input.actorId ?? null,
        routeId: input.routeId ?? null,
        tripId: input.tripId ?? null,
        patientId: input.patientId ?? null,
        metadata: (input.metadata ?? {}) as any,
      },
    });

    await this.prisma.operationalTimeline.create({
      data: {
        tenantId: input.tenantId,
        operationId: input.operationId,
        routeId: input.routeId ?? null,
        tripId: input.tripId ?? null,
        patientId: input.patientId ?? null,
        eventType: input.eventType,
        source: input.actorType ?? 'SYSTEM',
        metadata: {
          actorType: input.actorType ?? 'SYSTEM',
          actorId: input.actorId ?? null,
          ...((input.metadata ?? {}) as Record<string, unknown>),
        } as any,
      },
    });

    this.gateway.emitToTenant(input.tenantId, 'operation:event', {
      id: created.id,
      operationId: input.operationId,
      eventType: created.eventType,
      actorType: created.actorType,
      actorId: created.actorId,
      routeId: created.routeId,
      tripId: created.tripId,
      patientId: created.patientId,
      metadata: created.metadata,
      createdAt: created.createdAt.toISOString(),
    });

    return created;
  }
}
