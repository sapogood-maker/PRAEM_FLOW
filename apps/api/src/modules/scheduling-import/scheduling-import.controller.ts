import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SchedulingImportService } from './scheduling-import.service';

interface AuthRequest {
  user: { tenantId: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('scheduling-import')
export class SchedulingImportController {
  constructor(private readonly schedulingImportService: SchedulingImportService) {}

  @Post('upload')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR', 'SUPERVISOR', 'ADMIN_PREFEITURA')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Request() req: AuthRequest,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string } | undefined,
    @Body()
    body: {
      mode?: 'PREVIEW' | 'APPLY';
      autoAssignVehicles?: boolean | string;
      defaultDispatchType?: 'SCHEDULED' | 'IMMEDIATE';
      defaultOrigin?: string;
    },
  ): Promise<any> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Spreadsheet file is required');
    }
    const safeFile = { buffer: file.buffer, originalname: file.originalname };
    const mode = String(body?.mode ?? 'PREVIEW').toUpperCase() === 'APPLY' ? 'APPLY' : 'PREVIEW';
    const autoAssignVehicles = String(body?.autoAssignVehicles ?? 'true').toLowerCase() !== 'false';
    const defaultDispatchType =
      String(body?.defaultDispatchType ?? 'SCHEDULED').toUpperCase() === 'IMMEDIATE'
        ? 'IMMEDIATE'
        : 'SCHEDULED';
    return this.schedulingImportService.importSpreadsheet(req.user.tenantId, safeFile, {
      mode,
      autoAssignVehicles,
      defaultDispatchType,
      defaultOrigin: body?.defaultOrigin,
    });
  }
}
