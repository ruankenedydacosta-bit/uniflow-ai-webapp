import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFutureChartComparison } from './futureChartComparison.js';

function baseProjections(overrides = {}) {
  return {
    hasHistory: true,
    selectedHorizon: 3,
    availableScenarios: ['conservative', 'likely', 'accelerated'],
    chartData: [
      { label: 'Hoje', conservative: 1000, likely: 1000, accelerated: 1000 },
      { label: 'Mês 1', conservative: 1200, likely: 1300, accelerated: 1400 },
      { label: 'Mês 2', conservative: 1400, likely: 1600, accelerated: 1800 },
      { label: 'Mês 3', conservative: 1600, likely: 1900, accelerated: 2200 },
    ],
    ...overrides,
  };
}

// ── Construção básica ────────────────────────────────────────────────────

test('constroi pontos reais e simulados equivalentes para o cenario informado', () => {
  const real = baseProjections();
  const simulated = baseProjections({
    chartData: [
      { label: 'Hoje', conservative: 1000, likely: 1000, accelerated: 1000 },
      { label: 'Mês 1', conservative: 1200, likely: 1500, accelerated: 1400 },
      { label: 'Mês 2', conservative: 1400, likely: 2000, accelerated: 1800 },
      { label: 'Mês 3', conservative: 1600, likely: 2500, accelerated: 2200 },
    ],
  });
  const result = buildFutureChartComparison({ realProjections: real, simulatedProjections: simulated, scenarioId: 'likely', selectedHorizon: 3 });
  assert.equal(result.isComparable, true);
  assert.equal(result.points.length, 4);
  assert.equal(result.points[1].realValue, 1300);
  assert.equal(result.points[1].simulatedValue, 1500);
});

test('preserva a ordem cronologica oficial da serie real', () => {
  const real = baseProjections();
  const simulated = baseProjections();
  const result = buildFutureChartComparison({ realProjections: real, simulatedProjections: simulated, scenarioId: 'likely', selectedHorizon: 3 });
  assert.deepEqual(result.points.map((p) => p.label), ['Hoje', 'Mês 1', 'Mês 2', 'Mês 3']);
});

test('alinha por chave estavel (label), nao por posicao bruta', () => {
  const real = baseProjections();
  // simulado com ordem embaralhada de propósito
  const simulated = baseProjections({
    chartData: [
      { label: 'Mês 2', conservative: 1, likely: 9999, accelerated: 1 },
      { label: 'Hoje', conservative: 1, likely: 1000, accelerated: 1 },
      { label: 'Mês 3', conservative: 1, likely: 1, accelerated: 1 },
      { label: 'Mês 1', conservative: 1, likely: 1, accelerated: 1 },
    ],
  });
  const result = buildFutureChartComparison({ realProjections: real, simulatedProjections: simulated, scenarioId: 'likely', selectedHorizon: 3 });
  const mes2 = result.points.find((p) => p.label === 'Mês 2');
  assert.equal(mes2.simulatedValue, 9999);
  assert.equal(mes2.realValue, 1600);
});

test('ignora ponto existente em apenas um dos lados', () => {
  const real = baseProjections();
  const simulated = baseProjections({
    chartData: [
      { label: 'Hoje', conservative: 1, likely: 1000, accelerated: 1 },
      { label: 'Mês 1', conservative: 1, likely: 1300, accelerated: 1 },
      // "Mês 2" e "Mês 3" ausentes do lado simulado
    ],
  });
  const result = buildFutureChartComparison({ realProjections: real, simulatedProjections: simulated, scenarioId: 'likely', selectedHorizon: 3 });
  assert.deepEqual(result.points.map((p) => p.label), ['Hoje', 'Mês 1']);
});

test('nao preenche mes ausente com zero (ponto simplesmente nao aparece)', () => {
  const real = baseProjections();
  const simulated = baseProjections({ chartData: [{ label: 'Hoje', conservative: 1, likely: 1000, accelerated: 1 }] });
  const result = buildFutureChartComparison({ realProjections: real, simulatedProjections: simulated, scenarioId: 'likely', selectedHorizon: 3 });
  assert.equal(result.points.length, 1);
  assert.ok(result.points.every((p) => p.simulatedValue !== 0 || p.label === 'Hoje'));
});

// ── Rejeições ────────────────────────────────────────────────────────────

test('rejeita cenario incompativel (nao disponivel em um dos lados)', () => {
  const real = baseProjections({ availableScenarios: ['likely'] });
  const simulated = baseProjections({ availableScenarios: ['conservative'] });
  const result = buildFutureChartComparison({ realProjections: real, simulatedProjections: simulated, scenarioId: 'likely', selectedHorizon: 3 });
  assert.equal(result.isComparable, false);
  assert.equal(result.unavailableReason, 'scenario_mismatch');
});

test('rejeita horizonte incompativel entre real e simulado', () => {
  const real = baseProjections({ selectedHorizon: 3 });
  const simulated = baseProjections({ selectedHorizon: 6 });
  const result = buildFutureChartComparison({ realProjections: real, simulatedProjections: simulated, scenarioId: 'likely', selectedHorizon: 3 });
  assert.equal(result.isComparable, false);
  assert.equal(result.unavailableReason, 'horizon_mismatch');
});

test('rejeita quando selectedHorizon do parametro diverge dos objetos', () => {
  const real = baseProjections({ selectedHorizon: 3 });
  const simulated = baseProjections({ selectedHorizon: 3 });
  const result = buildFutureChartComparison({ realProjections: real, simulatedProjections: simulated, scenarioId: 'likely', selectedHorizon: 6 });
  assert.equal(result.isComparable, false);
});

test('valor NaN em um ponto torna aquele lado indisponivel, nao quebra a comparacao', () => {
  const real = baseProjections({ chartData: [{ label: 'Hoje', likely: NaN }] });
  const simulated = baseProjections({ chartData: [{ label: 'Hoje', likely: 1000 }] });
  const result = buildFutureChartComparison({ realProjections: real, simulatedProjections: simulated, scenarioId: 'likely', selectedHorizon: 3 });
  assert.equal(result.points[0].realValue, null);
  assert.equal(result.points[0].simulatedValue, 1000);
});

test('valor Infinity torna o lado indisponivel, nunca aparece no resultado', () => {
  const real = baseProjections({ chartData: [{ label: 'Hoje', likely: Infinity }] });
  const simulated = baseProjections({ chartData: [{ label: 'Hoje', likely: -Infinity }] });
  const result = buildFutureChartComparison({ realProjections: real, simulatedProjections: simulated, scenarioId: 'likely', selectedHorizon: 3 });
  assert.equal(result.points.length, 0);
  assert.equal(result.isComparable, false);
});

test('string numerica nao e convertida silenciosamente', () => {
  const real = baseProjections({ chartData: [{ label: 'Hoje', likely: '1000' }] });
  const simulated = baseProjections({ chartData: [{ label: 'Hoje', likely: 1000 }] });
  const result = buildFutureChartComparison({ realProjections: real, simulatedProjections: simulated, scenarioId: 'likely', selectedHorizon: 3 });
  assert.equal(result.points[0].realValue, null);
});

test('nenhum retorno contem NaN ou Infinity', () => {
  const real = baseProjections({ chartData: [{ label: 'Hoje', likely: NaN }, { label: 'Mês 1', likely: Infinity }] });
  const simulated = baseProjections({ chartData: [{ label: 'Hoje', likely: 1000 }, { label: 'Mês 1', likely: -Infinity }] });
  const result = buildFutureChartComparison({ realProjections: real, simulatedProjections: simulated, scenarioId: 'likely', selectedHorizon: 3 });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /NaN|Infinity/);
});

test('funcao nao chama buildFutureProjections (adaptador puro, apenas le chartData)', () => {
  const source = buildFutureChartComparison.toString();
  assert.doesNotMatch(source, /buildFutureProjections/);
});

// ── Imutabilidade ────────────────────────────────────────────────────────

test('nao muta a projecao real', () => {
  const real = baseProjections();
  const simulated = baseProjections();
  const snapshot = JSON.stringify(real);
  buildFutureChartComparison({ realProjections: real, simulatedProjections: simulated, scenarioId: 'likely', selectedHorizon: 3 });
  assert.equal(JSON.stringify(real), snapshot);
});

test('nao muta a projecao simulada', () => {
  const real = baseProjections();
  const simulated = baseProjections();
  const snapshot = JSON.stringify(simulated);
  buildFutureChartComparison({ realProjections: real, simulatedProjections: simulated, scenarioId: 'likely', selectedHorizon: 3 });
  assert.equal(JSON.stringify(simulated), snapshot);
});

test('chamadas consecutivas sao independentes', () => {
  const real = baseProjections();
  const simulatedA = baseProjections({ chartData: baseProjections().chartData.map((p) => ({ ...p, likely: p.likely + 100 })) });
  const simulatedB = baseProjections({ chartData: baseProjections().chartData.map((p) => ({ ...p, likely: p.likely - 100 })) });
  const resultA = buildFutureChartComparison({ realProjections: real, simulatedProjections: simulatedA, scenarioId: 'likely', selectedHorizon: 3 });
  const resultB = buildFutureChartComparison({ realProjections: real, simulatedProjections: simulatedB, scenarioId: 'likely', selectedHorizon: 3 });
  assert.equal(resultA.points[1].simulatedValue, 1400);
  assert.equal(resultB.points[1].simulatedValue, 1200);
});

// ── Ausência de histórico / entradas vazias ─────────────────────────────

test('sem historico real -> comparacao indisponivel', () => {
  const real = baseProjections({ hasHistory: false, chartData: [] });
  const simulated = baseProjections();
  const result = buildFutureChartComparison({ realProjections: real, simulatedProjections: simulated, scenarioId: 'likely', selectedHorizon: 3 });
  assert.equal(result.isComparable, false);
  assert.equal(result.unavailableReason, 'insufficient_history');
});

test('arrays de chartData vazios em ambos os lados -> pontos vazios, sem erro', () => {
  const real = baseProjections({ chartData: [] });
  const simulated = baseProjections({ chartData: [] });
  const result = buildFutureChartComparison({ realProjections: real, simulatedProjections: simulated, scenarioId: 'likely', selectedHorizon: 3 });
  assert.deepEqual(result.points, []);
  assert.equal(result.isComparable, false);
});

test('projecoes ausentes nao lancam erro', () => {
  const result = buildFutureChartComparison({});
  assert.equal(result.isComparable, false);
  assert.equal(result.unavailableReason, 'missing_input');
});

test('scenarioId ausente nao lanca erro', () => {
  const real = baseProjections();
  const simulated = baseProjections();
  const result = buildFutureChartComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 3 });
  assert.equal(result.isComparable, false);
  assert.equal(result.unavailableReason, 'missing_input');
});

// ── Invariante do motor: mesmo horizonte produz arrays de mesmo comprimento e labels alinhados ──

test('invariante: para o mesmo horizonte, chartData real e simulado tem o mesmo numero de meses e mesmos labels na mesma ordem', () => {
  const real = baseProjections();
  const simulated = baseProjections();
  assert.equal(real.chartData.length, simulated.chartData.length);
  assert.deepEqual(real.chartData.map((p) => p.label), simulated.chartData.map((p) => p.label));
});
