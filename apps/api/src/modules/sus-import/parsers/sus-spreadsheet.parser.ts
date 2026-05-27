import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Readable } from 'stream';

export interface ParsedSusRow {
  lineNumber: number;
  rawData: Record<string, string>;
}

function normalizeHeader(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

@Injectable()
export class SusSpreadsheetParser {
  async parse(file: { buffer: Buffer; originalname?: string; mimetype?: string }): Promise<ParsedSusRow[]> {
    const workbook = new ExcelJS.Workbook();
    const isCsv =
      String(file.originalname ?? '').toLowerCase().endsWith('.csv') ||
      String(file.mimetype ?? '').toLowerCase().includes('csv');

    if (isCsv) {
      const csvStream = Readable.from([file.buffer]);
      await workbook.csv.read(csvStream);
    } else {
      const xlsxStream = Readable.from([file.buffer]);
      await workbook.xlsx.read(xlsxStream);
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new BadRequestException('Spreadsheet has no worksheet');

    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, index) => {
      headers[index - 1] = normalizeHeader(String(cell.text ?? ''));
    });
    if (!headers.some(Boolean)) {
      throw new BadRequestException('Header row is empty');
    }

    const rows: ParsedSusRow[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const rawData: Record<string, string> = {};
      headers.forEach((header, i) => {
        if (!header) return;
        const cell = row.getCell(i + 1);
        rawData[header] = String(cell.text ?? '').trim();
      });
      const hasAnyValue = Object.values(rawData).some((v) => v.length > 0);
      if (!hasAnyValue) return;
      rows.push({ lineNumber: rowNumber, rawData });
    });

    if (rows.length === 0) {
      throw new BadRequestException('Spreadsheet has no data rows');
    }
    return rows;
  }
}
