import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Sem infraestrutura de renderização React neste repositório para hooks --
// mesmo padrão já usado para useClients.js/useCrmPipeline.js/useAgenda.js
// (nenhum tem teste de hook isolado; cobertura via leitura de fonte para
// wiring/contratos estruturais). R2 adiciona este arquivo especificamente
// para cobrir a correção de status/janela de período.

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// R2 -- status completed e janela de periodo via dateFrom
// ============================================================================

test('useReports pede status=completed ao useTransactions (mesmo criterio ja usado pelo Dashboard)', async () => {
  const hook = await source('useReports.js');
  assert.match(hook, /useTransactions\(\{ workspaceId, status: 'completed', dateFrom \}\)/);
});

test('useReports calcula dateFrom via calcReportsWindowStart, nao depende do limit padrao de useTransactions', async () => {
  const hook = await source('useReports.js');
  assert.match(hook, /import \{ buildReportsSnapshot, calcReportsWindowStart \} from '\.\.\/pages\/relatorios\/reportsCalculations\.js';/);
  assert.match(
    hook,
    /const dateFrom = useMemo\(\s*\n\s*\(\) => calcReportsWindowStart\(new Date\(\), monthsBack\),\s*\n\s*\[monthsBack\],\s*\n\s*\);/,
  );
});

test('dateFrom so recalcula quando monthsBack muda (useMemo com dependencia unica)', async () => {
  const hook = await source('useReports.js');
  const memoBlock = hook.slice(hook.indexOf('const dateFrom = useMemo('), hook.indexOf('const {\n    transactions,'));
  assert.match(memoBlock, /\[monthsBack\]/);
});

test('useReports continua consumindo useTransactions, useFinancialBalances e useGoals -- e somente esses 3 hooks', async () => {
  const hook = await source('useReports.js');
  assert.match(hook, /import \{ useTransactions \} from '\.\/useTransactions\.js';/);
  assert.match(hook, /import \{ useFinancialBalances \} from '\.\/useFinancialBalances\.js';/);
  assert.match(hook, /import \{ useGoals \} from '\.\.\/features\/goals\/useGoals\.js';/);
});

test('useReports nao importa nenhum service diretamente (nem transactionService) -- so financialDataEvents, roteado via useTransactions', async () => {
  const hook = await source('useReports.js');
  const importLines = hook.match(/^import .+$/gm) ?? [];
  for (const line of importLines) {
    if (line.includes("from '../services/")) {
      assert.match(line, /financialDataEvents/);
    }
  }
});

test('useReports nao contem logica matematica propria -- continua delegando a buildReportsSnapshot', async () => {
  const hook = await source('useReports.js');
  assert.doesNotMatch(hook, /function calc[A-Z]/);
  assert.doesNotMatch(hook, /\.reduce\(/);
});

test('useReports nao importa nada de features/future', async () => {
  const hook = await source('useReports.js');
  const importLines = hook.match(/^import .+$/gm) ?? [];
  for (const line of importLines) {
    assert.doesNotMatch(line, /features\/future/);
  }
});

test('useReports ainda chama useReports() sem parametros extras em ReportsPage.jsx (API publica inalterada)', async () => {
  const page = await source('../pages/ReportsPage.jsx');
  assert.match(page, /const \{ isLoading, error, workspaceBalance, snapshot, hasData, refresh \} = useReports\(\);/);
});

test('useReports continua escutando FINANCIAL_DATA_CHANGED_EVENT para manter dados sincronizados', async () => {
  const hook = await source('useReports.js');
  assert.match(hook, /FINANCIAL_DATA_CHANGED_EVENT/);
  assert.match(hook, /addEventListener/);
});

test('useReports expoe a mesma API publica aprovada (isLoading/error/workspaceBalance/snapshot/hasData/refresh)', async () => {
  const hook = await source('useReports.js');
  assert.match(
    hook,
    /return \{\s*\n\s*isLoading,\s*\n\s*error,\s*\n\s*workspaceBalance,\s*\n\s*snapshot,\s*\n\s*hasData: snapshot\.monthlySeries\.length > 0,\s*\n\s*refresh: refreshAll,\s*\n\s*\};/,
  );
});
