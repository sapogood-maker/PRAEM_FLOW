import type { CsvRow } from './exportCsv';

/** Generate a multi-sheet Excel-compatible HTML table file (.xls) */
export function exportExcel(
  sheets: { name: string; columns: { key: string; label: string }[]; rows: CsvRow[] }[],
  filename: string,
): void {
  const sheetsHtml = sheets
    .map(
      (sheet) => `
      <table>
        <thead>
          <tr>${sheet.columns.map((c) => `<th>${c.label}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${sheet.rows
            .map(
              (row) =>
                `<tr>${sheet.columns.map((c) => `<td>${row[c.key] ?? ''}</td>`).join('')}</tr>`,
            )
            .join('')}
        </tbody>
      </table>`,
    )
    .join('<br>');

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:x="urn:schemas-microsoft-com:office:excel"
    xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8">
    <meta name="ProgId" content="Excel.Sheet">
    <style>
      th { background: #0e7490; color: white; font-weight: bold; }
      td, th { border: 1px solid #ccc; padding: 4px 8px; }
      table { border-collapse: collapse; margin-bottom: 16px; }
    </style>
  </head>
  <body>${sheetsHtml}</body>
</html>`;

  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}
