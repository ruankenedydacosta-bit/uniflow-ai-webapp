import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTransactionsCsv,
  buildTransactionsExportFilename,
  downloadTransactionsCsv,
  escapeCsvValue,
  neutralizeCsvFormulaValue,
  transactionToCsvRow,
} from './transactionExportUtils.js';

const categoriesById = new Map([
  ['cat-1', { id: 'cat-1', name: 'Alimentação' }],
]);
const accountsById = new Map([
  ['acc-1', { id: 'acc-1', name: 'Carteira' }],
  ['acc-2', { id: 'acc-2', name: 'Poupança' }],
]);

test('escapeCsvValue envolve em aspas apenas quando necessário', () => {
  assert.equal(escapeCsvValue('simples'), 'simples');
  assert.equal(escapeCsvValue('com, vírgula'), '"com, vírgula"');
  assert.equal(escapeCsvValue('com "aspas"'), '"com ""aspas"""');
  assert.equal(escapeCsvValue('linha\nquebrada'), '"linha\nquebrada"');
  assert.equal(escapeCsvValue(null), '');
  assert.equal(escapeCsvValue(undefined), '');
});

// --- Protecao contra CSV/formula injection -----------------------------------------

test('neutralizeCsvFormulaValue prefixa com apostrofo valores que comecam com =, +, - ou @', () => {
  assert.equal(neutralizeCsvFormulaValue('=SUM(A1:A2)'), "'=SUM(A1:A2)");
  assert.equal(neutralizeCsvFormulaValue('+cmd'), "'+cmd");
  assert.equal(neutralizeCsvFormulaValue('-10+20'), "'-10+20");
  assert.equal(neutralizeCsvFormulaValue('@SUM(A1:A2)'), "'@SUM(A1:A2)");
});

test('neutralizeCsvFormulaValue nao mexe em texto normal', () => {
  assert.equal(neutralizeCsvFormulaValue('Mercado'), 'Mercado');
  assert.equal(neutralizeCsvFormulaValue('Aluguel de julho'), 'Aluguel de julho');
});

test('neutralizeCsvFormulaValue nao aplica trim -- espaco antes do caractere perigoso ja e seguro no Excel, permanece inalterado', () => {
  assert.equal(neutralizeCsvFormulaValue(' =SUM(A1:A2)'), ' =SUM(A1:A2)');
});

test('neutralizeCsvFormulaValue trata null/undefined como string vazia, sem quebrar', () => {
  assert.equal(neutralizeCsvFormulaValue(null), '');
  assert.equal(neutralizeCsvFormulaValue(undefined), '');
});

test('transactionToCsvRow neutraliza descricao/observacao/forma de pagamento/nomes de conta e categoria perigosos', () => {
  const row = transactionToCsvRow(
    {
      transaction_date: '2026-07-21',
      transaction_type: 'expense',
      description: '=SUM(A1:A2)',
      account_id: 'acc-danger',
      destination_account_id: 'acc-danger-2',
      category_id: 'cat-danger',
      amount: 10,
      payment_method: '+cmd|calc',
      is_recurring: false,
      notes: '@SUM(A1:A2)',
    },
    {
      categoriesById: new Map([['cat-danger', { id: 'cat-danger', name: '-10+20' }]]),
      accountsById: new Map([
        ['acc-danger', { id: 'acc-danger', name: '=HYPERLINK("x")' }],
        ['acc-danger-2', { id: 'acc-danger-2', name: '+destino' }],
      ]),
    },
  );

  assert.equal(row[2], "'=SUM(A1:A2)");
  assert.equal(row[3], "'=HYPERLINK(\"x\")");
  assert.equal(row[4], "'+destino");
  assert.equal(row[5], "'-10+20");
  assert.equal(row[7], "'+cmd|calc");
  assert.equal(row[10], "'@SUM(A1:A2)");
});

test('transactionToCsvRow nao neutraliza data, tipo, valor formatado, parcela ou recorrencia (nunca sao texto livre do usuario)', () => {
  const row = transactionToCsvRow({
    transaction_date: '2026-07-21',
    transaction_type: 'expense',
    description: 'Mercado',
    account_id: 'acc-1',
    amount: 10,
    installment_number: 1,
    installment_total: 3,
    is_recurring: true,
  });

  assert.equal(row[0], '2026-07-21');
  assert.equal(row[1], 'Saída');
  assert.equal(row[6], '10.00');
  assert.equal(row[8], '1/3');
  assert.equal(row[9], 'Sim');
});

test('vírgulas e aspas em valores neutralizados continuam corretamente escapadas pelo pipeline completo (buildTransactionsCsv)', () => {
  const csv = buildTransactionsCsv(
    [
      {
        transaction_date: '2026-07-21',
        transaction_type: 'expense',
        description: '=SOMA(A1,"x")',
        account_id: 'acc-1',
        amount: 10,
      },
    ],
    { accountsById: new Map([['acc-1', { id: 'acc-1', name: 'Carteira' }]]) },
  );
  const lines = csv.split('\r\n');
  assert.equal(lines[1], '2026-07-21,Saída,"\'=SOMA(A1,""x"")",Carteira,,,10.00,,,Não,');
});

test('BOM UTF-8 continua presente na exportacao apos a protecao de CSV injection', () => {
  const calls = [];
  const anchor = { click: () => calls.push('click'), remove: () => calls.push('remove') };
  const documentRef = {
    body: { append: (node) => calls.push(node === anchor ? 'append' : 'invalid') },
    createElement: () => anchor,
  };
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  let capturedBlob;
  URL.createObjectURL = (blob) => {
    capturedBlob = blob;
    return 'blob:local-export';
  };
  URL.revokeObjectURL = () => {};
  try {
    downloadTransactionsCsv(
      [{ transaction_date: '2026-07-21', transaction_type: 'expense', description: '=perigoso', account_id: 'acc-1', amount: 10 }],
      { documentRef },
    );
  } finally {
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  }
  assert.equal(capturedBlob.type, 'text/csv;charset=utf-8;');
});

test('transactionToCsvRow resolve nomes de categoria/conta e formata tipo/valor', () => {
  const row = transactionToCsvRow(
    {
      transaction_date: '2026-07-21',
      transaction_type: 'expense',
      description: 'Mercado',
      account_id: 'acc-1',
      category_id: 'cat-1',
      amount: 123.4,
      payment_method: 'Pix',
      is_recurring: false,
      notes: '',
    },
    { categoriesById, accountsById },
  );
  assert.deepEqual(row, [
    '2026-07-21',
    'Saída',
    'Mercado',
    'Carteira',
    '',
    'Alimentação',
    '123.40',
    'Pix',
    '',
    'Não',
    '',
  ]);
});

test('transactionToCsvRow resolve conta de destino e marca parcela/recorrência', () => {
  const row = transactionToCsvRow(
    {
      transaction_date: '2026-07-20',
      transaction_type: 'transfer',
      description: 'Transferência mensal',
      account_id: 'acc-1',
      destination_account_id: 'acc-2',
      amount: 500,
      installment_number: 2,
      installment_total: 3,
      is_recurring: true,
      notes: 'Combinado',
    },
    { categoriesById, accountsById },
  );
  assert.equal(row[3], 'Carteira');
  assert.equal(row[4], 'Poupança');
  assert.equal(row[8], '2/3');
  assert.equal(row[9], 'Sim');
  assert.equal(row[10], 'Combinado');
});

test('transactionToCsvRow sem Maps de apoio não quebra e retorna nomes vazios', () => {
  const row = transactionToCsvRow({
    transaction_date: '2026-07-19',
    transaction_type: 'income',
    description: 'Salário',
    account_id: 'acc-1',
    amount: 1000,
  });
  assert.equal(row[3], '');
  assert.equal(row[5], '');
});

test('buildTransactionsCsv gera cabeçalho e uma linha por transação, com CRLF', () => {
  const csv = buildTransactionsCsv(
    [
      {
        transaction_date: '2026-07-21',
        transaction_type: 'income',
        description: 'Salário, mensal',
        account_id: 'acc-1',
        amount: 5000,
      },
    ],
    { categoriesById, accountsById },
  );
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0], 'Data,Tipo,Descrição,Conta,Conta de destino,Categoria,Valor,Forma de pagamento,Parcela,Recorrente,Observação');
  assert.equal(lines[1], '2026-07-21,Entrada,"Salário, mensal",Carteira,,,5000.00,,,Não,');
});

test('buildTransactionsCsv com lista vazia retorna somente o cabeçalho', () => {
  const csv = buildTransactionsCsv([]);
  assert.equal(csv.split('\r\n').length, 1);
});

test('buildTransactionsExportFilename usa a data no formato YYYY-MM-DD', () => {
  const filename = buildTransactionsExportFilename(new Date('2026-07-21T12:00:00.000Z'));
  assert.equal(filename, 'uniflow-lancamentos-2026-07-21.csv');
});

test('downloadTransactionsCsv usa arquivo local, BOM UTF-8 e remove o link temporário', () => {
  const calls = [];
  const anchor = {
    click: () => calls.push('click'),
    remove: () => calls.push('remove'),
  };
  const documentRef = {
    body: { append: (node) => calls.push(node === anchor ? 'append' : 'invalid') },
    createElement: () => anchor,
  };
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:local-export';
  URL.revokeObjectURL = (url) => calls.push(`revoke:${url}`);
  try {
    downloadTransactionsCsv([], { documentRef, filename: 'teste.csv' });
  } finally {
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  }
  assert.equal(anchor.download, 'teste.csv');
  assert.deepEqual(calls, ['append', 'click', 'remove', 'revoke:blob:local-export']);
});
