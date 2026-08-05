// Uni Engine — Fase 21: testes da narrativa de ToolResult.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildToolResultNarrativeText } from './buildToolResultNarrative.js';

function completedResult({ tool, data, ok = true, status = 'completed', executed = true }) {
  return {
    status,
    executed,
    toolName: tool,
    data: { ok, tool, data, meta: {} },
  };
}

test('narrativa - resposta financeira: get_financial_summary vira frase natural', () => {
  const result = completedResult({
    tool: 'get_financial_summary',
    data: { period: '2026-08', currency: 'BRL', balance: 1000, income: 5000, expenses: 3000, result: 2000, hasData: true },
  });
  const text = buildToolResultNarrativeText(result, { conversationStyle: 'normal' });
  assert.equal(typeof text, 'string');
  assert.match(text, /2026-08/);
  assert.match(text, /R\$/);
  assert.doesNotMatch(text, /"ok":/);
  assert.doesNotMatch(text, /\{/);
});

test('narrativa - resposta usando ToolResult: get_expense_breakdown lista categorias', () => {
  const result = completedResult({
    tool: 'get_expense_breakdown',
    data: {
      period: '2026-08',
      total: 1200,
      categoriesAvailable: true,
      byCategory: [{ name: 'Mercado', spent: 800 }, { name: 'Transporte', spent: 400 }],
    },
  });
  const text = buildToolResultNarrativeText(result, { conversationStyle: 'detailed' });
  assert.match(text, /Mercado/);
  assert.match(text, /Transporte/);
});

test('narrativa - sem ToolResult (null/undefined) retorna null', () => {
  assert.equal(buildToolResultNarrativeText(null), null);
  assert.equal(buildToolResultNarrativeText(undefined), null);
});

test('narrativa - ToolResult vazio (sem data) retorna null', () => {
  const result = { status: 'completed', executed: true, toolName: 'get_financial_summary', data: null };
  assert.equal(buildToolResultNarrativeText(result), null);
});

test('narrativa - ToolResult inválido (envelope malformado) retorna null', () => {
  assert.equal(buildToolResultNarrativeText({ status: 'completed', executed: true, data: 'not-an-object' }), null);
  assert.equal(buildToolResultNarrativeText({ status: 'completed', executed: true, data: { ok: true, tool: 'unknown_tool', data: {} } }), null);
});

test('narrativa - erro interno (handler reportou ok:false) não narra', () => {
  const result = completedResult({ tool: 'get_financial_summary', data: null, ok: false });
  assert.equal(buildToolResultNarrativeText(result), null);
});

test('narrativa - status timeout não narra', () => {
  const result = completedResult({ tool: 'get_financial_summary', data: { period: 'x' }, status: 'timeout', executed: false });
  assert.equal(buildToolResultNarrativeText(result), null);
});

test('narrativa - status error não narra', () => {
  const result = completedResult({ tool: 'get_financial_summary', data: { period: 'x' }, status: 'error', executed: false });
  assert.equal(buildToolResultNarrativeText(result), null);
});

test('narrativa - executed=false com status completed (inconsistente) não narra', () => {
  const result = completedResult({ tool: 'get_financial_summary', data: { period: 'x' }, executed: false });
  assert.equal(buildToolResultNarrativeText(result), null);
});

test('narrativa - metas vazias produz mensagem segura sem inventar dados', () => {
  const result = completedResult({ tool: 'get_goal_progress', data: { goals: [], count: 0 } });
  const text = buildToolResultNarrativeText(result);
  assert.match(text, /ainda não tem metas/);
});

test('narrativa - get_account_summary sem contas produz mensagem segura', () => {
  const result = completedResult({ tool: 'get_account_summary', data: { totalBalance: null, accounts: [], counts: { accounts: 0, byType: {} }, currency: 'BRL' } });
  const text = buildToolResultNarrativeText(result);
  assert.match(text, /ainda não tem contas/);
});

test('narrativa - get_recurring_expenses sem padrão suficiente produz mensagem segura', () => {
  const result = completedResult({ tool: 'get_recurring_expenses', data: { detected: [], patternSufficient: false, period: null } });
  const text = buildToolResultNarrativeText(result);
  assert.match(text, /Não identifiquei/);
});

test('narrativa - compare_financial_periods sem status executed não narra', () => {
  const result = completedResult({
    tool: 'compare_financial_periods',
    data: { status: 'error_safe', comparisonType: 'month_over_month', periodA: 'a', periodB: 'b', detail: null },
  });
  assert.equal(buildToolResultNarrativeText(result), null);
});

test('narrativa - compare_financial_periods executado gera frase com interpretação', () => {
  const result = completedResult({
    tool: 'compare_financial_periods',
    data: {
      status: 'executed',
      comparisonType: 'month_over_month',
      periodA: '2026-07',
      periodB: '2026-08',
      detail: { deltas: {}, percentages: {}, interpretation: 'suas despesas caíram' },
    },
  });
  const text = buildToolResultNarrativeText(result);
  assert.match(text, /2026-07/);
  assert.match(text, /2026-08/);
  assert.match(text, /suas despesas caíram/);
});

test('narrativa - nunca expõe chaves internas (ok/tool/meta/data bruto) na string final', () => {
  const result = completedResult({
    tool: 'get_financial_summary',
    data: { period: '2026-08', balance: 500, income: 100, expenses: 50, result: 50 },
  });
  const text = buildToolResultNarrativeText(result);
  assert.doesNotMatch(text, /\bmeta\b/);
  assert.doesNotMatch(text, /\btool\b/);
  assert.doesNotMatch(text, /\bhasData\b/);
});

test('narrativa - estilo simple sempre produz uma única linha', () => {
  const result = completedResult({
    tool: 'get_expense_breakdown',
    data: {
      period: '2026-08',
      total: 1200,
      categoriesAvailable: true,
      byCategory: [{ name: 'Mercado', spent: 800 }, { name: 'Transporte', spent: 400 }],
    },
  });
  const text = buildToolResultNarrativeText(result, { conversationStyle: 'simple' });
  assert.doesNotMatch(text, /\n/);
});
