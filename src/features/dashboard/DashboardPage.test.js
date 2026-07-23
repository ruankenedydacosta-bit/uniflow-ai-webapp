import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

async function exists(path) {
  try {
    await access(new URL(path, import.meta.url));
    return true;
  } catch {
    return false;
  }
}

const LEGACY_COMPONENTS = [
  'components/DashboardGreeting.jsx',
  'components/FinancialSummaryCard.jsx',
  'components/GoalsSummaryCard.jsx',
  'components/RecentActivityList.jsx',
  'components/UniInsightsCard.jsx',
];

// ============================================================================
// Remoção segura dos componentes legados
// ============================================================================

test('componentes legados do Dashboard foram removidos do disco', async () => {
  for (const path of LEGACY_COMPONENTS) {
    assert.equal(await exists(path), false, `${path} ainda existe`);
  }
  assert.equal(await exists('dashboard.mock.js'), false, 'dashboard.mock.js ainda existe');
});

test('nenhum arquivo do projeto importa os componentes legados removidos', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  const names = ['DashboardGreeting', 'FinancialSummaryCard', 'GoalsSummaryCard', 'RecentActivityList', 'UniInsightsCard', 'dashboard.mock'];
  for (const name of names) {
    const { stdout } = await run('grep', ['-rl', name, 'src', '--include=*.js', '--include=*.jsx', '--exclude=DashboardPage.test.js'], {
      cwd: new URL('../../../', import.meta.url).pathname,
    }).catch((e) => ({ stdout: e.stdout ?? '' }));
    assert.equal(stdout.trim(), '', `referência residual a ${name}: ${stdout}`);
  }
});

// ============================================================================
// DashboardPage.jsx — integrações reais
// ============================================================================

test('DashboardPage não importa dashboard.mock.js nem componentes legados', async () => {
  const page = await source('DashboardPage.jsx');
  assert.doesNotMatch(page, /dashboard\.mock/);
  assert.doesNotMatch(page, /DashboardGreeting|FinancialSummaryCard|GoalsSummaryCard|RecentActivityList|UniInsightsCard/);
});

test('DashboardPage consome useHomeFinancialData (dados reais)', async () => {
  const page = await source('DashboardPage.jsx');
  assert.match(page, /import \{ useHomeFinancialData \} from '\.\/mobile\/useHomeFinancialData\.js';/);
  assert.match(page, /const financialData = useHomeFinancialData\(\);/);
});

test('DashboardPage consome useDashboardClarity e useDashboardPersonalization', async () => {
  const page = await source('DashboardPage.jsx');
  assert.match(page, /import \{ useDashboardClarity \} from '\.\/clarity\/useDashboardClarity\.js';/);
  assert.match(page, /import \{ useDashboardPersonalization \} from '\.\/personalization\/useDashboardPersonalization';/);
  assert.match(page, /useDashboardClarity\(financialData\)/);
  assert.match(page, /useDashboardPersonalization\(\{/);
});

test('DashboardPage delega ao MobileHomeView em viewport mobile, sem duplicar lógica', async () => {
  const page = await source('DashboardPage.jsx');
  assert.match(page, /import \{ MobileHomeView \} from '\.\/mobile\/index\.js';/);
  assert.match(page, /if \(isMobile\) \{/);
});

test('atalhos do Dashboard (DASHBOARD_SHORTCUTS) apontam apenas para rotas existentes em appRoutes', async () => {
  const page = await source('DashboardPage.jsx');
  const routes = await source('../../app/routes.jsx');
  const appRoutesBlock = routes.slice(routes.indexOf('export const appRoutes = ['));
  const validPaths = new Set([...appRoutesBlock.matchAll(/path: '([^']+)'/g)].map((m) => m[1]));

  const shortcutsBlock = page.slice(page.indexOf('DASHBOARD_SHORTCUTS'), page.indexOf(']);') + 3);
  const shortcutPaths = [...shortcutsBlock.matchAll(/path: '([^']+)'/g)].map((m) => m[1]);

  assert.ok(shortcutPaths.length > 0);
  for (const path of shortcutPaths) {
    assert.ok(validPaths.has(path), `atalho aponta para rota inexistente: ${path}`);
  }
});

// ============================================================================
// useHomeFinancialData.js — sem dados fabricados
// ============================================================================

test('useHomeFinancialData usa somente hooks reais, nenhum mock', async () => {
  const hook = await source('mobile/useHomeFinancialData.js');
  assert.match(hook, /import \{ useAccounts, useCategories, useFinancialBalances, useTransactions \} from '\.\.\/\.\.\/\.\.\/hooks';/);
  assert.match(hook, /import \{ useGoals \} from '\.\.\/\.\.\/goals\/useGoals';/);
  assert.doesNotMatch(hook, /mock/i);
});

// ============================================================================
// MobileHomeView.jsx — Tema, Open Finance e ausência de dados fabricados
// ============================================================================

test('MobileHomeView integra useTheme (Tema global)', async () => {
  const view = await source('mobile/MobileHomeView.jsx');
  assert.match(view, /import \{ useTheme \} from '\.\.\/\.\.\/theme';/);
  assert.match(view, /const \{ effectiveTheme \} = useTheme\(\);/);
});

test('MobileHomeView integra OpenFinanceConnectionAnimation apenas como demonstração explícita', async () => {
  const view = await source('mobile/MobileHomeView.jsx');
  assert.match(view, /import \{ OpenFinanceConnectionAnimation \} from '\.\.\/\.\.\/open-finance-animation';/);
  assert.match(view, /data-open-finance-demo="true"/);
  assert.match(view, /Ainda não há\s*\n\s*conexão bancária real/);
});

test('MobileHomeView nunca mescla dados reais com o mock (sem fallback de dados fabricados em produção)', async () => {
  const view = await source('mobile/MobileHomeView.jsx');
  assert.doesNotMatch(view, /\{\s*\.\.\.homeMobileMock,\s*\.\.\.data\s*\}/);
  assert.match(view, /const viewData = data \?\? homeMobileMock;/);
  assert.doesNotMatch(view, /data = homeMobileMock/);
});

test('MobileHomeView só recorre ao mock para quickActions estáticos (navegação), nunca para dados financeiros', async () => {
  const view = await source('mobile/MobileHomeView.jsx');
  const mockUsages = [...view.matchAll(/homeMobileMock\.(\w+)/g)].map((m) => m[1]);
  assert.ok(mockUsages.length > 0);
  for (const field of mockUsages) {
    assert.equal(field, 'quickActions', `uso não documentado do mock: homeMobileMock.${field}`);
  }
});
