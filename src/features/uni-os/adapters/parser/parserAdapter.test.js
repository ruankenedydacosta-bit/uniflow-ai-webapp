import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFinancialText } from '../../../uni-intents/index.js';
import {
  adaptParserResult,
  createParsedIntent,
  isParsedIntent,
  normalizeParserAmount,
  normalizeParserDate,
  normalizeParserEntity,
  normalizeParserText,
  runParserAdapterShadow,
  UNI_OS_ENABLED,
} from './index.js';

const FIXED_OPTIONS = Object.freeze({
  idFactory: () => 'intent-001',
  now: () => '2026-07-12T18:00:00.000Z',
  referenceDate: '2026-07-12',
  source: 'voice',
  language: 'pt-BR',
});

test('normalização textual remove variação de caixa, acento e espaços', () => {
  assert.equal(normalizeParserText('  ALIMENTAÇÃO  '), 'alimentacao');
  assert.equal(normalizeParserText('Nu   Bank'), 'nu bank');
});

test('conta normalizada mantém valor de apresentação', () => {
  assert.deepEqual(normalizeParserEntity('Nubank', 'account'), {
    type: 'account', normalized: 'nubank', display: 'Nubank',
  });
});

test('categorias equivalentes convergem para a mesma identidade', () => {
  const categories = ['mercado', 'Mercado', 'MERCADO'].map((value) =>
    normalizeParserEntity(value, 'category').normalized);
  assert.deepEqual(categories, ['mercado', 'mercado', 'mercado']);
});

test('valores monetários convergem para número decimal', () => {
  assert.equal(normalizeParserAmount('R$85'), 85);
  assert.equal(normalizeParserAmount('85 reais'), 85);
  assert.equal(normalizeParserAmount(85), 85);
  assert.equal(normalizeParserAmount('1.250,50'), 1250.5);
});

test('datas relativas e curtas convergem para ISO do projeto', () => {
  assert.equal(normalizeParserDate('Hoje', '2026-07-12'), '2026-07-12');
  assert.equal(normalizeParserDate('Ontem', '2026-07-12'), '2026-07-11');
  assert.equal(normalizeParserDate('10/07', '2026-07-12'), '2026-07-10');
});

test('schema possui forma única e é profundamente imutável', () => {
  const accounts = [{ type: 'account', normalized: 'nubank', display: 'Nubank' }];
  const result = createParsedIntent({
    id: 'id', timestamp: 'time', intent: 'register_expense', entities: { accounts },
  });
  assert.equal(isParsedIntent(result), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.entities.accounts), true);
  assert.equal(Object.isFrozen(result.entities.accounts[0]), true);
  assert.equal(Object.isFrozen(accounts), false);
  assert.equal(result.actionType, 'expense');
});

test('adapter traduz a saída real do parser sem mutá-la', () => {
  const parserOutput = parseFinancialText('transferi 500 para o Nubank');
  const snapshot = structuredClone(parserOutput);
  const result = adaptParserResult(parserOutput, FIXED_OPTIONS);
  assert.equal(result.id, 'intent-001');
  assert.equal(result.source, 'voice');
  assert.equal(result.intent, 'register_transfer');
  assert.equal(result.actionType, 'transfer');
  assert.deepEqual(result.entities.values, [500]);
  assert.equal(result.entities.accounts[0].normalized, 'nubank');
  assert.equal(result.entities.categories[0].normalized, 'transferencia');
  assert.equal(result.requiresConfirmation, true);
  assert.deepEqual(parserOutput, snapshot);
});

test('adapter normaliza entidades futuras em coleções consistentes', () => {
  const result = adaptParserResult({
    intent: 'question',
    confidence: 3,
    entities: {
      accounts: ['Nubank', 'nubank'],
      categories: ['Mercado'],
      merchants: ['Mercado Central'],
      values: ['R$85', 20],
      dates: ['Hoje'],
      workspaces: ['Pessoal'],
    },
  }, FIXED_OPTIONS);
  assert.equal(result.confidence, 1);
  assert.equal(result.entities.accounts.length, 1);
  assert.equal(result.entities.merchants[0].normalized, 'mercado central');
  assert.deepEqual(result.entities.values, [85, 20]);
  assert.deepEqual(result.entities.dates, ['2026-07-12']);
  assert.equal(result.entities.workspaces[0].normalized, 'pessoal');
});

test('feature flag interna permanece desligada por padrão', async () => {
  let calls = 0;
  const result = await runParserAdapterShadow({}, { processor: () => { calls += 1; } });
  assert.equal(UNI_OS_ENABLED, false);
  assert.equal(result.status, 'DISABLED');
  assert.equal(calls, 0);
});

test('modo sombra envia ao UNI OS e descarta o resultado', async () => {
  let received = null;
  const result = await runParserAdapterShadow(parseFinancialText('qual meu saldo?'), {
    enabled: true,
    adapterOptions: FIXED_OPTIONS,
    processor: async (input) => { received = input; return { facts: {}, plan: {} }; },
  });
  assert.equal(result.status, 'OBSERVED');
  assert.equal(received.parsedIntent.intent, 'check_balance');
  assert.equal(result.result, null);
});

test('modo sombra inclui contexto adaptado na mesma chamada ao UNI OS', async () => {
  let received = null;
  await runParserAdapterShadow(parseFinancialText('qual meu saldo?'), {
    enabled: true,
    adapterOptions: FIXED_OPTIONS,
    contextAdapterOptions: { now: FIXED_OPTIONS.now },
    contextSources: {
      sessionContext: { isAuthenticated: true, user: { id: 'u1' } },
      workspace: { id: 'w1' },
      channel: 'text',
      language: 'pt-BR',
      timezone: 'America/Sao_Paulo',
    },
    processor: async (input) => { received = input; return { facts: {}, plan: {} }; },
  });
  assert.equal(received.context.session.authenticated, true);
  assert.equal(received.context.workspace.id, 'w1');
  assert.equal(received.context.featureFlags.uniOS, true);
});

test('modo sombra inclui memória somente leitura na mesma chamada ao UNI OS', async () => {
  let received = null;
  await runParserAdapterShadow(parseFinancialText('qual meu saldo?'), {
    enabled: true,
    adapterOptions: FIXED_OPTIONS,
    memoryAdapterOptions: { now: FIXED_OPTIONS.now },
    memorySources: {
      workspaceId: 'w1',
      conversationMemory: {
        memories: [{
          id: 'memory-1',
          type: 'conversation_preference',
          value: { profile_id: 'warm' },
          source: 'explicit_user',
          confirmed: true,
        }],
      },
    },
    processor: async (input) => { received = input; return { facts: {}, plan: {} }; },
  });
  const memory = await received.memoryProviders[0].read();
  assert.equal(received.memoryProviders.length, 1);
  assert.equal(memory.preferences.conversation[0].mode, 'warm');
});

test('logging DEV contém apenas resumo sem texto ou valores', async () => {
  const logs = [];
  await runParserAdapterShadow(parseFinancialText('paguei 85 no mercado'), {
    enabled: true,
    isDevelopment: true,
    adapterOptions: FIXED_OPTIONS,
    logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
    processor: async ({ parsedIntent }) => ({
      facts: {
        attention: { type: 'financial_action' },
        reflection: { conflicts: [], ambiguities: [], risks: [], confirmationPending: true },
      },
      plan: { steps: ['safe'], requiresConfirmation: parsedIntent.requiresConfirmation },
    }),
  });
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /\[UNI OS\] Parsed Intent/);
  assert.doesNotMatch(serialized, /mercado|85|paguei/i);
});

test('falha no modo sombra é contida e não alcança o fluxo legado', async () => {
  const result = await runParserAdapterShadow({}, {
    enabled: true,
    processor: async () => { throw new Error('internal'); },
  });
  assert.equal(result.status, 'FAILED_SAFE');
});
