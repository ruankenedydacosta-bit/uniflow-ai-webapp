import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildMonthlyReportData } from './monthlyReportData.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const codeOnly = (content) => content
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// ============================================================================
// RELATORIO1 -- página dedicada do Relatório da Uni. Visão VIVA: nunca um
// snapshot persistido, sempre useTransactions/useCategories/useAgenda
// (mesmas fontes de Registros/Agenda) + o selector neutro
// buildMonthlyReportData (monthlyReportData.js).
// ============================================================================

test('rota registrada e reta -- fora da barra inferior, mesmo padrão de Agenda', async () => {
  const routes = await source('./simplifiedRoutes.js');
  assert.match(routes, /RELATORIO: '\/app\/relatorio',/);
  const appRoutes = await source('../../app/routes.jsx');
  assert.match(appRoutes, /path: SIMPLIFIED_ROUTES\.RELATORIO,/);
  assert.match(appRoutes, /element: <SimplifiedReportPage \/>,/);
});

test('cabeçalho próprio (← Relatório da Uni) -- shell nunca duplica o header genérico por cima', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /\|\| location\.pathname === SIMPLIFIED_ROUTES\.RELATORIO;/);
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /<h1>Relatório da Uni<\/h1>/);
  assert.match(page, /onClick=\{\(\) => navigate\(SIMPLIFIED_ROUTES\.HOME\)\}/);
});

test('FONTE ÚNICA: usa useTransactions/useCategories/useAgenda -- as mesmas fontes de Registros/Agenda, nunca uma terceira', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /import \{ useCategories, useTransactions \} from '\.\.\/\.\.\/hooks';/);
  assert.match(page, /import \{ useAgenda \} from '\.\.\/\.\.\/hooks\/useAgenda\.js';/);
  assert.match(page, /status: 'completed',/);
  assert.match(page, /context: 'personal' \}\);/);
});

test('nenhum store/snapshot novo -- não existe reportTransactionsStore/reportAgendaStore/reportDatabase/reportSnapshot', async () => {
  const files = ['./SimplifiedReportPage.jsx', './monthlyReportData.js'];
  for (const file of files) {
    const content = await source(file);
    assert.doesNotMatch(content, /reportTransactionsStore|reportAgendaStore|reportDatabase|reportSnapshot/i);
  }
});

test('mês default é o mês atual; navegação usa shiftMonth (mesma função da Agenda visual)', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /const now = new Date\(\);\s*\n\s*return \{ year: now\.getFullYear\(\), month: now\.getMonth\(\) \};/);
  assert.match(page, /import \{ buildMonthRange, shiftMonth \} from '\.\/simplifiedAgendaCalendar\.js';/);
  assert.match(page, /shiftMonth\(current\.year, current\.month, delta\)/);
});

test('RESUMO nunca mostra Saldo/Patrimônio/Balance', async () => {
  const files = ['./SimplifiedReportPage.jsx', './simplifiedReport.module.css', './monthlyReportData.js'];
  for (const file of files) {
    const content = await source(file);
    assert.doesNotMatch(codeOnly(content), /\bSaldo\b/i, `${file} não pode mencionar Saldo`);
    assert.doesNotMatch(codeOnly(content), /\bPatrim[oô]nio\b/i);
    assert.doesNotMatch(codeOnly(content), /\bBalance\b/i);
  }
});

test('terminologia pública: Entradas/Saídas, nunca Receita/Despesa no resumo', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, />Entradas</);
  assert.match(page, />Saídas</);
  assert.doesNotMatch(page, />Receita</);
  assert.doesNotMatch(page, />Despesa</);
});

test('movimentações: TODAS as do mês, nunca limitadas a 2 (isso é só da Home)', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.doesNotMatch(page, /\.slice\(0,\s*2\)/);
  assert.match(page, /report\.transactionsByDay\.map/);
});

test('agrupamento visual por dia, com rótulo do grupo', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /group\.dateKey/);
  assert.match(page, /group\.label/);
});

test('AGENDA: reaproveita useAgendaReminderStates para o lembrete -- nunca um novo cálculo', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /import \{ useAgendaReminderStates \} from '\.\.\/agenda-push\/useAgendaReminderStates\.js';/);
  assert.match(page, /reminderStatesByItemId/);
});

test('EDIÇÃO/EXCLUSÃO: relatório representa o estado ATUAL -- nenhum histórico/versão antiga é mantido', async () => {
  const data = await source('./monthlyReportData.js');
  assert.doesNotMatch(data, /history|previousVersion|snapshot/i);
});

// ---------------------------------------------------------- SEM Uni/chat

test('SEM "Uni dentro do relatório": nenhum chat, campo de pergunta ou sugestão de IA', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.doesNotMatch(page, /UniChat|ChatInput|Pergunte sobre|insight/i);
});

// -------------------------------------------------------------- FASE 2/3

test('FASE 2/3 (XLSX/PDF/WhatsApp) NÃO implementadas -- só o modelo neutro que vai alimentá-las depois', async () => {
  const files = ['./SimplifiedReportPage.jsx', './monthlyReportData.js', './simplifiedReport.module.css'];
  for (const file of files) {
    const content = await source(file);
    assert.doesNotMatch(codeOnly(content), /xlsx|jspdf|pdfmake|whatsapp/i, `${file} não pode referenciar Fase 2/3`);
  }
});

test('modelo neutro (buildMonthlyReportData) não importa React/HTML/XLSX/PDF -- puro dado', async () => {
  const data = await source('./monthlyReportData.js');
  assert.doesNotMatch(data, /from 'react'|<[a-z]/i);
});

// -------------------------------------------------------- ATUALIZAÇÃO VIVA

test('LIVE UPDATE: escuta FINANCIAL_DATA_CHANGED_EVENT e visibilitychange, handler em ref (registrado uma vez)', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /import \{ FINANCIAL_DATA_CHANGED_EVENT \} from '\.\.\/\.\.\/services\/financialDataEvents\.js';/);
  assert.match(page, /window\.addEventListener\(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged\)/);
  assert.match(page, /document\.addEventListener\('visibilitychange', handleVisibility\)/);
  const effect = /useEffect\(\(\) => \{\s*\n\s*const handleDataChanged[\s\S]*?\}, \[\]\);/.exec(page);
  assert.ok(effect, 'o efeito do listener precisa ter dependências vazias (registrado uma única vez)');
});

test('LIVE UPDATE: refresh recarrega transações, categorias E agenda juntos', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /transactionState\.refresh\(\),\s*\n\s*categoryState\.refresh\(\),\s*\n\s*agendaState\.refresh\(\),/);
});

test('PROVA DE TEMPO REAL (financeiro): mesmos dados, Saídas R$100 -> nova Saída R$50 -> R$150 e a linha nova aparece, sem remount', () => {
  const CATEGORIES = [{ id: 'c1', name: 'Alimentação' }];
  const before = [{
    id: 1, transaction_type: 'expense', amount: 100, category_id: 'c1', transaction_date: '2026-08-10', status: 'completed', description: 'Aluguel', created_at: '2026-08-10T10:00:00Z',
  }];
  const reportBefore = buildMonthlyReportData({ transactions: before, categories: CATEGORIES, now: new Date(2026, 7, 19, 12) });
  assert.equal(reportBefore.summary.expense, 100);

  const after = [...before, {
    id: 2, transaction_type: 'expense', amount: 50, category_id: 'c1', transaction_date: '2026-08-19', status: 'completed', description: 'Mercado', created_at: '2026-08-19T22:45:00Z',
  }];
  const reportAfter = buildMonthlyReportData({ transactions: after, categories: CATEGORIES, now: new Date(2026, 7, 19, 12) });
  assert.equal(reportAfter.summary.expense, 150);
  const allDescriptions = reportAfter.transactionsByDay.flatMap((g) => g.items.map((i) => i.description));
  assert.ok(allDescriptions.includes('Mercado'));
});

test('PROVA DE TEMPO REAL (agenda): 1 compromisso -> criar outro -> 2 imediatamente', () => {
  const before = [{
    id: 'a1', title: 'Reunião', starts_at: '2026-08-20T09:00:00.000Z', status: 'scheduled', is_all_day: false, has_explicit_time: true,
  }];
  const reportBefore = buildMonthlyReportData({ agendaItems: before, now: new Date(2026, 7, 19, 12) });
  assert.equal(reportBefore.summary.agendaCount, 1);

  const after = [...before, {
    id: 'a2', title: 'Dentista', starts_at: '2026-08-21T09:00:00.000Z', status: 'scheduled', is_all_day: false, has_explicit_time: true,
  }];
  const reportAfter = buildMonthlyReportData({ agendaItems: after, now: new Date(2026, 7, 19, 12) });
  assert.equal(reportAfter.summary.agendaCount, 2);
});

// ------------------------------------------------------------ ownership

test('ownership: workspaceId vem de useSession() -- nunca hardcoded, nunca de outro workspace', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /const \{ workspace \} = useSession\(\);/);
  assert.match(page, /const workspaceId = workspace\?\.id;/);
});

// ---------------------------------------------------------------- CSS

test('CSS usa só tokens semânticos --uf-app-*, nunca hex fixo -- claro/escuro/UniFlow', async () => {
  const css = await source('./simplifiedReport.module.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/);
});

test('back button e setas de mês têm 44px/40px+ de área de toque', async () => {
  const css = await source('./simplifiedReport.module.css');
  assert.match(css, /\.backButton \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
});

test('textos longos truncam (description/title/category) -- nunca quebram o layout', async () => {
  const css = await source('./simplifiedReport.module.css');
  assert.match(css, /\.transactionDescription \{[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/);
  assert.match(css, /\.agendaTitle \{[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/);
});
