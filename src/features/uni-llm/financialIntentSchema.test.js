// Sprint 3 (Interpretação Semântica): validador puro do contrato de
// interpretação de intenção financeira.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isFinancialIntentReadType,
  isFinancialIntentWriteType,
  validateFinancialIntentResponse,
} from './financialIntentSchema.js';

const VALID_BASE = {
  status: 'resolved',
  intent: 'total_expenses',
  confidence: 0.9,
  entities: {
    transactionType: null,
    amount: null,
    account: null,
    category: null,
    description: null,
    period: 'este mês',
    comparisonPeriod: null,
  },
  suggestedTool: null,
  clarificationQuestion: null,
  reasoningTags: ['expense_query', 'relative_period'],
};

test('JSON válido dentro do contrato é aceito e normalizado', () => {
  const result = validateFinancialIntentResponse(VALID_BASE);
  assert.equal(result.valid, true);
  assert.equal(result.interpretation.status, 'resolved');
  assert.equal(result.interpretation.intent, 'total_expenses');
  assert.equal(result.interpretation.entities.period, 'este mês');
  assert.deepEqual(result.interpretation.reasoningTags, ['expense_query', 'relative_period']);
});

test('nulo, vazio, string ou array nunca são aceitos -- fallback seguro', () => {
  for (const bad of [null, undefined, '', 'texto solto', [], 42, {}]) {
    const result = validateFinancialIntentResponse(bad);
    assert.equal(result.valid, false);
  }
});

test('status fora do enum é rejeitado', () => {
  const result = validateFinancialIntentResponse({ ...VALID_BASE, status: 'done' });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'invalid_status');
});

test('intent fora da allowlist é rejeitado -- nunca inventa uma intenção nova', () => {
  const result = validateFinancialIntentResponse({ ...VALID_BASE, intent: 'delete_everything' });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'invalid_intent');
});

test('intent null é aceito (ex.: not_financial pode vir sem intent específico)', () => {
  const result = validateFinancialIntentResponse({ ...VALID_BASE, status: 'not_financial', intent: null });
  assert.equal(result.valid, true);
  assert.equal(result.interpretation.intent, null);
});

test('confidence fora de [0,1] é rejeitado', () => {
  assert.equal(validateFinancialIntentResponse({ ...VALID_BASE, confidence: 1.5 }).valid, false);
  assert.equal(validateFinancialIntentResponse({ ...VALID_BASE, confidence: -0.1 }).valid, false);
  assert.equal(validateFinancialIntentResponse({ ...VALID_BASE, confidence: 'alta' }).valid, false);
});

test('needs_clarification sem clarificationQuestion é rejeitado', () => {
  const result = validateFinancialIntentResponse({
    ...VALID_BASE,
    status: 'needs_clarification',
    clarificationQuestion: null,
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'missing_clarification_question');
});

test('needs_clarification com pergunta curta é aceito', () => {
  const result = validateFinancialIntentResponse({
    ...VALID_BASE,
    status: 'needs_clarification',
    clarificationQuestion: 'Você quer saber o total gasto neste mês ou apenas os gastos da conta Nubank?',
  });
  assert.equal(result.valid, true);
  assert.match(result.interpretation.clarificationQuestion, /Nubank/);
});

test('suggestedTool fora da allowlist vira null, nunca é aceito como veio', () => {
  const result = validateFinancialIntentResponse({ ...VALID_BASE, suggestedTool: 'delete_account' });
  assert.equal(result.valid, true);
  assert.equal(result.interpretation.suggestedTool, null);
});

test('suggestedTool válido é preservado', () => {
  const result = validateFinancialIntentResponse({ ...VALID_BASE, suggestedTool: 'get_financial_summary' });
  assert.equal(result.interpretation.suggestedTool, 'get_financial_summary');
});

test('reasoningTags: só marcadores curtos e seguros sobrevivem -- frases longas (chain of thought disfarçado) são descartadas', () => {
  const result = validateFinancialIntentResponse({
    ...VALID_BASE,
    reasoningTags: [
      'expense_query',
      'Isso é uma explicação longa demais para ser um marcador seguro',
      'ambiguous_category',
      'a'.repeat(100),
      123,
      null,
    ],
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.interpretation.reasoningTags, ['expense_query', 'ambiguous_category']);
});

test('reasoningTags limitado a 6 marcadores', () => {
  const tags = Array.from({ length: 20 }, (_, i) => `tag_${i}`);
  const result = validateFinancialIntentResponse({ ...VALID_BASE, reasoningTags: tags });
  assert.equal(result.interpretation.reasoningTags.length, 6);
});

test('entities.amount só aceita número positivo -- zero/negativo/não numérico vira null', () => {
  for (const bad of [0, -50, 'cinquenta', NaN]) {
    const result = validateFinancialIntentResponse({
      ...VALID_BASE,
      entities: { ...VALID_BASE.entities, amount: bad },
    });
    assert.equal(result.interpretation.entities.amount, null, `amount=${bad} deveria virar null`);
  }
  const okResult = validateFinancialIntentResponse({
    ...VALID_BASE,
    entities: { ...VALID_BASE.entities, amount: 50 },
  });
  assert.equal(okResult.interpretation.entities.amount, 50);
});

test('entities.transactionType só aceita expense/income/transfer', () => {
  const result = validateFinancialIntentResponse({
    ...VALID_BASE,
    entities: { ...VALID_BASE.entities, transactionType: 'invalid' },
  });
  assert.equal(result.interpretation.entities.transactionType, null);
});

test('entities.account/category nunca são confiados como conta/categoria real -- só texto livre curto', () => {
  const result = validateFinancialIntentResponse({
    ...VALID_BASE,
    entities: { ...VALID_BASE.entities, account: 'Nu', category: 'mercado' },
  });
  assert.equal(result.interpretation.entities.account, 'Nu');
  assert.equal(result.interpretation.entities.category, 'mercado');
});

test('isFinancialIntentReadType / isFinancialIntentWriteType classificam corretamente e nunca se sobrepõem', () => {
  assert.equal(isFinancialIntentReadType('total_expenses'), true);
  assert.equal(isFinancialIntentWriteType('total_expenses'), false);
  assert.equal(isFinancialIntentWriteType('create_expense'), true);
  assert.equal(isFinancialIntentReadType('create_expense'), false);
  assert.equal(isFinancialIntentReadType('not_financial'), false);
  assert.equal(isFinancialIntentWriteType('not_financial'), false);
});

test('interpretação devolvida é congelada (nunca mutável por engano)', () => {
  const result = validateFinancialIntentResponse(VALID_BASE);
  assert.equal(Object.isFrozen(result.interpretation), true);
  assert.equal(Object.isFrozen(result.interpretation.entities), true);
  assert.equal(Object.isFrozen(result.interpretation.reasoningTags), true);
});

// ── Sprint 4 (Bloco 4.2.1): extensão aditiva -- isCompound/subIntents/
// requestedCapabilities/operation. Retrocompatibilidade é a garantia
// central: os 17 testes acima continuam passando sem nenhuma mudança. ──

test('ausência dos campos novos cai em defaults seguros (retrocompatibilidade total com a Sprint 3)', () => {
  const result = validateFinancialIntentResponse(VALID_BASE);
  assert.equal(result.interpretation.isCompound, false);
  assert.deepEqual(result.interpretation.subIntents, []);
  assert.deepEqual(result.interpretation.requestedCapabilities, []);
  assert.equal(result.interpretation.operation, null);
});

test('operation fora do enum vira null, nunca é aceito como veio', () => {
  const result = validateFinancialIntentResponse({ ...VALID_BASE, operation: 'delete' });
  assert.equal(result.interpretation.operation, null);
});

test('operation válida é preservada', () => {
  const result = validateFinancialIntentResponse({ ...VALID_BASE, operation: 'compare' });
  assert.equal(result.interpretation.operation, 'compare');
});

test('isCompound=true com subIntents válidos é aceito e normalizado', () => {
  const result = validateFinancialIntentResponse({
    ...VALID_BASE,
    isCompound: true,
    subIntents: [
      { intent: 'total_expenses', entities: { period: 'este mês' } },
      { intent: 'top_expenses', entities: { period: 'este mês' } },
    ],
  });
  assert.equal(result.valid, true);
  assert.equal(result.interpretation.isCompound, true);
  assert.equal(result.interpretation.subIntents.length, 2);
  assert.equal(result.interpretation.subIntents[0].intent, 'total_expenses');
  assert.equal(result.interpretation.subIntents[0].entities.period, 'este mês');
});

test('subIntents é limitado a um máximo seguro (3), excesso é descartado sem rejeitar a interpretação inteira', () => {
  const result = validateFinancialIntentResponse({
    ...VALID_BASE,
    isCompound: true,
    subIntents: [
      { intent: 'total_expenses' },
      { intent: 'top_expenses' },
      { intent: 'account_balance' },
      { intent: 'total_income' },
      { intent: 'recent_transactions' },
    ],
  });
  assert.equal(result.interpretation.subIntents.length, 3);
});

test('subIntent com intent inválida é descartado silenciosamente -- falha parcial nunca invalida os demais', () => {
  const result = validateFinancialIntentResponse({
    ...VALID_BASE,
    isCompound: true,
    subIntents: [
      { intent: 'total_expenses' },
      { intent: 'inventar_intencao_nova' },
      { intent: 'top_expenses' },
    ],
  });
  assert.equal(result.interpretation.subIntents.length, 2);
  assert.deepEqual(result.interpretation.subIntents.map((s) => s.intent), ['total_expenses', 'top_expenses']);
});

test('subIntents nunca são aninhados -- um subIntent não pode ter subIntents dentro dele', () => {
  const result = validateFinancialIntentResponse({
    ...VALID_BASE,
    isCompound: true,
    subIntents: [{ intent: 'total_expenses', subIntents: [{ intent: 'top_expenses' }] }],
  });
  assert.equal(Object.prototype.hasOwnProperty.call(result.interpretation.subIntents[0], 'subIntents'), false);
});

test('isCompound=true sem nenhum subIntent válido normaliza para isCompound=false', () => {
  const result = validateFinancialIntentResponse({
    ...VALID_BASE,
    isCompound: true,
    subIntents: [{ intent: 'inexistente' }],
  });
  assert.equal(result.interpretation.isCompound, false);
  assert.deepEqual(result.interpretation.subIntents, []);
});

test('requestedCapabilities aceita só strings em formato seguro (snake_case curto), limitado a 5', () => {
  const result = validateFinancialIntentResponse({
    ...VALID_BASE,
    requestedCapabilities: ['top_expenses', 'INVALID CAP!', 'a'.repeat(100), 'recent_transactions', 'x', 'y', 'z', 'w'],
  });
  assert.ok(result.interpretation.requestedCapabilities.length <= 5);
  assert.ok(result.interpretation.requestedCapabilities.includes('top_expenses'));
  assert.ok(result.interpretation.requestedCapabilities.includes('recent_transactions'));
  assert.ok(!result.interpretation.requestedCapabilities.includes('INVALID CAP!'));
});

test('payload exagerado (centenas de subIntents) nunca trava a validação nem excede o limite', () => {
  const hugeSubIntents = Array.from({ length: 500 }, () => ({ intent: 'total_expenses' }));
  const start = Date.now();
  const result = validateFinancialIntentResponse({ ...VALID_BASE, isCompound: true, subIntents: hugeSubIntents });
  assert.ok(Date.now() - start < 100, 'validação deve ser rápida mesmo com payload exagerado');
  assert.equal(result.interpretation.subIntents.length, 3);
});

test('subIntents e requestedCapabilities vêm congelados (imutáveis)', () => {
  const result = validateFinancialIntentResponse({
    ...VALID_BASE,
    isCompound: true,
    subIntents: [{ intent: 'total_expenses' }],
    requestedCapabilities: ['top_expenses'],
  });
  assert.equal(Object.isFrozen(result.interpretation.subIntents), true);
  assert.equal(Object.isFrozen(result.interpretation.subIntents[0]), true);
  assert.equal(Object.isFrozen(result.interpretation.requestedCapabilities), true);
});
