import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SusImportRowStatus, SusImportStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { UploadSusImportDto } from '../dto/upload-sus-import.dto';
import { ParsedSusRow, SusSpreadsheetParser } from '../parsers/sus-spreadsheet.parser';
import { SusImportRowValidator } from '../validators/sus-import-row.validator';
import { SusImportRowMapper } from '../mappers/sus-import-row.mapper';

type UploadFile = { buffer?: Buffer; originalname?: string; mimetype?: string; size?: number };

@Injectable()
export class SusImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: SusSpreadsheetParser,
    private readonly validator: SusImportRowValidator,
    private readonly mapper: SusImportRowMapper,
  ) {}

  async upload(
    tenantId: string,
    userId: string | undefined,
    file: UploadFile | undefined,
    dto: UploadSusImportDto,
  ) {
    const parsedRows = await this.resolveInputRows(tenantId, file, dto);

    const createdImport = await this.prisma.susImport.create({
      data: {
        tenantId,
        uploadedByUserId: userId ?? null,
        sourceSystem: dto.sourceSystem?.trim() || 'SUS',
        fileName: file?.originalname ?? `reprocess:${dto.reprocessFromImportId}`,
        fileMimeType: file?.mimetype ?? null,
        fileSizeBytes: file?.size ?? null,
        status: SusImportStatus.UPLOADED,
        notes: dto.notes?.trim() || null,
        reprocessedFromImportId: dto.reprocessFromImportId ?? null,
        processingAttempts: 1,
      },
      select: { id: true },
    });

    let validRows = 0;
    let invalidRows = 0;
    let duplicateRows = 0;
    let malformedRows = 0;
    let invalidDateRows = 0;
    const seenRowKeys = new Set<string>();

    const stagedRows: Prisma.SusImportRowCreateManyInput[] = parsedRows.map((row) => {
      const validation = this.validator.validate(row.rawData, {
        lineNumber: row.lineNumber,
        seenRowKeys,
      });
      const normalized = this.mapper.map(row.rawData);
      const rowHash = this.hashRow(row.rawData);

      if (validation.errors.some((e) => e.includes('DUPLICATE_ROW'))) duplicateRows += 1;
      if (validation.errors.some((e) => e.includes('MALFORMED_ROW'))) malformedRows += 1;
      if (validation.errors.some((e) => e.includes('INVALID_DATE'))) invalidDateRows += 1;

      if (validation.valid) validRows += 1;
      else invalidRows += 1;

      return {
        tenantId,
        importId: createdImport.id,
        lineNumber: row.lineNumber,
        rowHash,
        status: validation.valid ? SusImportRowStatus.VALID : SusImportRowStatus.INVALID,
        rawData: row.rawData as unknown as Prisma.InputJsonValue,
        normalizedData: normalized as unknown as Prisma.InputJsonValue,
        validationErrors: validation.errors as unknown as Prisma.InputJsonValue,
        validationWarnings: validation.warnings as unknown as Prisma.InputJsonValue,
      };
    });

    if (stagedRows.length > 0) {
      await this.prisma.susImportRow.createMany({ data: stagedRows });
    }

    const importStatus = invalidRows > 0 ? SusImportStatus.PREVIEW_READY : SusImportStatus.VALIDATED;
    await this.prisma.susImport.update({
      where: { id: createdImport.id },
      data: {
        totalRows: stagedRows.length,
        validRows,
        invalidRows,
        status: importStatus,
        metadata: {
          validationCompletedAt: new Date().toISOString(),
          canProcess: invalidRows === 0,
          duplicateRows,
          malformedRows,
          invalidDateRows,
          previewRequired: true,
        },
      },
    });

    return {
      id: createdImport.id,
      status: importStatus,
      totalRows: stagedRows.length,
      validRows,
      invalidRows,
      previewAvailable: true,
      canProcess: invalidRows === 0,
      preview: {
        endpoint: `/sus-import/${createdImport.id}/preview`,
        duplicateRows,
        malformedRows,
        invalidDateRows,
      },
    };
  }

  async history(tenantId: string, page = 1, limit = 20) {
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20;
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      this.prisma.susImport.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
        select: {
          id: true,
          sourceSystem: true,
          fileName: true,
          status: true,
          totalRows: true,
          validRows: true,
          invalidRows: true,
          processingAttempts: true,
          reprocessedFromImportId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.susImport.count({ where: { tenantId } }),
    ]);

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    };
  }

  async preview(tenantId: string, importId: string, page = 1, limit = 100) {
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 100;
    const skip = (safePage - 1) * safeLimit;

    const importHeader = await this.prisma.susImport.findFirst({
      where: { id: importId, tenantId },
      select: {
        id: true,
        status: true,
        sourceSystem: true,
        fileName: true,
        totalRows: true,
        validRows: true,
        invalidRows: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!importHeader) throw new NotFoundException('SUS import not found');

    const [rows, totalRows] = await Promise.all([
      this.prisma.susImportRow.findMany({
        where: { tenantId, importId },
        orderBy: { lineNumber: 'asc' },
        skip,
        take: safeLimit,
        select: {
          id: true,
          lineNumber: true,
          status: true,
          rawData: true,
          normalizedData: true,
          validationErrors: true,
          validationWarnings: true,
          createdAt: true,
        },
      }),
      this.prisma.susImportRow.count({ where: { tenantId, importId } }),
    ]);

    return {
      import: importHeader,
      rows,
      pagination: {
        total: totalRows,
        page: safePage,
        limit: safeLimit,
        pages: Math.ceil(totalRows / safeLimit),
      },
    };
  }

  private async resolveInputRows(
    tenantId: string,
    file: UploadFile | undefined,
    dto: UploadSusImportDto,
  ): Promise<ParsedSusRow[]> {
    if (file?.buffer?.length) {
      return this.parser.parse({
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      });
    }

    if (!dto.reprocessFromImportId) {
      throw new BadRequestException('file or reprocessFromImportId is required');
    }

    const source = await this.prisma.susImport.findFirst({
      where: { id: dto.reprocessFromImportId, tenantId },
      select: { id: true },
    });
    if (!source) {
      throw new NotFoundException('Source import for reprocessing not found');
    }

    const rows = await this.prisma.susImportRow.findMany({
      where: { tenantId, importId: source.id },
      orderBy: { lineNumber: 'asc' },
      select: { lineNumber: true, rawData: true },
    });
    if (rows.length === 0) {
      throw new BadRequestException('Source import has no staged rows to reprocess');
    }

    return rows.map((row) => ({
      lineNumber: row.lineNumber,
      rawData: (row.rawData ?? {}) as Record<string, string>,
    }));
  }

  private hashRow(rawData: Record<string, string>): string {
    return createHash('sha256').update(JSON.stringify(rawData)).digest('hex');
  }
}
