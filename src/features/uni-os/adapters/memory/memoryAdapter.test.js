import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adaptMemorySources,
  createMemoryReadProvider,
  createUniOSMemory,
  normalizeFinancialType,
  normalizeMemoryEntity,
  runMemoryAdapterShadow,
  UNI_OS_MEMORY_SCHEMA_VERSION,
} from './index.js';
import { UNI_OS_ENABLED } from '../featureFlags.js';

const WORKSPACE_ID = 'workspace-a';
const NOW = '2026-07-12T20:00:00.000Z';
const FIXED_OPTIONS = Object.freeze({ now: () => NOW });

function memory(overrides = {}) {
  return {
    id: 'memory-1',
    workspace_id: WORKSPACE_ID,
    memory_type: 'category_preference',
    memory_value: {
      category_id: 'category-1',
      category_name: 'Alimentação',
      transaction_type: 'expense',
    },
    source: 'explicit_user',
    status: 'confirmed',
    expires_at: null,
    ...overrides,
  };
}

test('schema retorna contrato completo e profundamente imutável sem congelar a fonte', () => {
  const accounts = [{ account: { normalized: 'nubank' } }];
  const result = createUniOSMemory({
    timestamp: NOW,
    financial: { accounts },
    metadata: { providers: ['explicit_memory'] },
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.financial.accounts[0].account), true);
  assert.equal(Object.isFrozen(accounts), false);
  assert.equal(Object.isFrozen(accounts[0].account), false);
  assert.equal(result.metadata.version, UNI_OS_MEMORY_SCHEMA_VERSION);
});

test('normaliza categorias, contas, instituições e merchants sem alterar apresentação', () => {
  assert.deepEqual(normalizeMemoryEntity('MERCADO', 'category'), {
    type: 'category', normalized: 'mercado', display: 'MERCADO',
  });
  assert.equal(normalizeMemoryEntity('Nu Bank', 'account').normalized, 'nu bank');
  assert.equal(normalizeMemoryEntity('Banco Ágil', 'institution').normalized, 'banco agil');
  assert.equal(normalizeMemoryEntity('Posto Avenida', 'merchant').normalized, 'posto avenida');
});

test('normaliza somente tipos financeiros conhecidos', () => {
  assert.equal(normalizeFinancialType('EXPENSE'), 'expense');
  assert.equal(normalizeFinancialType('transfer'), 'transfer');
  assert.equal(normalizeFinancialType('investment'), null);
});

test('consolida providers explícitos e contexto de conversa', () => {
  const category = memory();
  const conversation = memory({
    id: 'memory-tone',
    memory_type: 'conversation_preference',
    memory_value: { profile_id: 'warm' },
  });
  const result = adaptMemorySources({
    workspaceId: WORKSPACE_ID,
    explicitMemory: [category],
    conversationMemory: { memories: [conversation] },
  }, FIXED_OPTIONS);
  assert.deepEqual(result.metadata.providers, ['explicit_memory', 'conversation_memory']);
  assert.equal(result.explicit.items.length, 2);
  assert.equal(result.conversation.items.length, 1);
  assert.equal(result.financial.categories[0].category.normalized, 'alimentacao');
  assert.equal(result.preferences.conversation[0].mode, 'warm');
});

test('consolida preferências de conta e categoria', () => {
  const result = adaptMemorySources({
    workspaceId: WORKSPACE_ID,
    accountPreferences: [memory({
      id: 'account-memory',
      memory_type: 'account_preference',
      memory_value: {
        account_id: 'account-1',
        account_name: 'Nubank',
        institution_name: 'Nu Pagamentos',
        transaction_type: 'expense',
      },
    })],
    categoryPreferences: [memory()],
  }, FIXED_OPTIONS);
  assert.equal(result.financial.accounts[0].account.normalized, 'nubank');
  assert.equal(result.financial.accounts[0].institution.normalized, 'nu pagamentos');
  assert.equal(result.preferences.account.length, 1);
  assert.equal(result.preferences.category.length, 1);
});

test('consolida merchant mapping e objetivo financeiro sem descrições', () => {
  const result = adaptMemorySources({
    workspaceId: WORKSPACE_ID,
    merchantMappings: [memory({
      id: 'merchant-memory',
      memory_type: 'merchant_category_mapping',
      source: 'user_correction',
      memory_value: { merchant: 'Posto Avenida', category_id: 'transport', category_name: 'Transporte' },
    })],
    financialGoalContext: [memory({
      id: 'goal-memory',
      memory_type: 'financial_goal_context',
      memory_value: { goal_id: 'goal-1', goal_name: 'Reserva', targetAmount: 50000, summary: 'private phrase' },
    })],
  }, FIXED_OPTIONS);
  assert.equal(result.financial.merchants[0].merchant.normalized, 'posto avenida');
  assert.equal(result.financial.goals[0].goal.normalized, 'reserva');
  assert.doesNotMatch(JSON.stringify(result), /50000|private phrase/);
});

test('ignora memórias inferidas mesmo quando confirmadas', () => {
  const result = adaptMemorySources({
    workspaceId: WORKSPACE_ID,
    financialMemory: [
      memory({ id: 'inferred-1', memory_type: 'recurring_expense', source: 'transaction_pattern' }),
      memory({ id: 'inferred-2', memory_type: 'financial_goal_context', source: 'conversation_context' }),
    ],
  }, FIXED_OPTIONS);
  assert.equal(result.explicit.items.length, 0);
  assert.equal(result.financial.goals.length, 0);
});

test('ignora memórias inativas, expiradas e inválidas', () => {
  const result = adaptMemorySources({
    workspaceId: WORKSPACE_ID,
    explicitMemory: [
      memory({ id: 'rejected', status: 'rejected' }),
      memory({ id: 'expired-status', status: 'expired' }),
      memory({ id: 'expired-date', expires_at: '2026-07-12T19:00:00.000Z' }),
      memory({ id: 'invalid-expiration', expires_at: 'not-a-date' }),
      memory({ id: null }),
      memory({ id: 'invalid-value', memory_value: null }),
      memory({ id: 'invalid-type', memory_type: 'unknown' }),
    ],
  }, FIXED_OPTIONS);
  assert.equal(result.explicit.items.length, 0);
});

test('isola memórias pelo workspace atual', () => {
  const result = adaptMemorySources({
    workspaceId: WORKSPACE_ID,
    explicitMemory: [memory(), memory({ id: 'other', workspace_id: 'workspace-b' })],
  }, FIXED_OPTIONS);
  assert.equal(result.explicit.items.length, 1);
  assert.equal(result.explicit.items[0].id, 'memory-1');
});

test('provider expõe somente leitura do snapshot consolidado', async () => {
  const snapshot = adaptMemorySources({ workspaceId: WORKSPACE_ID }, FIXED_OPTIONS);
  const provider = createMemoryReadProvider(snapshot);
  assert.equal(provider.providerName, 'uni_os_memory_adapter');
  assert.equal(await provider.read(), snapshot);
  assert.equal('write' in provider, false);
  assert.equal('create' in provider, false);
});

test('feature flag compartilhada permanece desligada', async () => {
  let calls = 0;
  const result = await runMemoryAdapterShadow({}, { processor: () => { calls += 1; } });
  assert.equal(UNI_OS_ENABLED, false);
  assert.equal(result.status, 'DISABLED');
  assert.equal(calls, 0);
});

test('modo sombra envia provider de leitura e descarta resultado', async () => {
  let receivedMemory = null;
  const result = await runMemoryAdapterShadow({
    workspaceId: WORKSPACE_ID,
    explicitMemory: [memory()],
  }, {
    enabled: true,
    adapterOptions: FIXED_OPTIONS,
    processor: async ({ memoryProviders }) => {
      receivedMemory = await memoryProviders[0].read();
      return { ignored: true };
    },
  });
  assert.equal(result.status, 'OBSERVED');
  assert.equal(receivedMemory.explicit.items.length, 1);
  assert.equal(result.result, null);
});

test('objetos vazios geram memória vazia segura', () => {
  const result = adaptMemorySources({}, FIXED_OPTIONS);
  assert.deepEqual(result.explicit.items, []);
  assert.deepEqual(result.conversation.items, []);
  assert.deepEqual(result.financial.accounts, []);
  assert.deepEqual(result.metadata.providers, []);
});

test('providers vazios preservam schema e registram somente a fonte consultada', () => {
  const result = adaptMemorySources({
    workspaceId: WORKSPACE_ID,
    explicitMemory: [],
    conversationMemory: { memories: [] },
  }, FIXED_OPTIONS);
  assert.deepEqual(result.metadata.providers, ['explicit_memory', 'conversation_memory']);
  assert.equal(result.explicit.items.length, 0);
  assert.equal(result.conversation.items.length, 0);
});

test('logs DEV contêm somente contagens e nomes de providers', async () => {
  const logs = [];
  await runMemoryAdapterShadow({
    workspaceId: WORKSPACE_ID,
    explicitMemory: [memory({
      memory_value: { category_id: 'secret-id', category_name: 'Categoria Privada' },
    })],
  }, {
    enabled: true,
    isDevelopment: true,
    adapterOptions: FIXED_OPTIONS,
    logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
    processor: async () => ({}),
  });
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /\[UNI OS\] Memory/);
  assert.doesNotMatch(serialized, /secret-id|Categoria Privada|memory-1|workspace-a/);
});

test('falhas do modo sombra são controladas', async () => {
  const result = await runMemoryAdapterShadow({}, {
    enabled: true,
    processor: async () => { throw new Error('internal'); },
  });
  assert.equal(result.status, 'FAILED_SAFE');
  assert.equal(result.memory, null);
});
