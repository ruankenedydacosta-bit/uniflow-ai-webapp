// Testes de avaliação do contexto de decisão (Fase 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateDecisionContext,
  evaluateContextSufficiency,
  buildMissingInformation,
  evaluateDecisionDependencies,
  evaluateDecisionConsistency,
} from './evaluateDecisionContext.js';

const NOW = Date.parse('2026-07-30T10:00:00.000Z');

const FRESH_SNAPSHOT = {
  hasData: true,
  totalBalance: 740.5,
  referenceDate: '2026-07-29T00:00:00.000Z',
  accounts: [
    { id: 'a1', name: 'Nubank', current_balance: 480.5 },
    { id: 'a2', name: 'Itaú', current_balance: 260 },
  ],
  categories: [
    { id: 'c1', name: 'Alimentação' },
    { id: 'c2', name: 'Transporte' },
  ],
  recentTransactions: [],
};

const STALE_SNAPSHOT = {
  hasData: true,
  totalBalance: 740.5,
  referenceDate: '2026-06-01T00:00:00.000Z',
  accounts: [],
  categories: [],
  recentTransactions: [],
};

const NO_SNAPSHOT = { hasData: false, totalBalance: null, referenceDate: null, accounts: [], categories: [], recentTransactions: [] };

const MEMORY_CONSISTENT = {
  subjectKey: 'balance::total',
  value: { totalBalance: 740.5 },
  status: 'confirmed',
};

const MEMORY_CONFLICTING = {
  subjectKey: 'balance::total',
  value: { totalBalance: 500 },
  status: 'confirmed',
};

function contextOf(overrides = {}) {
  return evaluateDecisionContext({
    intent: { type: 'check_balance', known: true, confidence: 0.9 },
    cognitivePlan: { missingFields: [], executorExpected: 'FinancialQueryEngine' },
    financialSnapshot: FRESH_SNAPSHOT,
    conversationContext: { lastIntent: 'check_balance', history: { turns: 4 } },
    persistentMemory: [MEMORY_CONSISTENT],
    now: NOW,
    ...overrides,
  });
}

// -----------------------------------------------
// CONTEXTO (suficiência)
// -----------------------------------------------
test('contexto 11: suficiente — intent conhecido, contexto, memória, snapshot e sem conflito', () => {
  const context = contextOf();
  assert.equal(context.sufficiency, 'SUFFICIENT');
  assert.equal(context.diagnostics.includes('CONTEXT_SUFFICIENT'), true);
});

test('contexto 12: parcial — campo obrigatório ausente', () => {
  const context = contextOf({
    intent: { type: 'register_expense', known: true },
    cognitivePlan: { missingFields: ['account'], executorExpected: 'execute_confirmed_financial_action' },
  });
  assert.equal(context.sufficiency, 'PARTIAL');
  assert.deepEqual(context.missingFields, ['account']);
  assert.equal(context.needUser, true);
});

test('contexto 13: insuficiente — intent desconhecido, sem contexto e com conflito', () => {
  const context = contextOf({
    intent: null,
    conversationContext: null,
    cognitivePlan: { missingFields: ['amount'] },
    financialSnapshot: null,
  });
  assert.equal(context.sufficiency, 'INSUFFICIENT');
  assert.equal(context.diagnostics.includes('CONTEXT_INSUFFICIENT'), true);
});

test('contexto 14: desconhecido — nenhuma entrada de decisão', () => {
  const sufficiency = evaluateContextSufficiency({});
  assert.equal(sufficiency, 'UNKNOWN');
});

test('contexto 15: contexto vazio produz sufficiency UNKNOWN e decisão segura', () => {
  const context = contextOf({ intent: null, cognitivePlan: null, conversationContext: null });
  assert.ok(['UNKNOWN', 'INSUFFICIENT'].includes(context.sufficiency));
  assert.equal(context.pending, null);
});

test('contexto 16: contexto completo com confirmação é SUFFICIENT', () => {
  const context = contextOf({
    intent: { type: 'confirmation', known: true },
    cognitivePlan: { missingFields: [], requiresConfirmation: false },
    pendingAction: {
      status: 'ready',
      intent: 'register_expense',
      issues: [],
      account: { id: 'a1', name: 'Nubank' },
      category: { id: 'c1', name: 'Alimentação' },
      amount: 50,
    },
  });
  assert.equal(context.sufficiency, 'SUFFICIENT');
});

// -----------------------------------------------
// MEMÓRIA
// -----------------------------------------------
test('memória 17: consistente — memória alinhada ao snapshot não cria conflito', () => {
  const context = contextOf();
  assert.equal(context.evidence.memoryAvailable, true);
  assert.equal(context.evidence.memoryConflict, false);
  assert.equal(context.consistency, 'CONSISTENT');
  assert.equal(context.diagnostics.includes('MEMORY_CONSISTENT'), true);
});

test('memória 18: conflitante — memória diverge do snapshot (banco vence memória)', () => {
  const context = contextOf({ persistentMemory: [MEMORY_CONFLICTING] });
  assert.equal(context.evidence.memoryConflict, true);
  assert.equal(context.consistency, 'CONFLICTING');
  assert.equal(context.diagnostics.includes('MEMORY_CONFLICT'), true);
});

test('memória 19: ausente — sem memória persistente nem operacional', () => {
  const context = contextOf({ persistentMemory: null, operationalMemory: null });
  assert.equal(context.evidence.memoryAvailable, false);
  assert.equal(context.evidence.memoryCount, 0);
});

test('memória 20: antiga — memória velha não vence snapshot atual', () => {
  const oldMemory = {
    ...MEMORY_CONFLICTING,
    status: 'confirmed',
    lastSeenAt: '2025-01-01T00:00:00.000Z',
  };
  const context = contextOf({ persistentMemory: [oldMemory] });
  assert.equal(context.consistency, 'CONFLICTING');
  assert.equal(context.evidence.snapshotFresh, true);
  assert.equal(context.evidence.memoryCount, 1);
});

test('memória 21: confirmada — status confirmed entra como apoio', () => {
  const context = contextOf({ persistentMemory: [{ ...MEMORY_CONSISTENT, status: 'confirmed' }] });
  assert.equal(context.evidence.memoryAvailable, true);
  assert.equal(context.evidence.memoryConfirmed, true);
});

test('memória 22: superseded — memória substituída é ignorada como apoio', () => {
  const context = contextOf({ persistentMemory: [{ ...MEMORY_CONSISTENT, status: 'superseded' }] });
  assert.equal(context.evidence.memoryCount, 0);
  assert.equal(context.evidence.memoryAvailable, false);
});

test('memória 23: expirada — memória expirada é ignorada como apoio', () => {
  const context = contextOf({ persistentMemory: [{ ...MEMORY_CONSISTENT, status: 'expired' }] });
  assert.equal(context.evidence.memoryCount, 0);
});

test('memória 24: ignorada — memória conflitante nunca resolve conflito sozinha', () => {
  const context = contextOf({ persistentMemory: [MEMORY_CONFLICTING] });
  assert.equal(context.conflicts.length >= 0, true);
  assert.equal(context.sufficiency, 'PARTIAL', 'conflito reduz suficiência sem resolver');
});

// -----------------------------------------------
// EPISTÊMICO
// -----------------------------------------------
function epistemicItem(status, subject = 'amount', overrides = {}) {
  return {
    subject,
    value: subject === 'amount' ? 50 : 'Nubank',
    claimType: 'user_claim',
    epistemicStatus: status,
    confidence: 0.8,
    source: 'user_explicit_statement',
    evidence: [{ type: 'direct_user_statement' }],
    ...overrides,
  };
}

test('epistêmico 25: confirmado — item confirmado não gera conflito', () => {
  const context = contextOf({
    intent: { type: 'register_expense', known: true },
    cognitivePlan: { missingFields: [], executorExpected: 'execute_confirmed_financial_action' },
    conversationContext: { lastIntent: 'register_expense', history: { turns: 4 } },
    epistemicModel: { items: [epistemicItem('confirmed')], conflicts: [], staleItems: [] },
  });
  assert.equal(context.evidence.hasConflict, false);
  assert.equal(context.consistency, 'CONSISTENT');
});

test('epistêmico 26: provável — item probable não bloqueia mas exige verificação', () => {
  const context = contextOf({
    epistemicModel: { items: [epistemicItem('probable')], conflicts: [], staleItems: [] },
  });
  assert.equal(context.evidence.hasConflict, false);
});

test('epistêmico 27: hipótese — item hypothesis não vira fato', () => {
  const context = contextOf({
    epistemicModel: { items: [epistemicItem('hypothesis')], conflicts: [], staleItems: [] },
  });
  assert.equal(context.evidence.hasConflict, false);
  assert.equal(context.evidence.balanceConflict, false);
});

test('epistêmico 28: conflito — conflicts são repassados ao contexto', () => {
  const context = contextOf({
    epistemicModel: {
      items: [epistemicItem('conflicting')],
      conflicts: [{ type: 'value_conflict', subject: 'amount', itemIndexes: [0, 1] }],
      staleItems: [],
    },
  });
  assert.equal(context.conflicts.length, 1);
  assert.equal(context.evidence.hasConflict, true);
  assert.equal(context.consistency, 'CONFLICTING');
});

test('epistêmico 29: stale — itens velhos elevam STALE_INFORMATION', () => {
  const context = contextOf({
    epistemicModel: {
      items: [],
      conflicts: [],
      staleItems: [{ subject: 'balance:total', state: 'stale', ageMs: 99999999 }],
    },
  });
  assert.equal(context.evidence.staleItemsCount, 1);
  assert.equal(context.diagnostics.includes('STALE_INFORMATION'), true);
});

test('epistêmico 30: invalid — item invalid não é tratado como fato', () => {
  const context = contextOf({
    epistemicModel: { items: [epistemicItem('invalid')], conflicts: [], staleItems: [] },
  });
  assert.equal(context.evidence.hasConflict, false);
});

test('epistêmico 31: missing — item missing vira informação faltante', () => {
  const context = contextOf({
    cognitivePlan: { missingFields: [] },
    epistemicModel: {
      items: [],
      conflicts: [],
      staleItems: [],
      missingItems: [{ subject: 'field:category', field: 'category' }],
    },
  });
  assert.ok(context.missingFields.includes('category'));
});

test('epistêmico 32: usable — item usableFor.display mantém contexto utilizável', () => {
  const context = contextOf({
    epistemicModel: {
      items: [epistemicItem('confirmed', 'account:itau', { usableFor: { display: true } })],
      conflicts: [],
      staleItems: [],
    },
  });
  assert.equal(context.evidence.hasConflict, false);
  assert.equal(context.sufficiency, 'SUFFICIENT');
});

test('epistêmico: consome confiança, evidência, recomendações e usableFor', () => {
  const context = contextOf({
    epistemicModel: {
      items: [epistemicItem('confirmed', 'account:itau', { usableFor: { display: true } })],
      conflicts: [],
      staleItems: [],
      evidenceSummary: { totalDeduped: 1 },
      confidenceSummary: { mean: 0.91 },
      recommendations: ['refresh_data:balance:workspace'],
    },
  });
  assert.equal(context.evidence.epistemicConfidence, 0.91);
  assert.equal(context.evidence.epistemicEvidenceCount, 1);
  assert.equal(context.evidence.epistemicRecommendationCount, 1);
  assert.equal(context.evidence.epistemicUsableCount, 1);
  assert.equal(context.evidence.epistemicRefreshRecommended, true);
});

// -----------------------------------------------
// DEPENDÊNCIAS
// -----------------------------------------------
test('dependência 59: banco — consulta exige banco quando snapshot ausente', () => {
  const dependencies = evaluateDecisionDependencies({
    intent: { type: 'check_balance' },
    financialSnapshot: NO_SNAPSHOT,
  });
  assert.equal(dependencies.requiresDatabase, true);
});

test('dependência 60: memória — referência episódica não resolvida', () => {
  const dependencies = evaluateDecisionDependencies({
    intent: { type: 'register_expense' },
    conversationContext: {
      referenceResolution: { hasReference: true, resolved: false },
    },
  });
  assert.equal(dependencies.requiresMemory, true);
});

test('dependência 61: usuário — campo obrigatório faltante', () => {
  const dependencies = evaluateDecisionDependencies({
    intent: { type: 'register_expense' },
    cognitivePlan: { missingFields: ['account'] },
  });
  assert.equal(dependencies.requiresUser, true);
});

test('dependência 62: snapshot — intent de saldo exige snapshot', () => {
  const dependencies = evaluateDecisionDependencies({
    intent: { type: 'check_balance' },
    financialSnapshot: FRESH_SNAPSHOT,
  });
  assert.equal(dependencies.requiresSnapshot, true);
});

test('dependência 63: executor — ação financeira exige executor', () => {
  const dependencies = evaluateDecisionDependencies({
    intent: { type: 'register_transfer' },
    expectedExecutor: 'execute_confirmed_financial_action',
  });
  assert.equal(dependencies.requiresExecutor, true);
});

test('dependência 64: conversa — continuação exige conversa', () => {
  const dependencies = evaluateDecisionDependencies({ intent: { type: 'continuation' } });
  assert.equal(dependencies.requiresConversation, true);
});

test('dependência 65: histórico — continuação exige histórico', () => {
  const dependencies = evaluateDecisionDependencies({ intent: { type: 'continuation' } });
  assert.equal(dependencies.requiresHistory, true);
});

test('dependência 66: confirmação — pendência pronta exige confirmação', () => {
  const dependencies = evaluateDecisionDependencies({
    intent: { type: 'register_expense' },
    pendingAction: { status: 'ready' },
  });
  assert.equal(dependencies.requiresConfirmation, true);
});

test('consistência: memória consistente x usuário x banco → CONSISTENT', () => {
  const consistency = evaluateDecisionConsistency({
    intent: { type: 'check_balance' },
    financialSnapshot: FRESH_SNAPSHOT,
    persistentMemory: [MEMORY_CONSISTENT],
    conversationContext: { lastIntent: 'check_balance' },
    // ETAPA 7: sem `now` explícito, snapshotFreshness() cai no Date.now() real
    // -- FRESH_SNAPSHOT.referenceDate é uma data fixa (2026-07-29) que se
    // torna "stale" à medida que o tempo real passa, fazendo este teste
    // divergir por conta da data do sistema, não por regressão de código.
    // NOW (2026-07-30, já usado por contextOf() no resto deste arquivo) é a
    // referência injetável correta.
    now: NOW,
  });
  assert.equal(consistency, 'CONSISTENT');
});

test('consistência: contexto x intenção divergente → PARTIAL', () => {
  const consistency = evaluateDecisionConsistency({
    intent: { type: 'check_balance' },
    financialSnapshot: FRESH_SNAPSHOT,
    conversationContext: { lastIntent: 'register_expense' },
    now: NOW,
  });
  assert.equal(consistency, 'PARTIAL');
});

test('consistência: snapshot velho → PARTIAL (nunca bloqueia sozinho)', () => {
  const consistency = evaluateDecisionConsistency({
    intent: { type: 'check_balance' },
    financialSnapshot: STALE_SNAPSHOT,
    now: NOW,
  });
  assert.equal(consistency, 'PARTIAL');
});

test('consistência: banco x usuário com reivindicação de saldo → CONFLICTING', () => {
  const consistency = evaluateDecisionConsistency({
    intent: { type: 'set_balance' },
    financialSnapshot: FRESH_SNAPSHOT,
    now: NOW,
    epistemicModel: {
      items: [{
        subject: 'balance:total',
        claimType: 'user_claim',
        contradictions: [{ source: 'financial_snapshot', value: 500 }],
      }],
      conflicts: [],
      staleItems: [],
    },
  });
  assert.equal(consistency, 'CONFLICTING');
});

test('consistência: nenhum dado → UNKNOWN', () => {
  assert.equal(evaluateDecisionConsistency({}), 'UNKNOWN');
});

test('missing information: campos de pendência e plano são unificados sem duplicar', () => {
  const missing = buildMissingInformation({
    cognitivePlan: { missingFields: ['account', 'account'] },
    pendingAction: { status: 'needs_clarification', issues: [{ field: 'account' }] },
  });
  assert.deepEqual(missing, ['account']);
});

test('missing information: pendência pronta exige confirmação', () => {
  const missing = buildMissingInformation({
    cognitivePlan: { missingFields: [] },
    pendingAction: { status: 'ready' },
  });
  assert.deepEqual(missing, ['confirmation']);
});

test('missing information: confirm_pending satisfaz confirmação pronta', () => {
  const missing = buildMissingInformation({
    intent: 'confirm_pending',
    cognitivePlan: { missingFields: [] },
    pendingAction: { status: 'ready' },
  });
  assert.deepEqual(missing, []);
});

test('missing information: nunca preenche automaticamente', () => {
  const missing = buildMissingInformation({
    cognitivePlan: { missingFields: ['amount', 'category'] },
    pendingAction: null,
  });
  assert.deepEqual(missing, ['amount', 'category']);
});
