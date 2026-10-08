import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fetchAllPages } from './transactionService.js';

// ============================================================================
// fetchAllPages (R2) -- orquestracao pura de paginacao, sem depender de um
// Supabase real configurado (diferente do resto de transactionService.js,
// que retorna cedo quando `supabase` e null em ambiente de teste).
// ============================================================================

function makeFakePage(rows) {
  return { data: rows, error: null };
}

test('fetchAllPages: pagina unica menor que pageSize -- para na primeira chamada', async () => {
  let calls = 0;
  const result = await fetchAllPages(
    async () => {
      calls += 1;
      return makeFakePage([{ id: 1 }, { id: 2 }]);
    },
    { pageSize: 5 },
  );
  assert.equal(calls, 1);
  assert.equal(result.data.length, 2);
  assert.equal(result.error, null);
});

test('fetchAllPages: primeira pagina cheia, segunda pagina incompleta -- acumula as duas, nenhum registro truncado', async () => {
  const pages = [
    [{ id: 1 }, { id: 2 }, { id: 3 }],
    [{ id: 4 }, { id: 5 }],
  ];
  let calls = 0;
  const result = await fetchAllPages(
    async (offset, pageSize) => {
      const page = pages[calls];
      calls += 1;
      assert.equal(offset, (calls - 1) * pageSize);
      return makeFakePage(page ?? []);
    },
    { pageSize: 3 },
  );
  assert.equal(calls, 2);
  assert.deepEqual(result.data.map((r) => r.id), [1, 2, 3, 4, 5]);
  assert.equal(result.error, null);
});

test('fetchAllPages: mais de 100 registros no periodo -- nenhum e truncado, mes nao fica parcialmente somado', async () => {
  const totalRows = 137;
  const pageSize = 20;
  let calls = 0;
  const result = await fetchAllPages(
    async (offset) => {
      calls += 1;
      const remaining = totalRows - offset;
      if (remaining <= 0) return makeFakePage([]);
      const rows = Array.from({ length: Math.min(pageSize, remaining) }, (_, i) => ({ id: offset + i }));
      return makeFakePage(rows);
    },
    { pageSize },
  );
  assert.equal(result.data.length, totalRows);
  assert.equal(calls, Math.ceil(totalRows / pageSize));
  assert.deepEqual(
    result.data.map((r) => r.id),
    Array.from({ length: totalRows }, (_, i) => i),
  );
});

test('fetchAllPages: pagina exatamente igual a pageSize continua buscando a proxima (fim so quando vem MENOS que pageSize)', async () => {
  const pages = [
    [{ id: 1 }, { id: 2 }],
    [],
  ];
  let calls = 0;
  const result = await fetchAllPages(
    async () => {
      const page = pages[calls];
      calls += 1;
      return makeFakePage(page ?? []);
    },
    { pageSize: 2 },
  );
  assert.equal(calls, 2);
  assert.equal(result.data.length, 2);
});

test('fetchAllPages: erro na segunda pagina retorna os dados ja acumulados da primeira, com o erro', async () => {
  let calls = 0;
  const fakeError = { code: 'DB_ERROR', message: 'falha simulada' };
  const result = await fetchAllPages(
    async () => {
      calls += 1;
      if (calls === 1) return makeFakePage([{ id: 1 }, { id: 2 }]);
      return { data: null, error: fakeError };
    },
    { pageSize: 2 },
  );
  assert.equal(calls, 2);
  assert.deepEqual(result.data, [{ id: 1 }, { id: 2 }]);
  assert.equal(result.error, fakeError);
});

test('fetchAllPages: erro na primeira pagina retorna array vazio com o erro, sem lancar excecao', async () => {
  const fakeError = { code: 'DB_ERROR', message: 'falha simulada' };
  const result = await fetchAllPages(async () => ({ data: null, error: fakeError }));
  assert.deepEqual(result.data, []);
  assert.equal(result.error, fakeError);
});

test('fetchAllPages: primeira pagina vazia para imediatamente, sem chamar de novo', async () => {
  let calls = 0;
  const result = await fetchAllPages(
    async () => {
      calls += 1;
      return makeFakePage([]);
    },
    { pageSize: 10 },
  );
  assert.equal(calls, 1);
  assert.deepEqual(result.data, []);
  assert.equal(result.error, null);
});

test('fetchAllPages: respeita o teto de seguranca maxPages, mesmo se toda pagina vier cheia (evita loop infinito)', async () => {
  let calls = 0;
  const result = await fetchAllPages(
    async () => {
      calls += 1;
      return makeFakePage([{ id: calls }, { id: calls + 1000 }]);
    },
    { pageSize: 2, maxPages: 3 },
  );
  assert.equal(calls, 3);
  assert.equal(result.data.length, 6);
});

// BLOCO FINAL DO MVP (Saldo manual): sem adjustment_delta na projeção, a UI
// não tem como saber se um ajuste foi positivo ou negativo (amount é sempre
// positivo -- abs(delta) -- por desenho da RPC de ajuste).
test('TRANSACTION_FIELDS inclui adjustment_delta -- necessário para exibir o sinal correto de um ajuste de saldo', async () => {
  const content = await source('transactionService.js');
  const fieldsLine = content.slice(
    content.indexOf('const TRANSACTION_FIELDS ='),
    content.indexOf(';', content.indexOf('const TRANSACTION_FIELDS =')),
  );
  assert.match(fieldsLine, /adjustment_delta/);
});

// ============================================================================
// listTransactionsForPeriod -- leitura de fonte para o contrato de query
// (mesmo padrao dos demais services do repositorio: sem Supabase real
// configurado em ambiente de teste, o comportamento de rede nao e
// executavel diretamente, entao o contrato e verificado por estrutura).
// ============================================================================

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('listTransactionsForPeriod usa fetchAllPages com .range() para paginar, nunca um .limit() fixo', async () => {
  const content = await source('transactionService.js');
  const fnBody = content.slice(
    content.indexOf('export async function listTransactionsForPeriod'),
    content.indexOf('export async function listTransactions('),
  );
  assert.match(fnBody, /fetchAllPages\(/);
  assert.match(fnBody, /\.range\(offset, offset \+ pageSize - 1\)/);
  assert.doesNotMatch(fnBody, /\.limit\(/);
});

test('listTransactionsForPeriod aplica status/dateFrom/dateTo dentro do mesmo closure passado a fetchAllPages (aplicado identicamente em toda pagina)', async () => {
  const content = await source('transactionService.js');
  const fnBody = content.slice(
    content.indexOf('export async function listTransactionsForPeriod'),
    content.indexOf('export async function listTransactions('),
  );
  const closureBody = fnBody.slice(fnBody.indexOf('(offset, pageSize) => {'), fnBody.indexOf('});'));
  assert.match(closureBody, /if \(status\) \{\s*\n\s*query = query\.eq\('status', status\);/);
  assert.match(closureBody, /if \(dateFrom\) \{\s*\n\s*query = query\.gte\('transaction_date', dateFrom\);/);
  assert.match(closureBody, /if \(dateTo\) \{\s*\n\s*query = query\.lte\('transaction_date', dateTo\);/);
});

test('listTransactionsForPeriod ordena por transaction_date e id para paginacao deterministica', async () => {
  const content = await source('transactionService.js');
  const fnBody = content.slice(
    content.indexOf('export async function listTransactionsForPeriod'),
    content.indexOf('export async function listTransactions('),
  );
  assert.match(fnBody, /\.order\('transaction_date', \{ ascending: true \}\)/);
  assert.match(fnBody, /\.order\('id', \{ ascending: true \}\)/);
});

test('listTransactionsForPeriod valida workspaceId antes de consultar', async () => {
  const content = await source('transactionService.js');
  const fnBody = content.slice(
    content.indexOf('export async function listTransactionsForPeriod'),
    content.indexOf('export async function listTransactions('),
  );
  assert.match(fnBody, /if \(!isValidUuid\(workspaceId\)\) \{/);
});

test('listTransactionsForPeriod nunca usa transaction_type para filtrar (nao e responsabilidade desta funcao)', async () => {
  const content = await source('transactionService.js');
  const fnBody = content.slice(
    content.indexOf('export async function listTransactionsForPeriod'),
    content.indexOf('export async function listTransactions('),
  );
  assert.doesNotMatch(fnBody, /transactionType/);
});

// ============================================================================
// listTransactions (existente, nao deve mudar de comportamento)
// ============================================================================

test('listTransactions continua aceitando status como filtro opcional, comportamento preexistente', async () => {
  const content = await source('transactionService.js');
  const fnBody = content.slice(
    content.indexOf('export async function listTransactions('),
    content.indexOf('export async function getTransaction('),
  );
  assert.match(fnBody, /if \(status\) \{\s*\n\s*query = query\.eq\('status', status\);/);
});

test('listTransactions mantem o cap de 100 e o default de 50 (lista recente, nao usada por Relatorios)', async () => {
  const content = await source('transactionService.js');
  const fnBody = content.slice(
    content.indexOf('export async function listTransactions('),
    content.indexOf('export async function getTransaction('),
  );
  assert.match(fnBody, /Math\.min\(Math\.max\(Number\(limit\) \|\| 50, 1\), 100\)/);
});

// ============================================================================
// BLOCO REGISTROS iOS: descrição nunca é obrigatória no service (frontend
// já sintetiza um valor neutro/honesto via resolveTransactionDescription,
// mas o service em si também nunca deve rejeitar uma chamada por descrição
// vazia -- normalizeTransactionDescription é a última linha de defesa
// contra a constraint NOT NULL/não-vazia de transactions.description).
// ============================================================================

test('hasRequiredTransactionFields não exige mais descrição', async () => {
  const content = await readFile(new URL('./transactionService.js', import.meta.url), 'utf8');
  const fnStart = content.indexOf('function hasRequiredTransactionFields(transaction) {');
  const fnBody = content.slice(fnStart, content.indexOf('\n}', fnStart));
  assert.doesNotMatch(fnBody, /transaction\.description/);
});

test('mensagem de validação de createTransaction não menciona mais "descricao" como obrigatória', async () => {
  const content = await readFile(new URL('./transactionService.js', import.meta.url), 'utf8');
  assert.match(content, /'Conta, tipo, valor positivo e data sao obrigatorios\.'/);
  assert.doesNotMatch(content, /descricao sao obrigatorios/);
});

test('normalizeTransactionDescription sintetiza um rótulo neutro por tipo e é usada na criação e na edição', async () => {
  const content = await readFile(new URL('./transactionService.js', import.meta.url), 'utf8');
  assert.match(content, /function normalizeTransactionDescription\(transaction\) \{/);
  assert.match(content, /description: normalizeTransactionDescription\(transaction\)/);
  assert.match(content, /payload\.description = normalizeTransactionDescription\(\{/);
});

test('updateTransaction nunca rejeita uma edição por descrição vazia', async () => {
  const content = await readFile(new URL('./transactionService.js', import.meta.url), 'utf8');
  const fnStart = content.indexOf('export async function updateTransaction(');
  const fnBody = content.slice(fnStart, content.indexOf('\nexport ', fnStart + 10));
  assert.doesNotMatch(fnBody, /A descricao deve ser um texto valido/);
  assert.doesNotMatch(fnBody, /payload\.description === ''/);
});

test('updateTransaction com expectedUpdatedAt só grava a versão lida e avisa quando ela mudou', async () => {
  const content = await readFile(new URL('./transactionService.js', import.meta.url), 'utf8');
  const fnStart = content.indexOf('export async function updateTransaction(');
  const fnBody = content.slice(fnStart, content.indexOf('\nexport ', fnStart + 10));
  assert.match(fnBody, /\{ expectedUpdatedAt = null \} = \{\}/);
  assert.match(fnBody, /query = query\.eq\('updated_at', expectedUpdatedAt\)/);
  assert.match(fnBody, /code: 'TRANSACTION_CHANGED'/);
});
