import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { buildMonthlyReportData } from './monthlyReportData.js';
import {
  buildMonthlyReportFilename,
  buildMonthlyReportWorkbookBlob,
  downloadMonthlyReportWorkbookBlob,
} from './monthlyReportWorkbook.js';

const NOW = new Date(2026, 7, 19, 12); // 19/08/2026

const CATEGORIES = [{ id: 'c1', name: 'Alimentação' }, { id: 'c2', name: 'Salário' }];

function tx({
  id, type, amount, categoryId, date, description = 'Lançamento', createdAt = '2026-08-10T10:00:00Z',
}) {
  return {
    id,
    transaction_type: type,
    amount,
    category_id: categoryId,
    transaction_date: date,
    status: 'completed',
    description,
    created_at: createdAt,
  };
}

function agendaItem({
  id, title, startsAt, status = 'scheduled',
}) {
  return {
    id, title, starts_at: startsAt, ends_at: null, status, is_all_day: false, has_explicit_time: true,
  };
}

async function readBlobAsWorkbook(blob) {
  const buffer = Buffer.from(await blob.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

// ============================================================================
// RELATORIO-SPREADSHEET1 -- workbook único (nunca dois arquivos), MESMA
// fonte que a UI (buildMonthlyReportData), nunca uma segunda regra.
// ============================================================================

test('workbook contém EXATAMENTE duas sheets: Movimentações e Agenda -- nunca uma terceira "Resumo"', async () => {
  const report = buildMonthlyReportData({ transactions: [], agendaItems: [], now: NOW });
  const blob = await buildMonthlyReportWorkbookBlob(report);
  const workbook = await readBlobAsWorkbook(blob);
  assert.deepEqual(workbook.worksheets.map((s) => s.name), ['Movimentações', 'Agenda']);
});

test('arquivo gerado é válido e pode ser lido novamente programaticamente', async () => {
  const transactions = [tx({
    id: 1, type: 'expense', amount: 50, categoryId: 'c1', date: '2026-08-19',
  })];
  const report = buildMonthlyReportData({ transactions, categories: CATEGORIES, now: NOW });
  const blob = await buildMonthlyReportWorkbookBlob(report);
  assert.ok(blob.size > 0);
  const workbook = await readBlobAsWorkbook(blob);
  assert.ok(workbook.worksheets.length === 2);
});

test('sheet Movimentações tem as colunas corretas (Data, Hora, Tipo, Descrição, Categoria, Valor)', async () => {
  const report = buildMonthlyReportData({ transactions: [], now: NOW });
  const blob = await buildMonthlyReportWorkbookBlob(report);
  const workbook = await readBlobAsWorkbook(blob);
  const sheet = workbook.getWorksheet('Movimentações');
  const headerValues = sheet.getRow(1).values.slice(1);
  assert.deepEqual(headerValues, ['Data', 'Hora', 'Tipo', 'Descrição', 'Categoria', 'Valor']);
});

test('sheet Agenda tem as colunas corretas (Data, Hora, Compromisso, Lembrete, Status)', async () => {
  const report = buildMonthlyReportData({ agendaItems: [], now: NOW });
  const blob = await buildMonthlyReportWorkbookBlob(report);
  const workbook = await readBlobAsWorkbook(blob);
  const sheet = workbook.getWorksheet('Agenda');
  const headerValues = sheet.getRow(1).values.slice(1);
  assert.deepEqual(headerValues, ['Data', 'Hora', 'Compromisso', 'Lembrete', 'Status']);
});

test('XLSX contém TODAS as linhas do mês -- nenhuma truncada', async () => {
  const transactions = [1, 2, 3, 4, 5].map((n) => tx({
    id: n, type: 'expense', amount: n * 10, categoryId: 'c1', date: `2026-08-0${n}`,
  }));
  const report = buildMonthlyReportData({ transactions, categories: CATEGORIES, now: NOW });
  const blob = await buildMonthlyReportWorkbookBlob(report);
  const workbook = await readBlobAsWorkbook(blob);
  const sheet = workbook.getWorksheet('Movimentações');
  assert.equal(sheet.rowCount, 6); // 1 header + 5 linhas
});

test('valor é uma célula NUMÉRICA real (nunca string "R$ ..."), com o sinal correto', async () => {
  const transactions = [
    tx({
      id: 'inc', type: 'income', amount: 100, categoryId: 'c2', date: '2026-08-10',
    }),
    tx({
      id: 'exp', type: 'expense', amount: 50, categoryId: 'c1', date: '2026-08-19',
    }),
  ];
  const report = buildMonthlyReportData({ transactions, categories: CATEGORIES, now: NOW });
  const blob = await buildMonthlyReportWorkbookBlob(report);
  const workbook = await readBlobAsWorkbook(blob);
  const sheet = workbook.getWorksheet('Movimentações');
  const values = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    values.push(row.getCell(6).value);
  });
  for (const value of values) assert.equal(typeof value, 'number');
  // Mais recente primeiro (mesma ordem da UI): Saída R$50 negativa, Entrada R$100 positiva.
  assert.deepEqual(values, [-50, 100]);
});

test('DADOS XLSX === DADOS UI: soma das saídas no XLSX bate com o resumo (mesma fonte, nunca matemática paralela)', async () => {
  const transactions = [
    tx({
      id: 1, type: 'expense', amount: 92.8, categoryId: 'c1', date: '2026-08-05',
    }),
    tx({
      id: 2, type: 'expense', amount: 50, categoryId: 'c1', date: '2026-08-19',
    }),
  ];
  const report = buildMonthlyReportData({ transactions, categories: CATEGORIES, now: NOW });
  assert.equal(report.summary.expense, 142.8);

  const blob = await buildMonthlyReportWorkbookBlob(report);
  const workbook = await readBlobAsWorkbook(blob);
  const sheet = workbook.getWorksheet('Movimentações');
  let total = 0;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    total += Number(row.getCell(6).value);
  });
  assert.equal(Math.abs(total), 142.8);
});

test('data é uma célula de DATA real no Excel (Date), não uma string', async () => {
  const transactions = [tx({
    id: 1, type: 'expense', amount: 10, categoryId: 'c1', date: '2026-08-19',
  })];
  const report = buildMonthlyReportData({ transactions, categories: CATEGORIES, now: NOW });
  const blob = await buildMonthlyReportWorkbookBlob(report);
  const workbook = await readBlobAsWorkbook(blob);
  const sheet = workbook.getWorksheet('Movimentações');
  const cellValue = sheet.getRow(2).getCell(1).value;
  assert.ok(cellValue instanceof Date);
  assert.equal(cellValue.getDate(), 19);
});

test('Agenda: "Dia inteiro" é preservado como texto quando aplicável', async () => {
  const items = [agendaItem({ id: 1, title: 'Estudar', startsAt: new Date(2026, 7, 14, 0, 0).toISOString() })];
  const allDayItem = { ...items[0], is_all_day: true, has_explicit_time: false };
  const report = buildMonthlyReportData({ agendaItems: [allDayItem], now: NOW });
  const blob = await buildMonthlyReportWorkbookBlob(report);
  const workbook = await readBlobAsWorkbook(blob);
  const sheet = workbook.getWorksheet('Agenda');
  assert.equal(sheet.getRow(2).getCell(2).value, 'Dia inteiro');
});

test('cabeçalho tem freeze da primeira linha (views frozen) e autofilter', async () => {
  const transactions = [tx({
    id: 1, type: 'expense', amount: 10, categoryId: 'c1', date: '2026-08-19',
  })];
  const report = buildMonthlyReportData({ transactions, categories: CATEGORIES, now: NOW });
  const blob = await buildMonthlyReportWorkbookBlob(report);
  const workbook = await readBlobAsWorkbook(blob);
  const sheet = workbook.getWorksheet('Movimentações');
  assert.equal(sheet.views[0].state, 'frozen');
  assert.equal(sheet.views[0].ySplit, 1);
  assert.ok(sheet.autoFilter);
});

test('nome do arquivo usa o mês selecionado -- "uniflow-relatorio-YYYY-MM.xlsx"', () => {
  const report = buildMonthlyReportData({ transactions: [], now: new Date(2026, 6, 15, 12) });
  assert.equal(buildMonthlyReportFilename(report.period), 'uniflow-relatorio-2026-07.xlsx');
});

test('download dispara um único <a download> temporário -- mesmo padrão de downloadTransactionsCsv/downloadAudioReviewJson', () => {
  const created = [];
  const fakeAnchor = {
    click() { this.clicked = true; },
    remove() { this.removed = true; },
  };
  const fakeDocument = {
    createElement: (tag) => {
      assert.equal(tag, 'a');
      created.push(fakeAnchor);
      return fakeAnchor;
    },
    body: { append: () => {} },
  };
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:fake';
  URL.revokeObjectURL = () => {};
  try {
    downloadMonthlyReportWorkbookBlob(new Blob(['x']), 'uniflow-relatorio-2026-08.xlsx', fakeDocument);
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
  assert.equal(created.length, 1);
  assert.equal(fakeAnchor.download, 'uniflow-relatorio-2026-08.xlsx');
  assert.equal(fakeAnchor.clicked, true);
  assert.equal(fakeAnchor.removed, true);
});

// BUGFIX (Android/PWA): revogar a blob: URL antes do gerenciador de
// downloads do Android terminar de ler os bytes produzia um arquivo com
// nome/tamanho corretos e 0 bytes de conteúdo -- exatamente o bug
// relatado ("reconhece nome/tamanho, mas não salva"). A revogação agora é
// adiada, nunca síncrona ao clique.
test('revokeObjectURL NUNCA é síncrono ao clique -- só depois de um atraso, para o Android terminar o handoff ao gerenciador de downloads', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fakeAnchor = { click() {}, remove() {} };
  const fakeDocument = {
    createElement: () => fakeAnchor,
    body: { append: () => {} },
  };
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let revoked = false;
  URL.createObjectURL = () => 'blob:fake';
  URL.revokeObjectURL = () => { revoked = true; };
  try {
    downloadMonthlyReportWorkbookBlob(new Blob(['x']), 'uniflow-relatorio-2026-08.xlsx', fakeDocument);
    assert.equal(revoked, false, 'revogar imediatamente após o clique é o bug -- nunca deve acontecer');
    t.mock.timers.tick(4000);
    assert.equal(revoked, true, 'a URL deve ser revogada eventualmente, só não no mesmo tick do clique');
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
});
