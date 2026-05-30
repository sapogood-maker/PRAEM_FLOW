import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { SusImportHistoryQueryDto } from '../dto/sus-import-history-query.dto';
import { SusImportPreviewQueryDto } from '../dto/sus-import-preview-query.dto';
import { UploadSusImportDto } from '../dto/upload-sus-import.dto';
import { SusImportService } from '../services/sus-import.service';

interface AuthRequest {
  user: { tenantId: string; userId?: string; role: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sus-import')
export class SusImportController {
  constructor(private readonly susImportService: SusImportService) {}

  @Post('upload')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR', 'SUPERVISOR', 'ADMIN_PREFEITURA')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Request() req: AuthRequest,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string; size?: number } | undefined,
    @Body() body: UploadSusImportDto,
  ) {
    return this.susImportService.upload(req.user.tenantId, req.user.userId, file, body);
  }

  @Get('history')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR', 'SUPERVISOR', 'ADMIN_PREFEITURA', 'VIEWER')
  history(@Request() req: AuthRequest, @Query() query: SusImportHistoryQueryDto) {
    return this.susImportService.history(
      req.user.tenantId,
      query.page ? Number(query.page) : 1,
      query.limit ? Number(query.limit) : 20,
    );
  }

  @Get(':id/preview')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR', 'SUPERVISOR', 'ADMIN_PREFEITURA', 'VIEWER')
  preview(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Query() query: SusImportPreviewQueryDto,
  ) {
    return this.susImportService.preview(
      req.user.tenantId,
      id,
      query.page ? Number(query.page) : 1,
      query.limit ? Number(query.limit) : 100,
    );
  }
}

