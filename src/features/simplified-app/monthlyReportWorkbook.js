import ExcelJS from 'exceljs';

/**
 * RELATORIO-SPREADSHEET1 -- gera o ÚNICO arquivo .xlsx do relatório (nunca
 * dois arquivos separados). Consome DIRETAMENTE o mesmo `reportData`
 * (buildMonthlyReportData -- monthlyReportData.js) que alimenta a UI da
 * planilha -- mesma fonte única, nunca uma segunda regra de cálculo.
 *
 * Este módulo só é alcançado via import() dinâmico (ver
 * SimplifiedReportSpreadsheetPage.jsx) -- o exceljs nunca entra no bundle
 * inicial da Home/Relatório, só é baixado quando o usuário toca em
 * "Baixar planilha".
 */

const HEADER_FILL = Object.freeze({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE9ECF5' },
});
const CURRENCY_FORMAT = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const DATE_FORMAT = 'dd/mm/yyyy';

function styleHeaderRow(row) {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFB7C0D8' } } };
  });
}

function buildTransactionsSheet(workbook, transactions) {
  const sheet = workbook.addWorksheet('Movimentações', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Data', key: 'data', width: 12 },
    { header: 'Hora', key: 'hora', width: 10 },
    { header: 'Tipo', key: 'tipo', width: 12 },
    { header: 'Descrição', key: 'descricao', width: 30 },
    { header: 'Categoria', key: 'categoria', width: 20 },
    { header: 'Valor', key: 'valor', width: 16 },
  ];

  for (const row of transactions) {
    const [year, month, day] = row.dateKey.split('-').map(Number);
    sheet.addRow({
      // Data real (nunca string) -- permite ordenação/filtro nativos do
      // Excel. Meio-dia local evita qualquer virada de dia por timezone.
      data: new Date(year, month - 1, day, 12),
      hora: row.timeLabel,
      tipo: row.typeLabel,
      descricao: row.description,
      categoria: row.categoryName,
      // Numérico real, sinal preserva Entrada(+)/Saída(-) -- nunca uma
      // string "R$ 50,00": permite SUM/filtros/fórmulas no Excel.
      valor: row.signedAmount,
    });
  }

  sheet.getColumn('data').numFmt = DATE_FORMAT;
  sheet.getColumn('valor').numFmt = CURRENCY_FORMAT;
  styleHeaderRow(sheet.getRow(1));
  if (transactions.length > 0) {
    sheet.autoFilter = { from: 'A1', to: `F${transactions.length + 1}` };
  }
  return sheet;
}

function buildAgendaSheet(workbook, agenda) {
  const sheet = workbook.addWorksheet('Agenda', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Data', key: 'data', width: 12 },
    { header: 'Hora', key: 'hora', width: 14 },
    { header: 'Compromisso', key: 'compromisso', width: 32 },
    { header: 'Lembrete', key: 'lembrete', width: 16 },
    { header: 'Status', key: 'status', width: 14 },
  ];

  for (const item of agenda) {
    sheet.addRow({
      data: item.dateShort,
      hora: item.timeLabel,
      compromisso: item.title,
      lembrete: item.reminderLabel ?? '—',
      status: item.statusLabel,
    });
  }

  styleHeaderRow(sheet.getRow(1));
  if (agenda.length > 0) {
    sheet.autoFilter = { from: 'A1', to: `E${agenda.length + 1}` };
  }
  return sheet;
}

/**
 * Workbook com EXATAMENTE duas sheets públicas nesta fase (Movimentações,
 * Agenda) -- nunca uma terceira sheet "Resumo" (já existe no app).
 */
export async function buildMonthlyReportWorkbookBlob(reportData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'UniFlow AI';
  workbook.created = new Date();

  buildTransactionsSheet(workbook, reportData.transactions ?? []);
  buildAgendaSheet(workbook, reportData.agenda ?? []);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** "uniflow-relatorio-2026-08.xlsx" -- mês selecionado governa o nome. */
export function buildMonthlyReportFilename(period) {
  return `uniflow-relatorio-${String(period.dateFrom).slice(0, 7)}.xlsx`;
}

/**
 * Dispara o download no navegador -- mesmo padrão (Blob + link temporário)
 * já usado por downloadTransactionsCsv (transactionExportUtils.js) e
 * downloadAudioReviewJson (audioReviewStorage.js).
 */
export function downloadMonthlyReportWorkbookBlob(blob, filename, documentRef = globalThis.document) {
  const url = URL.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  documentRef.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
