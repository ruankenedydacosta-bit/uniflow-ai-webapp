// Testes do Narrador Runtime (Fase 17, Bloco 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateRuntimeNarrative, getAvailableNarrativeStyles } from '../narrator/index.js';

function buildExecutionResult(status, data) {
  return { status, results: data };
}

function buildComparisonResult(status, data) {
  return { status, ...data };
}

test('narrator: execução vazia retorna narrativa de no_data', () => {
  const execution = buildExecutionResult('no_data', {});
  const narrative = generateRuntimeNarrative(execution, null, { type: 'balance_query' }, { entity: 'this_month' }, 'conversational');
  assert.ok(narrative.text.includes('dados') || narrative.text.includes('informação') || narrative.text.includes('disponível'));
});

test('narrator: single_metric balance gera resposta direta', () => {
  const execution = buildExecutionResult('executed', {
    cashflow: { monthlyResult: 4200, monthlyIncome: 6000, monthlyExpense: 1800 }
  });
  const narrative = generateRuntimeNarrative(execution, null, { type: 'balance_query' }, { entity: 'this_month' }, 'conversational');
  assert.ok(narrative.text.includes('4.200,00') || narrative.text.includes('4200'));
  assert.equal(narrative.planType, 'single_metric');
});

test('narrator: breakdown categories gera narrativa com top categoria', () => {
  const execution = buildExecutionResult('executed', {
    categories: {
      data: [{ name: 'Alimentação', spent: 800 }, { name: 'Moradia', spent: 1200 }],
      total: 2000
    }
  });
  const narrative = generateRuntimeNarrative(execution, null, { type: 'category_breakdown_query' }, { entity: 'this_month' }, 'conversational');
  assert.ok(narrative.text.includes('Alimentação') || narrative.text.includes('Moradia'));
  assert.equal(narrative.planType, 'breakdown');
});

test('narrator: comparison gera narrativa comparativa', () => {
  const execution = buildExecutionResult('executed', {
    cashflow: { monthlyResult: 4200 }
  });
  const comparison = buildComparisonResult('executed', {
    type: 'month_over_month',
    deltas: { income: 1000, expense: 300, result: 700 },
    percentages: { income: 20, expense: 20, result: 20 },
    currentPeriod: { month: '2026-08' },
    comparisonPeriod: { month: '2026-07' },
  });
  const narrative = generateRuntimeNarrative(execution, comparison, { type: 'cashflow_query' }, { entity: 'this_month' }, 'conversational');
  assert.ok(narrative.text.includes('subiu') || narrative.text.includes('caiu') || narrative.text.includes('vari') || narrative.text.includes('aumentou') || narrative.text.includes('diminuiu'));
  assert.equal(narrative.comparisonType, 'month_over_month');
});

test('narrator: diferentes estilos produzem textos', () => {
  const execution = buildExecutionResult('executed', {
    cashflow: { monthlyResult: 4200 }
  });
  const concise = generateRuntimeNarrative(execution, null, { type: 'balance_query' }, { entity: 'this_month' }, 'concise');
  const detailed = generateRuntimeNarrative(execution, null, { type: 'balance_query' }, { entity: 'this_month' }, 'detailed');
  // Concise deve ser mais curto ou igual
  assert.ok(concise.text.length <= detailed.text.length);
});

test('narrator: getAvailableNarrativeStyles retorna estilos', () => {
  const styles = getAvailableNarrativeStyles();
  assert.ok(styles.includes('concise'));
  assert.ok(styles.includes('structured'));
  assert.ok(styles.includes('detailed'));
  assert.ok(styles.includes('conversational'));
  assert.ok(styles.includes('executive'));
});

test('narrator: resultado é serializável', () => {
  const execution = buildExecutionResult('executed', {
    cashflow: { monthlyResult: 4200 }
  });
  const narrative = generateRuntimeNarrative(execution, null, { type: 'balance_query' }, { entity: 'this_month' }, 'conversational');
  assert.doesNotThrow(() => JSON.stringify(narrative));
  assert.deepEqual(JSON.parse(JSON.stringify(narrative)), narrative);
});