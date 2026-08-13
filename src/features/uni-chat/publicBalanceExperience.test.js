import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildPublicMovementSummaryResponse,
  containsForbiddenPublicBalanceNarrative,
  enforcePublicFinancialResponsePolicy,
  isPublicFinancialSummaryRequest,
  isRetiredPublicBalanceRequest,
  PUBLIC_BALANCE_RETIREMENT_TEXT,
  resolvePublicFinancialPeriod,
} from './publicBalanceExperience.js';
import { buildFinancialSnapshot } from './financialSnapshot.js';
import { SUGGESTIONS_PESSOAL } from './mockData.js';

test('consultas públicas de saldo são interceptadas sem retornar valor', () => {
  for (const text of [
    'Qual meu saldo?',
    'Quanto tenho?',
    'Ver meu saldo',
    'Quanto dinheiro tenho?',
    'Bom dia, qual meu saldo?',
  ]) {
    assert.equal(isRetiredPublicBalanceRequest(text), true, text);
  }
  assert.match(PUBLIC_BALANCE_RETIREMENT_TEXT, /Entradas e Saídas/);
  assert.doesNotMatch(PUBLIC_BALANCE_RETIREMENT_TEXT, /R\$|\d[.,]\d/);
});

test('intents internos de saldo são descontinuados somente na porta pública', () => {
  assert.equal(isRetiredPublicBalanceRequest('consulta', 'check_balance'), true);
  assert.equal(isRetiredPublicBalanceRequest('ajuste', 'set_balance'), true);
  assert.equal(isRetiredPublicBalanceRequest('Tenho R$ 1.000', 'ambiguous_balance_or_income'), true);
});

test('Entradas e Saídas não são interceptadas', () => {
  for (const text of [
    'Recebi 1000 reais de um cliente',
    'Entrou 500 reais',
    'Gastei 200 reais no mercado',
    'Paguei 50 reais de gasolina',
  ]) {
    assert.equal(isRetiredPublicBalanceRequest(text), false, text);
  }
  assert.equal(
    isRetiredPublicBalanceRequest('Agenda uma reunião sobre saldo amanhã', 'agenda_create'),
    false,
  );
});

function snapshotWithLegacyBalance(transactions = []) {
  return buildFinancialSnapshot({
    accounts: [{ id: 'legacy', name: 'Conta antiga', initial_balance: 50000, current_balance: 16624 }],
    workspaceBalance: 16624,
    transactions,
    referenceDate: '2026-08-13',
  });
}

const MOVEMENTS = [
  { id: 'i1', transaction_type: 'income', amount: 2000, transaction_date: '2026-08-02', status: 'confirmed' },
  { id: 'i2', transaction_type: 'income', amount: 500, transaction_date: '2026-08-05', status: 'confirmed' },
  { id: 'e1', transaction_type: 'expense', amount: 320, transaction_date: '2026-08-07', status: 'confirmed' },
  { id: 'e2', transaction_type: 'expense', amount: 1000, transaction_date: '2026-08-09', status: 'confirmed' },
  { id: 'old', transaction_type: 'expense', amount: 99, transaction_date: '2026-07-10', status: 'confirmed' },
];

test('perguntas financeiras genéricas são reconhecidas antes de conversa comum', () => {
  for (const text of [
    'Me fala sobre meu dinheiro',
    'Boa tarde, Uni. Pode me falar mais sobre o meu dinheiro?',
    'Como estão minhas finanças?',
    'Como estou financeiramente?',
    'Faz um resumo financeiro',
    'Como estão minhas movimentações?',
    'Quanto entrou e quanto saiu?',
    'Como foi meu mês?',
  ]) {
    assert.equal(isPublicFinancialSummaryRequest(text), true, text);
  }
});

test('menção a Entrada e Saída em uma ação não é confundida com pedido de resumo', () => {
  for (const text of [
    'Registra uma entrada de 100 e uma saída de 50',
    'Quero lançar uma entrada e depois uma saída',
  ]) {
    assert.equal(isPublicFinancialSummaryRequest(text), false, text);
  }
});

test('resumo público contém apenas quantidades e totais de Entradas/Saídas', () => {
  const response = buildPublicMovementSummaryResponse({
    snapshot: snapshotWithLegacyBalance(MOVEMENTS),
    text: 'Como estão minhas finanças?',
  });
  assert.equal(response.data.incomeCount, 2);
  assert.equal(response.data.expenseCount, 2);
  assert.equal(response.data.income, 2500);
  assert.equal(response.data.expenses, 1320);
  assert.match(response.text, /2 entradas/);
  assert.match(response.text, /2 saídas/);
  assert.match(response.text, /2\.500,00/);
  assert.match(response.text, /1\.320,00/);
  assert.doesNotMatch(response.text, /16\.624|50\.000|resultado|saldo/i);
  assert.deepEqual(Object.keys(response.data).sort(), [
    'expenseCount', 'expenses', 'income', 'incomeCount', 'period',
  ]);
});

test('aliases antigos de saldo entregam informação útil sem expor balance legado', () => {
  for (const text of ['Qual meu saldo?', 'Quanto dinheiro tenho?', 'Quanto sobrou?', 'Ver meu saldo.']) {
    const response = buildPublicMovementSummaryResponse({
      snapshot: snapshotWithLegacyBalance(MOVEMENTS),
      text,
      includeRetirementIntro: true,
    });
    assert.match(response.text, /Entradas e Saídas/);
    assert.doesNotMatch(response.text, /saldo|resultado|sobrou|16\.624|50\.000/i);
  }
});

test('contas novas, somente Entradas, somente Saídas e zero movimentações nunca expõem saldo', () => {
  const matrices = [
    snapshotWithLegacyBalance([]),
    buildFinancialSnapshot({ transactions: [MOVEMENTS[0]], referenceDate: '2026-08-13' }),
    buildFinancialSnapshot({ transactions: [MOVEMENTS[2]], referenceDate: '2026-08-13' }),
    buildFinancialSnapshot({ referenceDate: '2026-08-13' }),
  ];
  for (const snapshot of matrices) {
    const response = buildPublicMovementSummaryResponse({ snapshot, text: 'Faz um resumo financeiro' });
    assert.equal(containsForbiddenPublicBalanceNarrative(response.text), false);
    assert.doesNotMatch(response.text, /resultado\s+(?:positivo|negativo)|seu saldo|saldo atual/i);
  }
});

test('período explícito é respeitado e ausência de período usa o mês atual', () => {
  const snapshot = snapshotWithLegacyBalance(MOVEMENTS);
  const current = buildPublicMovementSummaryResponse({ snapshot, text: 'Como foi meu mês?' });
  const previous = buildPublicMovementSummaryResponse({ snapshot, text: 'Como foi o mês passado?' });
  assert.equal(current.data.expenseCount, 2);
  assert.equal(previous.data.expenseCount, 1);
  assert.equal(previous.data.expenses, 99);
});

test('períodos públicos reutilizam o resolvedor temporal existente', () => {
  const snapshot = snapshotWithLegacyBalance(MOVEMENTS);
  const cases = [
    ['hoje', '2026-08-13', '2026-08-13'],
    ['ontem', '2026-08-12', '2026-08-12'],
    ['esta semana', '2026-08-10', '2026-08-16'],
    ['mês passado', '2026-07-01', '2026-07-31'],
    ['agosto', '2026-08-01', '2026-08-31'],
    ['últimos 30 dias', '2026-07-15', '2026-08-13'],
  ];
  for (const [text, start, end] of cases) {
    assert.deepEqual(
      resolvePublicFinancialPeriod(snapshot, `Faz um resumo financeiro de ${text}`),
      { start, end, label: resolvePublicFinancialPeriod(snapshot, text).label },
      text,
    );
  }
});

test('barreira final substitui narrativa proibida da LLM/Engine somente em contexto financeiro', () => {
  const snapshot = snapshotWithLegacyBalance(MOVEMENTS);
  const safe = enforcePublicFinancialResponsePolicy({
    text: 'Seu saldo atual é R$ 16.624 e o resultado negativo foi R$ 2.000.',
    requestText: 'Me fala sobre meu dinheiro',
    snapshot,
  });
  assert.match(safe, /2 entradas/);
  assert.doesNotMatch(safe, /saldo|resultado/i);
  assert.equal(
    enforcePublicFinancialResponsePolicy({
      text: 'A pauta da reunião é saldo de férias.',
      requestText: 'Agenda uma reunião sobre saldo',
      snapshot,
    }),
    'A pauta da reunião é saldo de férias.',
  );
});

test('matriz de vazamento bloqueia saldo, resultado e subtração narrada por qualquer compositor', () => {
  for (const text of [
    'Seu saldo atual é R$ 16.624,00.',
    'Você possui R$ 16.624,00.',
    'Você está com R$ 16.624,00.',
    'O resultado positivo foi de R$ 1.180,00.',
    'O resultado negativo foi de R$ 1.180,00.',
    'Sobraram R$ 1.180,00 neste mês.',
    'A diferença foi de R$ 1.180,00.',
    'Seu patrimônio é de R$ 16.624,00.',
    'O valor restante é R$ 1.180,00.',
  ]) {
    assert.equal(containsForbiddenPublicBalanceNarrative(text), true, text);
  }
});

test('atalho público de Saldo foi substituído por Abrir agenda e navega para a rota existente', async () => {
  assert.equal(SUGGESTIONS_PESSOAL.some((item) => item.label === 'Ver meu saldo'), false);
  assert.equal(
    SUGGESTIONS_PESSOAL.some((item) => item.label === 'Abrir agenda' && item.intent === 'abrir_agenda'),
    true,
  );
  const page = await readFile(new URL('./UniChatPage.jsx', import.meta.url), 'utf8');
  assert.match(page, /item\.intent === 'abrir_agenda'/);
  assert.match(page, /navigate\(SIMPLIFIED_ROUTES\.AGENDA\)/);
});

test('UniChat resolve resumo financeiro antes de small talk e abandona pending de Agenda', async () => {
  const page = await readFile(new URL('./UniChatPage.jsx', import.meta.url), 'utf8');
  const summaryGate = page.indexOf('if (isRetiredBalanceRequest || isPublicFinancialSummary)');
  const commonGate = page.indexOf("if (declaredIntent === 'conversation_common')", summaryGate);
  assert.ok(summaryGate >= 0);
  assert.ok(commonGate > summaryGate);
  assert.match(page, /shouldAbandonAgendaForFinancial[\s\S]*isPublicFinancialSummary/);
  assert.match(page, /enforcePublicFinancialResponsePolicy/);
});
