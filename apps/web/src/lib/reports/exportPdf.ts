/**
 * PDF export via browser print.
 * Generates a self-contained HTML document and opens it in a new window for printing.
 */

export interface PdfSection {
  title: string;
  rows: { label: string; value: string | number }[];
}

export interface PdfReportConfig {
  title: string;
  subtitle: string;
  date: string;
  municipality?: string;
  sections: PdfSection[];
}

export function printOperationalReport(config: PdfReportConfig): void {
  const sectionsHtml = config.sections
    .map(
      (section) => `
      <div class="section">
        <h3 class="section-title">${section.title}</h3>
        <table class="data-table">
          <tbody>
            ${section.rows
              .map(
                (row) => `
              <tr>
                <td class="label-cell">${row.label}</td>
                <td class="value-cell">${row.value}</td>
              </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${config.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Arial', sans-serif;
      font-size: 12px;
      color: #1a1a1a;
      background: #fff;
      padding: 32px;
    }
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      border-bottom: 3px solid #0e7490;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .header-left h1 {
      font-size: 20px;
      font-weight: 700;
      color: #0e7490;
      letter-spacing: 0.05em;
    }
    .header-left p {
      font-size: 12px;
      color: #555;
      margin-top: 4px;
    }
    .header-right {
      text-align: right;
      font-size: 11px;
      color: #555;
    }
    .header-right strong {
      display: block;
      font-size: 13px;
      color: #1a1a1a;
    }
    .badge {
      display: inline-block;
      background: #0e7490;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      padding: 3px 10px;
      border-radius: 20px;
      margin-bottom: 8px;
    }
    .section {
      margin-bottom: 24px;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #0e7490;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 6px;
      margin-bottom: 10px;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
    }
    .data-table tr:nth-child(even) td {
      background: #f9fafb;
    }
    .label-cell {
      padding: 5px 8px;
      color: #555;
      font-size: 11px;
      width: 55%;
    }
    .value-cell {
      padding: 5px 8px;
      font-weight: 600;
      color: #1a1a1a;
      font-size: 12px;
    }
    .footer {
      margin-top: 32px;
      border-top: 1px solid #e5e7eb;
      padding-top: 12px;
      font-size: 10px;
      color: #888;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { padding: 16px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <span class="badge">PRAEM OPS · RELATÓRIO OPERACIONAL</span>
      <h1>${config.title}</h1>
      <p>${config.subtitle}</p>
    </div>
    <div class="header-right">
      <strong>${config.date}</strong>
      ${config.municipality ? `<span>${config.municipality}</span>` : ''}
    </div>
  </div>

  ${sectionsHtml}

  <div class="footer">
    <span>PRAEM OPS · Central de Controle Operacional</span>
    <span>Emitido em: ${new Date().toLocaleString('pt-BR')}</span>
  </div>

  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    alert('Permita pop-ups para exportar o relatório em PDF.');
    return;
  }
  win.document.write(html);
  win.document.close();
}
