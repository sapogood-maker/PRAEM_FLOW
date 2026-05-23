import { Body, Controller, Get, Param, Post, Query, Request, UseGuards, Headers } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TrackingService, VehicleTrackingPayload } from './tracking.service';

interface AuthRequest { user: { tenantId: string } }

@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  /**
   * POST /tracking/heartbeat
   * Accepts a heartbeat from a vehicle device.
   * Optionally validates device auth via X-Device-Token header.
   * This endpoint is intentionally NOT behind JwtAuthGuard to allow tablet devices to call it.
   * Device security is handled by the X-Device-Token header validation inside the service.
   */
  @Post('heartbeat')
  async heartbeat(
    @Body() body: VehicleTrackingPayload,
    @Headers('x-device-token') deviceToken?: string,
  ) {
    const result = await this.trackingService.heartbeat(sanitizePayload(body) as VehicleTrackingPayload, deviceToken);
    return { ok: true, id: result.id, operationalStatus: result.operationalStatus };
  }

  /**
   * GET /tracking/live — live vehicle positions for the dashboard map.
   * Requires JWT.
   */
  @UseGuards(JwtAuthGuard)
  @Get('live')
  getLive(@Request() req: AuthRequest) {
    return this.trackingService.getLiveVehicles(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('history')
  history(
    @Request() req: AuthRequest,
    @Query('routeId') routeId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.trackingService.getTrackingHistory(req.user.tenantId, routeId, vehicleId, limit ? Number(limit) : undefined);
  }

  @UseGuards(JwtAuthGuard)
  @Get('timeline')
  timeline(
    @Request() req: AuthRequest,
    @Query('routeId') routeId?: string,
    @Query('tripId') tripId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.trackingService.getOperationalTimeline(req.user.tenantId, routeId, tripId, limit ? Number(limit) : undefined);
  }

  @UseGuards(JwtAuthGuard)
  @Get('replay')
  replay(
    @Request() req: AuthRequest,
    @Query('routeId') routeId: string,
    @Query('maxPoints') maxPoints?: string,
  ) {
    return this.trackingService.getRouteReplay(req.user.tenantId, routeId, maxPoints ? Number(maxPoints) : undefined);
  }

  /**
   * POST /tracking/offline-check — triggers offline vehicle detection for this tenant.
   */
  @UseGuards(JwtAuthGuard)
  @Post('offline-check')
  offlineCheck(@Request() req: AuthRequest) {
    return this.trackingService.detectOfflineVehicles(req.user.tenantId);
  }

  /**
   * POST /tracking/geofence — register a geofence event.
   */
  @UseGuards(JwtAuthGuard)
  @Post('geofence')
  geofence(@Request() req: AuthRequest, @Body() body: any) {
    return this.trackingService.registerGeoFenceEvent(req.user.tenantId, sanitizePayload(body) as any);
  }

  /**
   * GET /tracking/analytics — operational analytics summary.
   */
  @UseGuards(JwtAuthGuard)
  @Get('analytics')
  analytics(@Request() req: AuthRequest) {
    return this.trackingService.analytics(req.user.tenantId);
  }

  /**
   * POST /tracking/cleanup — smart retention: remove stale rows > 24h (keeps latest per vehicle).
   */
  @UseGuards(JwtAuthGuard)
  @Post('cleanup')
  cleanup(
    @Request() req: AuthRequest,
    @Query('retentionHours') retentionHours?: string,
    @Query('staleRetentionHours') staleRetentionHours?: string,
    @Query('snapshotRetentionHours') snapshotRetentionHours?: string,
    @Query('archive') archive?: string,
  ) {
    return this.trackingService.cleanup(req.user.tenantId, {
      retentionHours: retentionHours ? Number(retentionHours) : undefined,
      staleRetentionHours: staleRetentionHours ? Number(staleRetentionHours) : undefined,
      snapshotRetentionHours: snapshotRetentionHours ? Number(snapshotRetentionHours) : undefined,
      archiveEnabled: archive == null ? undefined : ['1', 'true', 'yes', 'on'].includes(archive.toLowerCase()),
    });
  }

  // Legacy endpoints for backward compat
  @UseGuards(JwtAuthGuard)
  @Post('update')
  update(@Body() body: VehicleTrackingPayload, @Request() req: AuthRequest) {
    return this.trackingService.heartbeat(sanitizePayload(body) as VehicleTrackingPayload);
  }

  @UseGuards(JwtAuthGuard)
  @Get('vehicles')
  vehicles() {
    return this.trackingService.vehicles();
  }

  @UseGuards(JwtAuthGuard)
  @Get('vehicles/:id')
  vehicleById(@Param('id') id: string) {
    return this.trackingService.vehicleById(id);
  }
}
