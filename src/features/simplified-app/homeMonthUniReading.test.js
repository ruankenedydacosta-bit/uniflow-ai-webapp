import assert from 'node:assert/strict';
import test from 'node:test';
import { lerPedido } from '../../../supabase/functions/_shared/uniInsights/contrato.js';
import { requestUniInsights } from '../../services/uniInsightsService.js';
import { buildHomeMonthFacts, HOME_MONTH_READING_KINDS } from './homeMonthReading.js';
import {
  buildUniInsightsPayload,
  fingerprintPayload,
  readUniReadingCache,
  toUniReadingItems,
  writeUniReadingFailure,
  writeUniReadingSuccess,
} from './homeMonthUniReading.js';

const NOW = new Date(2026, 9, 8, 21, 40);
const LAZER = '11111111-1111-4111-8111-111111111111';
const ALIM = '22222222-2222-4222-8222-222222222222';
const SAUDE = '33333333-3333-4333-8333-333333333333';
const CATEGORIES = [
  { id: LAZER, name: 'Lazer', category_type: 'expense' },
  { id: ALIM, name: 'Alimentação', category_type: 'expense' },
  { id: SAUDE, name: 'Saúde', category_type: 'expense' },
];

function expense(categoryId, amount, date) {
  return { id: `${categoryId}-${date}-${amount}`, status: 'completed', transaction_type: 'expense', category_id: categoryId, amount, transaction_date: date };
}

function facts() {
  return buildHomeMonthFacts({
    transactions: [
      expense(LAZER, 344, '2026-10-03'),
      expense(ALIM, 812, '2026-10-05'),
      expense(ALIM, 952, '2026-09-04'),
      expense(null, 50, '2026-10-06'),
    ],
    categories: CATEGORIES,
    budgets: [{ category_id: LAZER, monthly_limit: 400 }],
    now: NOW,
  });
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

const IDS = { userId: 'u1', workspaceId: 'w1' };
const LEITURAS = [
  { tipo: 'atencao', categoriaId: LAZER, titulo: 'Você já usou 86% do orçamento de Lazer.', detalhe: 'Restam R$ 56,00 até o fim do mês.' },
  { tipo: 'elogio', categoriaId: null, titulo: 'Até agora você tem ido muito bem.', detalhe: '' },
];

test('pedido leva só categorias com algo a dizer, sem "Outros", e passa no contrato da função', () => {
  const payload = buildUniInsightsPayload(facts());

  assert.deepEqual(payload.fatos.categorias.map((categoria) => categoria.id), [ALIM, LAZER]);
  assert.deepEqual(payload.fatos.categorias.find((categoria) => categoria.id === LAZER).orcamento, { valor: 400, origem: 'teto' });
  assert.deepEqual(payload.fatos.categorias.find((categoria) => categoria.id === ALIM).orcamento, { valor: 952, origem: 'media' });
  assert.equal(payload.fatos.saidasDoMes, 1206);
  assert.equal(payload.fatos.periodo.dia, 8);
  assert.equal(payload.fatos.periodo.diasNoMes, 31);
  assert.equal(lerPedido(payload).ok, true);
});

test('sem saída no mês não há pedido', () => {
  const vazio = buildHomeMonthFacts({ transactions: [], categories: CATEGORIES, now: NOW });
  assert.equal(buildUniInsightsPayload(vazio), null);
});

test('impressão muda com um lançamento novo e não muda com os mesmos dados', () => {
  const primeira = fingerprintPayload(buildUniInsightsPayload(facts()));
  assert.equal(fingerprintPayload(buildUniInsightsPayload(facts())), primeira);

  const comNovo = buildHomeMonthFacts({
    transactions: [expense(LAZER, 344, '2026-10-03'), expense(LAZER, 20, '2026-10-07'), expense(ALIM, 812, '2026-10-05')],
    categories: CATEGORIES,
    now: NOW,
  });
  assert.notEqual(fingerprintPayload(buildUniInsightsPayload(comNovo)), primeira);
});

test('cache: pronto para os mesmos fatos, antigo para fatos novos e vencido no dia seguinte', () => {
  const storage = memoryStorage();
  writeUniReadingSuccess(storage, { ...IDS, fingerprint: 'a', leituras: LEITURAS, now: NOW });

  assert.equal(readUniReadingCache(storage, { ...IDS, fingerprint: 'a', now: NOW }).status, 'ready');
  const antigo = readUniReadingCache(storage, { ...IDS, fingerprint: 'b', now: NOW });
  assert.equal(antigo.status, 'stale');
  assert.equal(antigo.readings.length, 2);
  assert.equal(readUniReadingCache(storage, { ...IDS, fingerprint: 'a', now: new Date(2026, 9, 9, 8) }).status, 'miss');
  assert.equal(readUniReadingCache(storage, { userId: 'outro', workspaceId: 'w1', fingerprint: 'a', now: NOW }).status, 'miss');
});

test('cache: limite do dia bloqueia até amanhã; outra falha bloqueia só aqueles fatos', () => {
  const storage = memoryStorage();
  writeUniReadingFailure(storage, { ...IDS, fingerprint: 'a', errorCode: 'PROVIDER_ERROR', now: NOW });
  assert.equal(readUniReadingCache(storage, { ...IDS, fingerprint: 'a', now: NOW }).status, 'blocked');
  assert.equal(readUniReadingCache(storage, { ...IDS, fingerprint: 'b', now: NOW }).status, 'miss');

  writeUniReadingFailure(storage, { ...IDS, fingerprint: 'b', errorCode: 'RATE_LIMIT', now: NOW });
  assert.equal(readUniReadingCache(storage, { ...IDS, fingerprint: 'c', now: NOW }).status, 'blocked');
  assert.equal(readUniReadingCache(storage, { ...IDS, fingerprint: 'c', now: new Date(2026, 9, 9, 8) }).status, 'miss');
});

test('cache sem armazenamento não quebra', () => {
  const quebrado = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('cheio'); } };
  assert.doesNotThrow(() => writeUniReadingSuccess(quebrado, { ...IDS, fingerprint: 'a', leituras: LEITURAS, now: NOW }));
  assert.equal(readUniReadingCache(quebrado, { ...IDS, fingerprint: 'a', now: NOW }).status, 'miss');
  assert.equal(readUniReadingCache(null, { ...IDS, fingerprint: 'a', now: NOW }).status, 'miss');
});

test('frases da Uni viram linhas da tela com a categoria dos fatos', () => {
  const items = toUniReadingItems([...LEITURAS, { tipo: 'informacao', categoriaId: 'sumiu', titulo: 'x'.repeat(10), detalhe: '' }], facts());

  assert.equal(items[0].kind, HOME_MONTH_READING_KINDS.NEAR_BUDGET);
  assert.equal(items[0].categoryId, LAZER);
  assert.equal(items[0].category.name, 'Lazer');
  assert.equal(items[1].kind, HOME_MONTH_READING_KINDS.ON_TRACK);
  assert.equal(items[1].category, null);
  assert.equal(items[2].categoryId, null);
  assert.equal(new Set(items.map((item) => item.id)).size, 3);
});

test('cliente: sessão vira Bearer, 429 vira RATE_LIMIT e resposta boa devolve as leituras', async () => {
  const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } };
  let pedido;
  const ok = await requestUniInsights({ fatos: {} }, {
    client,
    url: 'https://x.supabase.co',
    anonKey: 'anon',
    configured: true,
    fetchImpl: async (url, opcoes) => {
      pedido = { url, opcoes };
      return { ok: true, status: 200, json: async () => ({ leituras: LEITURAS }) };
    },
  });
  assert.equal(ok.leituras.length, 2);
  assert.equal(pedido.url, 'https://x.supabase.co/functions/v1/uni-insights');
  assert.equal(pedido.opcoes.headers.Authorization, 'Bearer tok');

  const limite = await requestUniInsights({}, {
    client, url: 'u', anonKey: 'a', configured: true,
    fetchImpl: async () => ({ ok: false, status: 429 }),
  });
  assert.deepEqual(limite, { leituras: null, error: { code: 'RATE_LIMIT' } });

  const semSessao = await requestUniInsights({}, {
    client: { auth: { getSession: async () => ({ data: { session: null } }) } }, url: 'u', anonKey: 'a', configured: true,
    fetchImpl: async () => assert.fail('não deveria chamar'),
  });
  assert.equal(semSessao.error.code, 'UNAUTHORIZED');
});
