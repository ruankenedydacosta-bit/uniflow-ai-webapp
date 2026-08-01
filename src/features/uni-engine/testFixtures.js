// Fixtures e helpers compartilhados dos testes do Uni Engine (Fase 1).
import { createUniEngineConfig } from './uniEngineConfig.js';

export const TEST_CONFIG_ENABLED = createUniEngineConfig({
  env: {
    VITE_UNI_ENGINE_ENABLED: 'true',
    VITE_UNI_ENGINE_SHADOW_MODE: 'true',
    VITE_UNI_ENGINE_TELEMETRY_ENABLED: 'false',
  },
});

export const TEST_CONFIG_DISABLED = createUniEngineConfig({
  env: {
    VITE_UNI_ENGINE_ENABLED: 'false',
    VITE_UNI_ENGINE_SHADOW_MODE: 'true',
    VITE_UNI_ENGINE_TELEMETRY_ENABLED: 'false',
  },
});

export const TEST_SNAPSHOT = {
  hasData: true,
  totalBalance: 740.5,
  referenceDate: '2026-07-30',
  accounts: [
    { id: 'acc-nubank', name: 'Nubank', current_balance: 480.5 },
    { id: 'acc-itau', name: 'Itaú', current_balance: 260 },
  ],
  categories: [
    { id: 'cat-food', name: 'Alimentação' },
    { id: 'cat-transport', name: 'Transporte' },
  ],
  recentTransactions: [
    { id: 't1', description: 'Mercado', amount: 120.5, transaction_type: 'expense', account_id: 'acc-nubank', category_id: 'cat-food' },
  ],
};

export function buildBaseInput(overrides = {}) {
  const safe = overrides ?? {};
  return {
    message: {
      id: 'msg-1',
      text: 'Gastei 50 reais no mercado',
      source: 'text',
      createdAt: '2026-07-30T10:00:00.000Z',
      ...(safe.message ?? {}),
    },
    session: {
      userId: 'user-1',
      workspaceId: 'workspace-1',
      conversationId: 'conv-1',
      ...(safe.session ?? {}),
    },
    context: {
      pendingAction: safe.pendingAction ?? null,
      conversationHistory: safe.conversationHistory ?? [],
      financialSnapshot: safe.financialSnapshot !== undefined ? safe.financialSnapshot : TEST_SNAPSHOT,
      userPreferences: {
        conversationStyle: 'balanced',
        workspaceType: 'personal',
        ...(safe.userPreferences ?? {}),
      },
      currentRoute: safe.currentRoute ?? 'uni-chat',
      ...(safe.context ?? {}),
    },
    currentPipeline: {
      detectedIntent: safe.detectedIntent ?? 'register_expense',
      pendingIntent: safe.pendingIntent ?? null,
      pendingActive: safe.pendingActive ?? false,
      resultType: safe.resultType ?? 'unknown',
      ...(safe.currentPipeline ?? {}),
    },
  };
}

export function buildExpenseActionPending() {
  return {
    status: 'needs_clarification',
    intent: 'register_expense',
    transactionType: 'expense',
    typeLabel: 'Despesa',
    amount: 50,
    account: null,
    category: { id: 'cat-food', name: 'Alimentação' },
    description: 'Mercado',
    issues: [{ field: 'account', code: 'account_required' }],
    options: { accounts: [], categories: [] },
    payload: null,
  };
}

export function buildReadyActionPending() {
  return {
    status: 'ready',
    intent: 'register_expense',
    transactionType: 'expense',
    typeLabel: 'Despesa',
    amount: 50,
    account: { id: 'acc-nubank', name: 'Nubank' },
    category: { id: 'cat-food', name: 'Alimentação' },
    description: 'Mercado',
    issues: [],
    options: { accounts: [], categories: [] },
    payload: {
      account_id: 'acc-nubank',
      category_id: 'cat-food',
      transaction_type: 'expense',
      description: 'Mercado',
      amount: 50,
      transaction_date: '2026-07-30',
      status: 'completed',
    },
  };
}
