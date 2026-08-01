// Testes da Resolução Inteligente de Referências do Uni Engine (Fase 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasImplicitReference, resolveImplicitReference } from './resolveImplicitReference.js';
import { createOperationalMemory } from './operationalMemory.js';
import { buildBaseInput } from './testFixtures.js';

function resolveFor(text, options = {}) {
  const input = buildBaseInput({ message: { text } });
  return resolveImplicitReference(input, {
    analyzed: options.analyzed ?? null,
    epistemic: options.epistemic ?? null,
    memory: options.memory ?? null,
  });
}

test('referências 90: detecta pronomes e demonstrativos (incluindo contrações)', () => {
  const examples = [
    'isso',
    'nisso',
    'essa conta',
    'nessa conta',
    'aquela conta',
    'naquela conta',
    'esse valor',
    'nesse valor',
    'esse mesmo valor',
    'aquele gasto',
    'naquele gasto',
    'essa compra',
    'nessa compra',
    'esse pagamento',
    'essa transferência',
    'aquela transferência',
    'ela',
    'ele',
    'aquele dinheiro',
    'o anterior',
    'o último',
    'o mesmo',
    'aquilo',
  ];
  examples.forEach((text) => {
    assert.equal(hasImplicitReference(text), true, `deve detectar: ${text}`);
  });
  assert.equal(hasImplicitReference('Gastei 50 reais no mercado'), false);
  assert.equal(hasImplicitReference('quanto tenho?'), false);
  assert.equal(hasImplicitReference(''), false);
});

test('referências 91: essa conta resolve da memória operacional', () => {
  const memory = createOperationalMemory({ lastAccount: 'Nubank', lastAccountId: 'acc-nubank' });
  const result = resolveFor('lança nessa conta', { memory });
  assert.equal(result.hasReference, true);
  assert.equal(result.resolved, true);
  assert.equal(result.referenceType, 'account');
  assert.equal(result.resolution.value, 'Nubank');
  assert.equal(result.resolution.source, 'operational_memory');
  assert.equal(result.source, 'operational_memory');
  assert.ok(result.confidence >= 0.8);
});

test('referências 92: essa conta sem memória resolve pelo histórico recente', () => {
  const analyzed = {
    history: { lastAccountReference: 'Itaú' },
  };
  const result = resolveFor('essa conta', { analyzed });
  assert.equal(result.resolved, true);
  assert.equal(result.resolution.value, 'Itaú');
  assert.equal(result.resolution.source, 'conversation_history');
});

test('referências 93: conta citada na própria mensagem tem prioridade explícita', () => {
  const memory = createOperationalMemory({ lastAccount: 'Itaú' });
  const result = resolveFor('essa conta aqui do Nubank', { memory });
  assert.equal(result.resolved, true);
  assert.equal(result.resolution.value, 'Nubank');
  assert.equal(result.resolution.source, 'user_message');
  assert.equal(result.confidence, 1);
});

test('referências 94: esse valor resolve da memória (último valor)', () => {
  const memory = createOperationalMemory({ lastValue: 120.5 });
  const result = resolveFor('repete esse valor', { memory });
  assert.equal(result.resolved, true);
  assert.equal(result.referenceType, 'value');
  assert.equal(result.resolution.value, 120.5);
  assert.equal(result.resolution.source, 'operational_memory');
});

test('referências 95: aquele gasto resolve da última entidade', () => {
  const memory = createOperationalMemory({
    lastEntity: 'Mercado',
    lastValue: 120.5,
    lastAccount: 'Nubank',
  });
  const result = resolveFor('aquele gasto de ontem', { memory });
  assert.equal(result.resolved, true);
  assert.equal(result.referenceType, 'entity');
  assert.equal(result.resolution.description, 'Mercado');
  assert.equal(result.resolution.amount, 120.5);
});

test('referências 96: essa compra resolve da última transação do snapshot', () => {
  const result = resolveFor('essa compra foi cara', {});
  assert.equal(result.resolved, true);
  assert.equal(result.resolution.description, 'Mercado');
  assert.equal(result.resolution.source, 'financial_snapshot');
});

test('referências 97: isso resolve por entidade com fallback em cadeia', () => {
  const memory = createOperationalMemory({ lastEntity: 'Salário de julho', lastValue: 1000 });
  const result = resolveFor('isso já foi pago?', { memory });
  assert.equal(result.resolved, true);
  assert.equal(result.resolution.description, 'Salário de julho');
  assert.equal(result.resolution.source, 'operational_memory');
});

test('referências 98: referência sem nenhum candidato fica unresolved, sem inventar', () => {
  const input = buildBaseInput({
    message: { text: 'aquilo' },
    financialSnapshot: {
      hasData: false,
      totalBalance: null,
      referenceDate: null,
      accounts: [],
      categories: [],
      recentTransactions: [],
    },
  });
  const result = resolveImplicitReference(input, {});
  assert.equal(result.hasReference, true);
  assert.equal(result.resolved, false);
  assert.equal(result.source, 'unresolved');
  assert.equal(result.resolution, null);
  assert.equal(result.confidence, 0);
});

test('referências 99: mensagem com dados explícitos não resolve referência genérica', () => {
  const memory = createOperationalMemory({ lastValue: 100 });
  const result = resolveFor('isso custou 250 reais', { memory });
  assert.equal(result.hasReference, true);
  assert.equal(result.resolved, false, 'dados explícitos tornam a resolução conservadora');
});

test('referências: pendência aguardando conta ativa resolução de essa/ela', () => {
  const analyzed = {
    pending: { exists: true, intent: 'register_expense', awaitedField: 'account' },
    history: {},
  };
  const memory = createOperationalMemory({ lastAccount: 'Itaú' });
  const result = resolveFor('foi no Nubank, usa ela', { analyzed, memory });
  assert.equal(result.resolved, true);
  assert.equal(result.referenceType, 'account');
  assert.equal(result.resolution.value, 'Nubank');
  assert.equal(result.resolution.source, 'user_message');
});

test('referências: saída é sempre serializável', () => {
  const result = resolveFor('essa conta', {});
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.ok(Array.isArray(result.candidates));
  assert.ok(Array.isArray(result.rulesUsed));
});
