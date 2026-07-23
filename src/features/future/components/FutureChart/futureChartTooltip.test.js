import assert from 'node:assert/strict';
import test from 'node:test';
import { buildComparisonTooltipText } from './futureChartTooltip.js';

test('mostra periodo, valor real e valor simulado', () => {
  const text = buildComparisonTooltipText({ label: 'Mês 2', realValue: 1000, simulatedValue: 1500 });
  assert.match(text, /Mês 2/);
  assert.match(text, /Real: R\$\s*1\.000,00/);
  assert.match(text, /Simulado: R\$\s*1\.500,00/);
});

test('inclui diferenca (simulado - real) quando os dois lados estao disponiveis', () => {
  const text = buildComparisonTooltipText({ label: 'Mês 2', realValue: 1000, simulatedValue: 1500 });
  assert.match(text, /Diferença: \+R\$\s*500,00/);
});

test('diferenca negativa mantem o sinal', () => {
  const text = buildComparisonTooltipText({ label: 'Mês 2', realValue: 1500, simulatedValue: 1000 });
  assert.match(text, /Diferença: -R\$\s*500,00/);
});

test('valor real ausente mostra "Não disponível", nunca zero', () => {
  const text = buildComparisonTooltipText({ label: 'Mês 2', realValue: null, simulatedValue: 1500 });
  assert.match(text, /Real: Não disponível/);
  assert.doesNotMatch(text, /Real: R\$\s*0,00/);
});

test('sem um dos lados, nao calcula diferenca (evita numero enganoso)', () => {
  const text = buildComparisonTooltipText({ label: 'Mês 2', realValue: null, simulatedValue: 1500 });
  assert.doesNotMatch(text, /Diferença/);
});

test('nunca lanca erro para ponto ausente', () => {
  assert.equal(buildComparisonTooltipText(null), '');
  assert.equal(buildComparisonTooltipText(undefined), '');
});

test('nunca produz NaN ou Infinity no texto', () => {
  const text = buildComparisonTooltipText({ label: 'Mês 2', realValue: NaN, simulatedValue: Infinity });
  assert.doesNotMatch(text, /NaN|Infinity/);
});

// F5.6: ruido de ponto flutuante (< 1 centavo) nao pode aparecer como
// "Diferença: -R$ 0,00" — a propria UI mostraria R$ 0,00 de qualquer forma.
test('diferenca de ruido de ponto flutuante nao aparece como "-R$ 0,00"', () => {
  const text = buildComparisonTooltipText({ label: 'Mês 2', realValue: 1000, simulatedValue: 1000.0000000001 });
  assert.match(text, /Diferença: R\$\s*0,00/);
  assert.doesNotMatch(text, /Diferença: -/);
});
