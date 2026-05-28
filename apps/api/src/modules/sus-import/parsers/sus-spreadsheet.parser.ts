import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Readable } from 'stream';

export const SUS_IMPORT_COLUMNS = [
  'patient_name',
  'cpf',
  'phone',
  'origin_city',
  'destination_hospital',
  'destination_address',
  'appointment_date',
  'appointment_time',
  'notes',
  'priority',
  'companion',
  'return_trip',
  'special_requirements',
] as const;

type SusImportColumn = (typeof SUS_IMPORT_COLUMNS)[number];

const COLUMN_ALIASES: Record<SusImportColumn, string[]> = {
  patient_name: ['patient_name', 'nome_paciente', 'nome', 'paciente', 'usuario', 'beneficiario'],
  cpf: ['cpf', 'documento', 'patient_cpf'],
  phone: ['phone', 'telefone', 'celular', 'patient_phone'],
  origin_city: ['origin_city', 'cidade_origem', 'origem_cidade', 'cidade_origem_paciente'],
  destination_hospital: ['destination_hospital', 'hospital_destino', 'destino_hospital', 'hospital', 'clinica', 'destino', 'unidade'],
  destination_address: ['destination_address', 'endereco_destino', 'destino_endereco', 'hospital_endereco', 'endereco'],
  appointment_date: ['appointment_date', 'data_consulta', 'consulta_data', 'appointment_day', 'data', 'dia'],
  appointment_time: ['appointment_time', 'hora_consulta', 'consulta_hora', 'appointment_hour', 'hora', 'horario'],
  notes: ['notes', 'observacoes', 'obs'],
  priority: ['priority', 'prioridade'],
  companion: ['companion', 'acompanhante', 'tem_acompanhante'],
  return_trip: ['return_trip', 'viagem_retorno', 'retorno', 'ida_e_volta'],
  special_requirements: ['special_requirements', 'necessidades_especiais', 'requisitos_especiais'],
};

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
    const columnByIndex = new Map<number, SusImportColumn>();
    const aliasToCanonical = new Map<string, SusImportColumn>();
    SUS_IMPORT_COLUMNS.forEach((column) => {
      for (const alias of COLUMN_ALIASES[column]) {
        aliasToCanonical.set(normalizeHeader(alias), column);
      }
    });
    const foundColumns = new Set<SusImportColumn>();

    headerRow.eachCell({ includeEmpty: true }, (cell, index) => {
      const normalized = normalizeHeader(String(cell.text ?? ''));
      const canonical = aliasToCanonical.get(normalized);
      if (!canonical) return;
      if (foundColumns.has(canonical)) return;
      columnByIndex.set(index, canonical);
      foundColumns.add(canonical);
    });

    const missingColumns = ['patient_name', 'destination_hospital'].filter(
      (column) => !foundColumns.has(column as SusImportColumn),
    );
    if (missingColumns.length > 0) {
      throw new BadRequestException(
        `Missing required columns: ${missingColumns.join(', ')}`,
      );
    }

    const rows: ParsedSusRow[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const rawData: Record<string, string> = Object.fromEntries(
        SUS_IMPORT_COLUMNS.map((column) => [column, '']),
      );

      columnByIndex.forEach((column, cellIndex) => {
        const cell = row.getCell(cellIndex);
        rawData[column] = String(cell.text ?? '').trim();
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
