import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFinancialText } from '../uni-intents/index.js';
import { createConversationMemoryContext } from './conversationMemoryContext.js';
import { applyExplicitMemories } from './explicitMemoryResolver.js';
import { buildMemoryInfluenceExplanation } from './memoryInfluenceExplanation.js';
import {
  buildMemorySuggestion,
  resolveMemorySuggestionChoice,
} from './memorySuggestionBuilder.js';

const USER_ID = 'user-a';
const NOW = new Date('2026-07-12T12:00:00.000Z');
const accounts = [
  { id: 'nubank', name: 'Nubank', institution_name: 'Nubank', is_active: true },
  { id: 'itau', name: 'Itaú', institution_name: 'Itaú', is_active: true },
  { id: 'old', name: 'Conta antiga', institution_name: 'Antigo', is_active: false },
];
const categories = [
  { id: 'transport', name: 'Transportes', category_type: 'expense', is_active: true },
  { id: 'travel', name: 'Lazer', category_type: 'expense', is_active: true },
  { id: 'food', name: 'Alimentação', category_type: 'expense', is_active: true },
];

function rawMemory(overrides = {}) {
  return {
    id: 'memory-1',
    user_id: USER_ID,
    memory_type: 'merchant_category_mapping',
    memory_key: 'merchant:posto avenida',
    memory_value: {
      merchant: 'Posto Avenida',
      category_id: 'transport',
      category_name: 'Transportes',
    },
    source: 'explicit_user',
    status: 'confirmed',
    user_confirmed: true,
    confidence: 0.99,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function context(memories) {
  return createConversationMemoryContext(memories, { currentUserId: USER_ID, now: NOW });
}

function parsed(input = 'Paguei 85 no Posto Avenida.') {
  return parseFinancialText(input, { referenceDate: '2026-07-12' });
}

function resolve(input, memories, options = {}) {
  return applyExplicitMemories(parsed(input), context(memories), {
    accounts: options.accounts ?? accounts,
    categories: options.categories ?? categories,
    profileId: options.profileId,
  });
}

test('ausência de memória preserva o fluxo atual', () => {
  const original = parsed();
  const result = applyExplicitMemories(original, context([]), { accounts, categories });
  assert.deepEqual(result.resolvedResult.entities, original.entities);
  assert.deepEqual(result.influencedFields, []);
});

test('merchant_category_mapping altera somente a categoria', () => {
  const result = resolve('Paguei 85 no Posto Avenida.', [rawMemory()]);
  assert.equal(result.resolvedResult.entities.category, 'Transportes');
  assert.equal(result.memoryOverrides.categoryId, 'transport');
});

test('category_preference influencia categoria quando aplicável', () => {
  const result = resolve('Paguei 85 em uma compra.', [rawMemory({
    memory_type: 'category_preference',
    memory_key: 'category:expense',
    memory_value: { category_id: 'food', category_name: 'Alimentação', transaction_type: 'expense' },
  })]);
  assert.equal(result.memoryOverrides.categoryId, 'food');
});

test('account_preference influencia uma conta ativa', () => {
  const result = resolve('Paguei 85 no Posto Avenida.', [rawMemory({
    memory_type: 'account_preference',
    memory_key: 'account:expense',
    memory_value: { account_id: 'nubank', account_name: 'Nubank', transaction_type: 'expense' },
  })]);
  assert.equal(result.memoryOverrides.accountId, 'nubank');
});

test('conta arquivada não é aplicada', () => {
  const result = resolve('Paguei 85 no Posto Avenida.', [rawMemory({
    memory_type: 'account_preference',
    memory_key: 'account:expense',
    memory_value: { account_id: 'old', account_name: 'Conta antiga', transaction_type: 'expense' },
  })]);
  assert.equal(result.memoryOverrides.accountId, undefined);
});

test('memória nunca altera amount', () => {
  const result = resolve('Paguei 85 no Posto Avenida.', [rawMemory({
    memory_value: { ...rawMemory().memory_value, amount: 999 },
  })]);
  assert.equal(result.resolvedResult.entities.amount, 85);
});

test('memória nunca altera date', () => {
  const result = resolve('Paguei 85 no Posto Avenida hoje.', [rawMemory({
    memory_value: { ...rawMemory().memory_value, date: '2030-01-01' },
  })]);
  assert.equal(result.resolvedResult.entities.date, '2026-07-12');
});

for (const status of ['rejected', 'superseded']) {
  test(`memória ${status} é ignorada`, () => {
    assert.equal(resolve('Paguei 85 no Posto Avenida.', [rawMemory({ status })])
      .influencedFields.length, 0);
  });
}

test('memória expirada é ignorada', () => {
  const result = resolve('Paguei 85 no Posto Avenida.', [rawMemory({
    expires_at: '2026-07-11T00:00:00.000Z',
  })]);
  assert.equal(result.influencedFields.length, 0);
});

test('conflito relevante exige decisão sem sobrescrever', () => {
  const result = resolve('Paguei 85 de viagem no Posto Avenida.', [rawMemory()]);
  assert.equal(result.conflicts[0].field, 'category');
  assert.equal(result.resolvedResult.entities.category, 'Lazer');
  assert.match(result.conflicts[0].explanation, /Transportes/);
});

test('Só desta vez não cria payload persistível', () => {
  const choice = resolveMemorySuggestionChoice({ candidate: { type: 'x' } }, 'once');
  assert.equal(choice.shouldPersist, false);
  assert.equal(choice.payload, null);
});

test('Lembrar cria payload explícito mínimo', () => {
  const suggestion = buildMemorySuggestion({
    parsedResult: parsed(),
    previousAction: { category: { id: 'travel' } },
    correctedAction: { description: 'Posto Avenida', category: categories[0] },
    corrections: { categoryId: 'transport' },
    memoryContext: context([]),
  });
  const choice = resolveMemorySuggestionChoice(suggestion, 'remember');
  assert.equal(choice.shouldPersist, true);
  assert.deepEqual(Object.keys(choice.payload).sort(), ['key', 'source', 'type', 'value']);
  assert.equal(JSON.stringify(choice.payload).includes('85'), false);
});

test('memória duplicada não gera sugestão', () => {
  const suggestion = buildMemorySuggestion({
    parsedResult: parsed(),
    previousAction: { category: { id: 'travel' } },
    correctedAction: { description: 'Posto Avenida', category: categories[0] },
    corrections: { categoryId: 'transport' },
    memoryContext: context([rawMemory()]),
  });
  assert.equal(suggestion, null);
});

test('falha de carregamento pode usar contexto vazio sem interromper conversa', () => {
  const result = applyExplicitMemories(parsed(), null, { accounts, categories });
  assert.equal(result.resolvedResult.ready, true);
});

test('modo demo aceita memória explícita local', () => {
  const demo = context([rawMemory({ id: 'demo-memory' })]);
  assert.equal(demo.memories[0].id, 'demo-memory');
  assert.equal(demo.memories[0].source, 'explicit_user');
});

test('personalidade altera somente a redação da influência', () => {
  const influence = [{ field: 'category', label: 'Transportes' }];
  const balanced = buildMemoryInfluenceExplanation(influence, 'balanced');
  const warm = buildMemoryInfluenceExplanation(influence, 'warm');
  assert.notEqual(balanced, warm);
  assert.match(balanced, /Transportes/);
  assert.match(warm, /Transportes/);
});

test('conversation_preference preserva somente o tom explícito', () => {
  const safeContext = context([rawMemory({
    memory_type: 'conversation_preference',
    memory_key: 'conversation:tone',
    memory_value: { profile_id: 'warm', amount: 999, date: '2030-01-01' },
  })]);
  assert.deepEqual(safeContext.memories[0].value, { profile_id: 'warm' });
});

test('confirmação financeira continua obrigatória', () => {
  const result = resolve('Paguei 85 no Posto Avenida.', [rawMemory()]);
  assert.equal(result.resolvedResult.requiresConfirmation, true);
});

test('memória de outro usuário não entra no contexto', () => {
  const result = resolve('Paguei 85 no Posto Avenida.', [rawMemory({ user_id: 'user-b' })]);
  assert.equal(result.influencedFields.length, 0);
});

test('metadados operacionais são removidos e originais não são mutados', () => {
  const memory = rawMemory();
  const input = parsed();
  const inputCopy = structuredClone(input);
  const safeContext = context([memory]);
  applyExplicitMemories(input, safeContext, { accounts, categories });
  assert.deepEqual(input, inputCopy);
  assert.equal(Object.hasOwn(safeContext.memories[0], 'confidence'), false);
  assert.equal(Object.hasOwn(safeContext.memories[0], 'created_at'), false);
  assert.equal(Object.isFrozen(safeContext), true);
});
