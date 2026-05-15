import { Module } from '@nestjs/common';
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
import { RealtimeGateway } from './gateways/realtime.gateway';
import { DashboardService } from './modules/dashboard/dashboard.service';

@Module({
  imports: [
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
  ],
  providers: [RealtimeGateway],
})
export class AppModule {
  constructor(
    private readonly gateway: RealtimeGateway,
    private readonly dashboardService: DashboardService,
  ) {
    setInterval(() => {
      this.gateway.emitDashboardKpis(this.dashboardService.kpis());
    }, 30000);
  }
}
