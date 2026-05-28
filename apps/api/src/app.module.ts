import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { PatientsModule } from './modules/patients/patients.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { QueuesModule } from './modules/queues/queues.module';
import { RoutesModule } from './modules/routes/routes.module';
import { TripsModule } from './modules/trips/trips.module';
import { CheckpointsModule } from './modules/checkpoints/checkpoints.module';
import { CommunicationModule } from './modules/communication/communication.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';
import { AiOpsModule } from './modules/ai-ops/ai-ops.module';
import { DailyOperationModule } from './modules/daily-operation/daily-operation.module';
import { OperationShiftModule } from './modules/operation-shift/operation-shift.module';
import { HealthcareLocationsModule } from './modules/healthcare-locations/healthcare-locations.module';
import { DevicesModule } from './modules/devices/devices.module';
import { HealthModule } from './modules/health/health.module';
import { GatewaysModule } from './gateways/gateways.module';
import { RealtimeGateway } from './gateways/realtime.gateway';
import { DashboardService } from './modules/dashboard/dashboard.service';
import { TripTokensModule } from './modules/trip-tokens/trip-tokens.module';
import { TripStopsModule } from './modules/trip-stops/trip-stops.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { SyncModule } from './modules/sync/sync.module';
import { SchedulingImportModule } from './modules/scheduling-import/scheduling-import.module';
import { SusImportModule } from './modules/sus-import/sus-import.module';
import { DispatchEngineModule } from './modules/dispatch-engine/dispatch-engine.module';
import { QrEngineModule } from './modules/qr-engine/qr-engine.module';
import { NotificationTemplatesModule } from './modules/notification-templates/notification-templates.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    GatewaysModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    PatientsModule,
    DriversModule,
    VehiclesModule,
    QueuesModule,
    RoutesModule,
    TripsModule,
    CheckpointsModule,
    CommunicationModule,
    TrackingModule,
    DashboardModule,
    AnalyticsModule,
    AuditModule,
    AiOpsModule,
    DailyOperationModule,
    OperationShiftModule,
    HealthcareLocationsModule,
    DevicesModule,
    HealthModule,
    TripTokensModule,
    TripStopsModule,
    WhatsappModule,
    SyncModule,
    SchedulingImportModule,
    SusImportModule,
    DispatchEngineModule,
    QrEngineModule,
    NotificationTemplatesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {
  constructor(
    private readonly gateway: RealtimeGateway,
    private readonly dashboardService: DashboardService,
  ) {}
}
