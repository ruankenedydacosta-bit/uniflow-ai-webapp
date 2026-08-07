// Sprint 4 (Bloco 4.2.2) — testes comportamentais do orquestrador
// semântico financeiro central.
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFinancialSnapshot } from './financialSnapshot.js';
import {
  runFinancialSemanticOrchestrator,
  buildOrchestratorCapabilityCatalog,
  MAX_ORCHESTRATOR_SUB_INTENTS,
} from './financialSemanticOrchestrator.js';

const REFERENCE_DATE = '2026-07-15';

const ACCOUNTS = [
  { id: 'acc-nubank', name: 'Nubank', current_balance: 500, is_active: true },
  { id: 'acc-itau', name: 'Itaú', current_balance: 200, is_active: true },
];
const CATEGORIES = [
  { id: 'cat-food', name: 'Alimentação', is_active: true },
  { id: 'cat-transport', name: 'Transporte', is_active: true },
];
const TRANSACTIONS = [
  { id: 't1', account_id: 'acc-nubank', category_id: 'cat-food', transaction_type: 'expense', amount: 120.5, description: 'Mercado', transaction_date: '2026-07-14', status: 'confirmed' },
  { id: 't2', account_id: 'acc-itau', category_id: 'cat-transport', transaction_type: 'expense', amount: 45, description: 'Uber', transaction_date: '2026-07-10', status: 'confirmed' },
  { id: 't3', account_id: 'acc-nubank', category_id: null, transaction_type: 'income', amount: 3000, description: 'Salário', transaction_date: '2026-07-05', status: 'confirmed' },
];
const ACCOUNT_BALANCES = [
  { account_id: 'acc-nubank', derived_balance: 480.5 },
  { account_id: 'acc-itau', derived_balance: 155 },
];

function buildSnapshot() {
  return buildFinancialSnapshot({
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    transactions: TRANSACTIONS,
    accountBalances: ACCOUNT_BALANCES,
    referenceDate: REFERENCE_DATE,
  });
}

function baseInterpretation(overrides = {}) {
  return {
    status: 'resolved',
    intent: 'total_expenses',
    confidence: 0.9,
    entities: {
      transactionType: null, amount: null, account: null, category: null,
      description: null, period: null, comparisonPeriod: null,
    },
    suggestedTool: null,
    clarificationQuestion: null,
    reasoningTags: [],
    operation: null,
    isCompound: false,
    subIntents: [],
    requestedCapabilities: [],
    ...overrides,
  };
}

// ── Contrato de entrada/saída ──────────────────────────────────────────

test('sem interpretação ou snapshot, devolve fallback com segurança -- nunca lança', () => {
  assert.equal(runFinancialSemanticOrchestrator({}).status, 'fallback');
  assert.equal(runFinancialSemanticOrchestrator({ interpretation: baseInterpretation() }).status, 'fallback');
});

test('not_financial e unsupported passam direto, sem tentar resolver nada', () => {
  const snapshot = buildSnapshot();
  const notFinancial = runFinancialSemanticOrchestrator({ interpretation: baseInterpretation({ status: 'not_financial', intent: null }), snapshot });
  assert.equal(notFinancial.status, 'not_financial');
  const unsupported = runFinancialSemanticOrchestrator({ interpretation: baseInterpretation({ status: 'unsupported', intent: 'unsupported' }), snapshot });
  assert.equal(unsupported.status, 'unsupported');
});

// ── Confiança baixa / clarificação ──────────────────────────────────────

test('confiança abaixo do limiar nunca executa -- vira needs_clarification', () => {
  const snapshot = buildSnapshot();
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({ confidence: 0.2 }),
    snapshot,
  });
  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.structuredResult, null);
});

test('status needs_clarification da LLM usa a pergunta que ela mesma formulou', () => {
  const snapshot = buildSnapshot();
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({ status: 'needs_clarification', clarificationQuestion: 'De qual conta você fala?' }),
    snapshot,
  });
  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.responseDraft, 'De qual conta você fala?');
});

// ── Consulta simples via ponte legada (Sprint 3) ────────────────────────

test('total_expenses (ponte legada) executa via motor determinístico e devolve número real', () => {
  const snapshot = buildSnapshot();
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({ intent: 'total_expenses', entities: { ...baseInterpretation().entities, period: 'este mês' } }),
    snapshot,
  });
  assert.equal(result.status, 'handled');
  assert.equal(result.source, 'deterministic');
  assert.match(result.responseDraft, /165,5|165\.5/);
});

// ── Consulta simples via registro novo (Sprint 4) ───────────────────────

test('total_balance (capacidade nova) executa via registro e devolve o saldo real', () => {
  const snapshot = buildSnapshot();
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({ intent: 'total_balance' }),
    snapshot,
  });
  assert.equal(result.status, 'handled');
  assert.equal(result.source, 'semantic');
  assert.equal(result.executionPlan.type, 'capability');
  assert.match(result.responseDraft, /635,5/);
});

test('top_expenses devolve as maiores despesas reais, ordenadas', () => {
  const snapshot = buildSnapshot();
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({ intent: 'top_expenses' }),
    snapshot,
  });
  assert.equal(result.status, 'handled');
  assert.equal(result.structuredResult.items[0].id, 't1');
});

test('recent_transactions devolve movimentações reais', () => {
  const snapshot = buildSnapshot();
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({ intent: 'recent_transactions' }),
    snapshot,
  });
  assert.equal(result.status, 'handled');
  assert.equal(result.structuredResult.items.length, 3);
});

// ── Entidades e ambiguidade ─────────────────────────────────────────────

test('conta ambígua ("Nub" batendo em duas contas) pergunta, nunca escolhe sozinho', () => {
  const snapshot = buildFinancialSnapshot({
    accounts: [
      { id: 'a1', name: 'Nubank', is_active: true },
      { id: 'a2', name: 'Nu Empresas', is_active: true },
    ],
    categories: CATEGORIES,
    transactions: TRANSACTIONS,
    accountBalances: [],
    referenceDate: REFERENCE_DATE,
  });
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({ intent: 'income_by_account', entities: { ...baseInterpretation().entities, account: 'Nu' } }),
    snapshot,
  });
  assert.equal(result.status, 'needs_clarification');
  assert.match(result.responseDraft, /Nubank/);
  assert.match(result.responseDraft, /Nu Empresas/);
});

test('categoria ambígua pergunta, nunca escolhe sozinho', () => {
  const snapshot = buildFinancialSnapshot({
    accounts: ACCOUNTS,
    categories: [
      { id: 'c1', name: 'Alimentação Casa', is_active: true },
      { id: 'c2', name: 'Alimentação Trabalho', is_active: true },
    ],
    transactions: TRANSACTIONS,
    accountBalances: [],
    referenceDate: REFERENCE_DATE,
  });
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({ intent: 'income_by_category', entities: { ...baseInterpretation().entities, category: 'Alimentação' } }),
    snapshot,
  });
  assert.equal(result.status, 'needs_clarification');
});

test('conta inexistente nunca é inventada -- capacidade responde honestamente com 0/vazio', () => {
  const snapshot = buildSnapshot();
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({ intent: 'income_by_account', entities: { ...baseInterpretation().entities, account: 'Banco XP' } }),
    snapshot,
  });
  assert.equal(result.status, 'handled');
  assert.equal(result.structuredResult.income, 0);
});

// Sprint 4 Ciclo 3 (Bloco 4.5): "mês passado" agora tem suporte real --
// não fica mais preso ao mês atual.
test('período reconhecido diferente do mês atual (ex.: "mês passado") agora é executado de verdade, não mais recusado', () => {
  const snapshot = buildSnapshot();
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({ intent: 'financial_summary', entities: { ...baseInterpretation().entities, period: 'mês passado' } }),
    snapshot,
  });
  assert.equal(result.status, 'handled');
});

test('período com texto sem sentido temporal pede esclarecimento honesto, nunca inventa um intervalo', () => {
  const snapshot = buildSnapshot();
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({ intent: 'financial_summary', entities: { ...baseInterpretation().entities, period: 'xablau total' } }),
    snapshot,
  });
  assert.equal(result.status, 'needs_clarification');
});

// ── Escrita nunca executada aqui ────────────────────────────────────────

test('intenção de escrita (create_expense) nunca é executada pelo orquestrador -- cai em fallback', () => {
  const snapshot = buildSnapshot();
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({ intent: 'create_expense', entities: { ...baseInterpretation().entities, amount: 50 } }),
    snapshot,
  });
  assert.equal(result.status, 'fallback');
  assert.equal(result.structuredResult, null);
});

// ── Capacidade não conectada ─────────────────────────────────────────────

test('intenção reconhecida mas sem capacidade conectada nunca é anunciada como suportada -- unsupported honesto', () => {
  const snapshot = buildSnapshot();
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({ intent: 'period_detail' }),
    snapshot,
  });
  assert.equal(result.status, 'unsupported');
});

// ── Consultas compostas (Bloco 4.2.5) ────────────────────────────────────

test('consulta composta ("quanto gastei e minha maior despesa") resolve as duas partes e separa a resposta', () => {
  const snapshot = buildSnapshot();
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({
      intent: 'total_expenses',
      isCompound: true,
      subIntents: [
        { intent: 'total_expenses', entities: { period: 'este mês' } },
        { intent: 'top_expenses', entities: {} },
      ],
    }),
    snapshot,
  });
  assert.equal(result.status, 'handled');
  assert.equal(result.executionPlan.type, 'compound');
  assert.equal(result.executionPlan.steps.length, 2);
  assert.ok(result.structuredResult.parts.length === 2);
});

test('consulta composta com falha parcial preserva o resultado que deu certo', () => {
  const snapshot = buildSnapshot();
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({
      isCompound: true,
      subIntents: [
        { intent: 'total_expenses', entities: { period: 'este mês' } },
        { intent: 'period_detail', entities: {} }, // não conectada -> unsupported
      ],
    }),
    snapshot,
  });
  assert.equal(result.status, 'handled');
  assert.equal(result.structuredResult.parts.length, 1);
  assert.equal(result.structuredResult.parts[0].intent, 'total_expenses');
});

test('consulta composta sem nenhum subIntent resolvido cai em fallback, nunca finge sucesso', () => {
  const snapshot = buildSnapshot();
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({
      isCompound: true,
      subIntents: [{ intent: 'period_detail', entities: {} }],
    }),
    snapshot,
  });
  assert.equal(result.status, 'fallback');
});

test('consulta composta nunca inclui escrita silenciosamente -- subIntent de escrita é descartado', () => {
  const snapshot = buildSnapshot();
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({
      isCompound: true,
      subIntents: [
        { intent: 'total_expenses', entities: { period: 'este mês' } },
        { intent: 'create_expense', entities: { amount: 999 } },
      ],
    }),
    snapshot,
  });
  assert.equal(result.status, 'handled');
  assert.equal(result.structuredResult.parts.length, 1);
  assert.ok(!result.structuredResult.parts.some((p) => p.intent === 'create_expense'));
});

test('máximo seguro de sub-consultas por turno é respeitado mesmo se mais vierem', () => {
  const snapshot = buildSnapshot();
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({
      isCompound: true,
      subIntents: [
        { intent: 'total_expenses', entities: { period: 'este mês' } },
        { intent: 'top_expenses', entities: {} },
        { intent: 'total_balance', entities: {} },
        { intent: 'recent_transactions', entities: {} },
      ],
    }),
    snapshot,
  });
  assert.ok(result.executionPlan.steps.length <= MAX_ORCHESTRATOR_SUB_INTENTS);
});

test('sub-consultas duplicadas (mesma intenção e entidades) não são executadas duas vezes', () => {
  const snapshot = buildSnapshot();
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({
      isCompound: true,
      subIntents: [
        { intent: 'total_expenses', entities: { period: 'este mês' } },
        { intent: 'total_expenses', entities: { period: 'este mês' } },
      ],
    }),
    snapshot,
  });
  assert.equal(result.executionPlan.steps.length, 1);
});

// ── Catálogo de capacidades ───────────────────────────────────────────

test('catálogo enviado à LLM só contém capacidades realmente registradas', () => {
  const catalog = buildOrchestratorCapabilityCatalog();
  assert.ok(catalog.length > 0);
  assert.ok(catalog.every((c) => typeof c.id === 'string' && typeof c.description === 'string'));
});

// ── Rastreabilidade numérica ──────────────────────────────────────────

test('todo número na resposta é rastreável ao snapshot real -- nunca aparece um valor que não está nos dados', () => {
  const snapshot = buildSnapshot();
  const result = runFinancialSemanticOrchestrator({
    interpretation: baseInterpretation({ intent: 'financial_summary' }),
    snapshot,
  });
  assert.equal(result.structuredResult.income, snapshot.monthlyIncome);
  assert.equal(result.structuredResult.expenses, snapshot.monthlyExpense);
  assert.equal(result.structuredResult.result, snapshot.monthlyResult);
});
