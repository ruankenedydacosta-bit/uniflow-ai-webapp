import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { homeMobileMocks } from '../dashboard/mobile/homeMobile.mock.js';
import { financeiroMobileMocks } from '../../pages/financeiro/mobile/financeiroMobile.mock.js';
import {
  DEFAULT_FINANCIAL_PROFILE,
  FINANCIAL_PROFILE_IDS,
  FINANCIAL_PROFILE_OPTIONS,
  FINANCIAL_PROFILE_STORAGE_KEY,
  FINANCIAL_PROFILE_TRANSITION_MS,
  isFinancialProfile,
  normalizeFinancialProfile,
} from './financialProfileConstants.js';
import { readFinancialProfile, writeFinancialProfile } from './financialProfileStorage.js';

const ROOT = new URL('./', import.meta.url);
const source = (path) => readFile(new URL(path, ROOT), 'utf8');

function createStorage(initialValue) {
  const entries = new Map();
  if (initialValue !== undefined) entries.set(FINANCIAL_PROFILE_STORAGE_KEY, initialValue);

  return {
    getItem(key) {
      return entries.get(key) ?? null;
    },
    setItem(key, value) {
      entries.set(key, value);
    },
  };
}

test('contrato aceita somente pf e pj e permanece imutável', () => {
  assert.equal(DEFAULT_FINANCIAL_PROFILE, 'pf');
  assert.equal(isFinancialProfile('pf'), true);
  assert.equal(isFinancialProfile('pj'), true);
  assert.equal(isFinancialProfile('PF'), false);
  assert.equal(normalizeFinancialProfile('invalid'), 'pf');
  assert.equal(Object.isFrozen(FINANCIAL_PROFILE_IDS), true);
  assert.equal(Object.isFrozen(FINANCIAL_PROFILE_OPTIONS), true);
  assert.equal(Object.isFrozen(FINANCIAL_PROFILE_OPTIONS[0]), true);
});

test('persistência usa somente a chave local oficial', () => {
  const storage = createStorage();
  assert.equal(writeFinancialProfile('pj', storage), true);
  assert.equal(readFinancialProfile(storage), 'pj');
  assert.equal(storage.getItem(FINANCIAL_PROFILE_STORAGE_KEY), 'pj');
});

test('persistência inválida ou indisponível volta com segurança para pf', () => {
  assert.equal(readFinancialProfile(createStorage('outro')), 'pf');
  assert.equal(writeFinancialProfile('outro', createStorage()), false);
  assert.equal(readFinancialProfile(null), 'pf');
  assert.equal(
    readFinancialProfile({ getItem() { throw new Error('storage unavailable'); } }),
    'pf',
  );
});

test('provider troca o snapshot no meio da transição de 200 ms e limpa timers', async () => {
  const contents = await source('FinancialProfileProvider.jsx');
  assert.equal(FINANCIAL_PROFILE_TRANSITION_MS, 200);
  assert.match(contents, /setTransitionPhase\('fade-out'\)/);
  assert.match(contents, /setActiveProfile\(selectedFinancialProfile\)/);
  assert.match(contents, /setTransitionPhase\('fade-in'\)/);
  assert.match(contents, /clearTimeout\(swapTimer\)/);
  assert.match(contents, /clearTimeout\(settleTimer\)/);
  assert.match(contents, /Object\.freeze/);
});

test('provider envolve todos os consumidores do layout autenticado em qualquer viewport', async () => {
  const layout = await source('../../layouts/mobile-app-shell/AuthenticatedLayout.jsx');
  assert.equal((layout.match(/<FinancialProfileProvider>/g) ?? []).length, 1);
  assert.match(layout, /const shell = isMobile \? \([\s\S]*?<MobileAppShell/);
  assert.match(layout, /\) : \([\s\S]*?<AppShell/);
  assert.match(layout, /<FinancialProfileProvider>[\s\S]*?\{shell\}/);
  assert.match(layout, /<MobileAppShell/);
});

test('Dashboard e Financeiro mobile permanecem sob o layout autenticado compartilhado', async () => {
  const [app, dashboard, financeiro] = await Promise.all([
    source('../../app/App.jsx'),
    source('../../features/dashboard/DashboardPage.jsx'),
    source('../../pages/FinanceiroPage.jsx'),
  ]);
  assert.match(app, /<AuthenticatedLayout/);
  assert.match(app, /appRoutes\.map/);
  assert.match(dashboard, /<MobileHomeView/);
  assert.match(financeiro, /<MobileFinanceiroView/);
});

test('loading e guards de sessão não montam consumidores antes do provider', async () => {
  const app = await source('../../app/App.jsx');
  const loading = app.indexOf('if (isSupabaseConfigured && isSessionLoading)');
  const layout = app.indexOf('<AuthenticatedLayout');
  assert.equal(loading >= 0 && loading < layout, true);
  assert.match(app, /if \(!session \|\| sessionError\)[\s\S]*?<Navigate to="\/login"/);
});

test('header converte o controle PF e PJ para os identificadores internos', async () => {
  const header = await source('../../layouts/mobile-app-shell/MobileHeader.jsx');
  assert.match(header, /selectedFinancialProfile === 'pj'/);
  assert.match(header, /setFinancialProfile\(context\.toLowerCase\(\)\)/);
  assert.match(header, /activeContext=\{isBusiness \? 'PJ' : 'PF'\}/);
});

test('Home e Financeiro possuem snapshots PF e PJ distintos e imutáveis', () => {
  assert.notEqual(homeMobileMocks.pf, homeMobileMocks.pj);
  assert.notEqual(financeiroMobileMocks.pf, financeiroMobileMocks.pj);
  assert.equal(Object.isFrozen(homeMobileMocks.pj.goals[0]), true);
  assert.equal(Object.isFrozen(financeiroMobileMocks.pj.periods[0].accounts[0]), true);
  assert.match(homeMobileMocks.pj.briefing.message, /empresa/i);
  assert.match(financeiroMobileMocks.pj.periods.at(-1).balanceLabel, /caixa/i);
});

test('camada permanece local e sem integrações externas', async () => {
  const contents = await Promise.all([
    source('FinancialProfileProvider.jsx'),
    source('financialProfileStorage.js'),
    source('../../features/dashboard/mobile/MobileHomeView.jsx'),
    source('../../pages/financeiro/mobile/MobileFinanceiroView.jsx'),
  ]);
  assert.doesNotMatch(contents.join('\n'), /supabase|fetch\(|axios|openai|elevenlabs|http:/i);
});
