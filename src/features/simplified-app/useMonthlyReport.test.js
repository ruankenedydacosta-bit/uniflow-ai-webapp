import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// RELATORIO-SPREADSHEET1 -- useMonthlyReport(): fonte única de dados
// compartilhada pela Tela 1 (resumo) e Tela 2 (planilha/XLSX). Extraída
// da V1 (antes vivia dentro de SimplifiedReportPage.jsx) para que as duas
// telas nunca possam divergir por terem cópias separadas da mesma lógica.
// ============================================================================

test('FONTE ÚNICA: usa useTransactions/useCategories/useAgenda -- as mesmas fontes de Registros/Agenda, nunca uma terceira', async () => {
  const hook = await source('./useMonthlyReport.js');
  assert.match(hook, /import \{ useCategories, useTransactions \} from '\.\.\/\.\.\/hooks';/);
  assert.match(hook, /import \{ useAgenda \} from '\.\.\/\.\.\/hooks\/useAgenda\.js';/);
  assert.match(hook, /status: 'completed',/);
  assert.match(hook, /context: 'personal' \}\);/);
});

test('nenhum store/snapshot novo -- não existe reportTransactionsStore/reportAgendaStore/reportDatabase/reportSnapshot', async () => {
  const files = ['./useMonthlyReport.js', './monthlyReportData.js', './monthlyReportWorkbook.js'];
  for (const file of files) {
    const content = await source(file);
    assert.doesNotMatch(content, /reportTransactionsStore|reportAgendaStore|reportDatabase|reportSnapshot/i);
  }
});

test('mês default é o mês atual; navegação usa shiftMonth (mesma função da Agenda visual)', async () => {
  const hook = await source('./useMonthlyReport.js');
  assert.match(hook, /const now = new Date\(\);\s*\n\s*return \{ year: now\.getFullYear\(\), month: now\.getMonth\(\) \};/);
  assert.match(hook, /import \{ buildMonthRange, shiftMonth \} from '\.\/simplifiedAgendaCalendar\.js';/);
  assert.match(hook, /shiftMonth\(current\.year, current\.month, delta\)/);
});

test('LIVE UPDATE: escuta FINANCIAL_DATA_CHANGED_EVENT e visibilitychange, handler em ref (registrado uma vez)', async () => {
  const hook = await source('./useMonthlyReport.js');
  assert.match(hook, /import \{ FINANCIAL_DATA_CHANGED_EVENT \} from '\.\.\/\.\.\/services\/financialDataEvents\.js';/);
  assert.match(hook, /window\.addEventListener\(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged\)/);
  assert.match(hook, /document\.addEventListener\('visibilitychange', handleVisibility\)/);
  const effect = /useEffect\(\(\) => \{\s*\n\s*const handleDataChanged[\s\S]*?\}, \[\]\);/.exec(hook);
  assert.ok(effect, 'o efeito do listener precisa ter dependências vazias (registrado uma única vez)');
});

test('LIVE UPDATE: refresh recarrega transações, categorias E agenda juntos', async () => {
  const hook = await source('./useMonthlyReport.js');
  assert.match(hook, /transactionState\.refresh\(\),\s*\n\s*categoryState\.refresh\(\),\s*\n\s*agendaState\.refresh\(\),/);
});

test('AGENDA: reaproveita useAgendaReminderStates para o lembrete -- nunca um novo cálculo', async () => {
  const hook = await source('./useMonthlyReport.js');
  assert.match(hook, /import \{ useAgendaReminderStates \} from '\.\.\/agenda-push\/useAgendaReminderStates\.js';/);
  assert.match(hook, /reminderStatesByItemId/);
});

test('ownership: workspaceId vem de useSession() -- nunca hardcoded, nunca de outro workspace', async () => {
  const hook = await source('./useMonthlyReport.js');
  assert.match(hook, /const \{ workspace \} = useSession\(\);/);
  assert.match(hook, /const workspaceId = workspace\?\.id;/);
});

test('retorna { report, moveMonth } -- contrato mínimo consumido pelas duas telas', async () => {
  const hook = await source('./useMonthlyReport.js');
  assert.match(hook, /export function useMonthlyReport\(\)/);
  assert.match(hook, /return \{ report, moveMonth \};/);
});

test('as duas telas usam o MESMO hook -- nunca cópias divergentes', async () => {
  const summaryPage = await source('./SimplifiedReportPage.jsx');
  const spreadsheetPage = await source('./SimplifiedReportSpreadsheetPage.jsx');
  assert.match(summaryPage, /import \{ useMonthlyReport \} from '\.\/useMonthlyReport\.js';/);
  assert.match(spreadsheetPage, /import \{ useMonthlyReport \} from '\.\/useMonthlyReport\.js';/);
});
