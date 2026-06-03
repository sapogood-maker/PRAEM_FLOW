import { Module } from '@nestjs/common';
import { SusImportController } from './controllers/sus-import.controller';
import { SusImportService } from './services/sus-import.service';
import { SusSpreadsheetParser } from './parsers/sus-spreadsheet.parser';
import { SusImportRowValidator } from './validators/sus-import-row.validator';
import { SusImportRowMapper } from './mappers/sus-import-row.mapper';

@Module({
  controllers: [SusImportController],
  providers: [
    SusImportService,
    SusSpreadsheetParser,
    SusImportRowValidator,
    SusImportRowMapper,
  ],
  exports: [SusImportService],
})
export class SusImportModule {}
