import { Module } from '@nestjs/common';
import { SusImportController } from './controllers/sus-import.controller';
import { SusImportService } from './services/sus-import.service';
import { SusSpreadsheetParser } from './parsers/sus-spreadsheet.parser';
import { SusImportRowValidator } from './validators/sus-import-row.validator';
import { SusImportRowMapper } from './mappers/sus-import-row.mapper';
import { PatientsModule } from '../patients/patients.module';
import { OperationEventsModule } from '../operation-events/operation-events.module';

@Module({
  imports: [PatientsModule, OperationEventsModule],
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
