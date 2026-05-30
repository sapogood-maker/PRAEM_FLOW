import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GenerateDispatchPlanDto } from './dto/generate-dispatch-plan.dto';
import { SuggestOperationalGroupingDto } from './dto/suggest-operational-grouping.dto';
import { DispatchEngineService } from './dispatch-engine.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dispatch-engine')
export class DispatchEngineController {
  constructor(private readonly dispatchEngineService: DispatchEngineService) {}

  @Post('plan')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR', 'SUPERVISOR', 'ADMIN_PREFEITURA')
  plan(@Body() body: GenerateDispatchPlanDto) {
    return this.dispatchEngineService.generatePlan({
      patients: body.patients ?? [],
      vehicles: body.vehicles ?? [],
    });
  }

  @Post('suggest-grouping')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR', 'SUPERVISOR', 'ADMIN_PREFEITURA')
  suggestGrouping(@Body() body: SuggestOperationalGroupingDto) {
    return this.dispatchEngineService.suggestOperationalGrouping({
      demands: body.demands ?? [],
      vehicleCapacity: body.vehicleCapacity,
    });
  }
}
