import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFutureComparison } from './futureComparison.js';

function baseProjections(overrides = {}) {
  return {
    hasHistory: true,
    selectedHorizon: 6,
    availableScenarios: ['conservative', 'likely', 'accelerated'],
    scenarioProjections: {
      conservative: { projectedBalance: 8000, monthlyResult: 1500, hasData: true },
      likely: { projectedBalance: 10000, monthlyResult: 2000, hasData: true },
      accelerated: { projectedBalance: 12000, monthlyResult: 2500, hasData: true },
    },
    goalProjections: [],
    ...overrides,
  };
}

// ── Comparação básica (saldo final) ─────────────────────────────────────────

test('real 1000, simulado 1500 -> delta 500', () => {
  const real = baseProjections({ scenarioProjections: { likely: { projectedBalance: 1000, monthlyResult: 100, hasData: true } }, availableScenarios: ['likely'] });
  const simulated = baseProjections({ scenarioProjections: { likely: { projectedBalance: 1500, monthlyResult: 100, hasData: true } }, availableScenarios: ['likely'] });
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  assert.equal(result.scenarios[0].finalBalance.delta, 500);
  assert.equal(result.scenarios[0].finalBalance.direction, 'higher');
});

test('real 1000, simulado 500 -> delta -500', () => {
  const real = baseProjections({ scenarioProjections: { likely: { projectedBalance: 1000, monthlyResult: 100, hasData: true } }, availableScenarios: ['likely'] });
  const simulated = baseProjections({ scenarioProjections: { likely: { projectedBalance: 500, monthlyResult: 100, hasData: true } }, availableScenarios: ['likely'] });
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  assert.equal(result.scenarios[0].finalBalance.delta, -500);
  assert.equal(result.scenarios[0].finalBalance.direction, 'lower');
});

test('valores iguais -> delta 0 e direction unchanged', () => {
  const real = baseProjections({ scenarioProjections: { likely: { projectedBalance: 1000, monthlyResult: 100, hasData: true } }, availableScenarios: ['likely'] });
  const simulated = baseProjections({ scenarioProjections: { likely: { projectedBalance: 1000, monthlyResult: 100, hasData: true } }, availableScenarios: ['likely'] });
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  assert.equal(result.scenarios[0].finalBalance.delta, 0);
  assert.equal(result.scenarios[0].finalBalance.direction, 'unchanged');
});

// F5.6: robustez — ruído de ponto flutuante abaixo de 1 centavo não pode
// virar "higher"/"lower" (o texto contradiria o valor exibido, que arredonda
// para R$ 0,00). O campo `delta` bruto continua preservado, só `direction`
// usa a versão arredondada.
test('diferenca de ruido de ponto flutuante (< 1 centavo) nao vira "higher"/"lower"', () => {
  const real = baseProjections({ scenarioProjections: { likely: { projectedBalance: 1000, monthlyResult: 100, hasData: true } }, availableScenarios: ['likely'] });
  const simulated = baseProjections({ scenarioProjections: { likely: { projectedBalance: 1000 + 0.0000000001, monthlyResult: 100, hasData: true } }, availableScenarios: ['likely'] });
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  assert.equal(result.scenarios[0].finalBalance.direction, 'unchanged');
  assert.ok(result.scenarios[0].finalBalance.delta !== 0);
});

test('real negativo e simulado menos negativo (melhora, sinais preservados)', () => {
  const real = baseProjections({ scenarioProjections: { likely: { projectedBalance: -2000, monthlyResult: -100, hasData: true } }, availableScenarios: ['likely'] });
  const simulated = baseProjections({ scenarioProjections: { likely: { projectedBalance: -500, monthlyResult: -100, hasData: true } }, availableScenarios: ['likely'] });
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  assert.equal(result.scenarios[0].finalBalance.real, -2000);
  assert.equal(result.scenarios[0].finalBalance.simulated, -500);
  assert.equal(result.scenarios[0].finalBalance.delta, 1500);
  assert.equal(result.scenarios[0].finalBalance.direction, 'higher');
});

test('real negativo e simulado mais negativo (piora, sinais preservados)', () => {
  const real = baseProjections({ scenarioProjections: { likely: { projectedBalance: -500, monthlyResult: -100, hasData: true } }, availableScenarios: ['likely'] });
  const simulated = baseProjections({ scenarioProjections: { likely: { projectedBalance: -2000, monthlyResult: -100, hasData: true } }, availableScenarios: ['likely'] });
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  assert.equal(result.scenarios[0].finalBalance.delta, -1500);
  assert.equal(result.scenarios[0].finalBalance.direction, 'lower');
});

// ── Percentual ───────────────────────────────────────────────────────────

test('aumento percentual calculado corretamente', () => {
  const real = baseProjections({ scenarioProjections: { likely: { projectedBalance: 1000, monthlyResult: 100, hasData: true } }, availableScenarios: ['likely'] });
  const simulated = baseProjections({ scenarioProjections: { likely: { projectedBalance: 1200, monthlyResult: 100, hasData: true } }, availableScenarios: ['likely'] });
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  assert.equal(result.scenarios[0].finalBalance.percentDelta, 20);
});

test('reducao percentual calculada corretamente', () => {
  const real = baseProjections({ scenarioProjections: { likely: { projectedBalance: 1000, monthlyResult: 100, hasData: true } }, availableScenarios: ['likely'] });
  const simulated = baseProjections({ scenarioProjections: { likely: { projectedBalance: 800, monthlyResult: 100, hasData: true } }, availableScenarios: ['likely'] });
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  assert.equal(result.scenarios[0].finalBalance.percentDelta, -20);
});

test('base real negativa: percentual usa valor absoluto da base', () => {
  const real = baseProjections({ scenarioProjections: { likely: { projectedBalance: -1000, monthlyResult: 100, hasData: true } }, availableScenarios: ['likely'] });
  const simulated = baseProjections({ scenarioProjections: { likely: { projectedBalance: -500, monthlyResult: 100, hasData: true } }, availableScenarios: ['likely'] });
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  // delta = -500 - (-1000) = 500; percent = 500 / abs(-1000) * 100 = 50
  assert.equal(result.scenarios[0].finalBalance.percentDelta, 50);
});

test('base real zero -> percentual null, nunca Infinity', () => {
  const real = baseProjections({ scenarioProjections: { likely: { projectedBalance: 0, monthlyResult: 100, hasData: true } }, availableScenarios: ['likely'] });
  const simulated = baseProjections({ scenarioProjections: { likely: { projectedBalance: 500, monthlyResult: 100, hasData: true } }, availableScenarios: ['likely'] });
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  assert.equal(result.scenarios[0].finalBalance.percentDelta, null);
  assert.notEqual(result.scenarios[0].finalBalance.percentDelta, Infinity);
});

test('valores invalidos (nao numericos) tornam o cenario indisponivel, nao quebram a comparacao', () => {
  const real = baseProjections({ scenarioProjections: { likely: { projectedBalance: 'abc', monthlyResult: 100, hasData: true } }, availableScenarios: ['likely'] });
  const simulated = baseProjections({ scenarioProjections: { likely: { projectedBalance: 500, monthlyResult: 100, hasData: true } }, availableScenarios: ['likely'] });
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  assert.equal(result.scenarios.length, 0);
  assert.equal(result.isComparable, false);
});

test('nunca retorna NaN ou Infinity em nenhum campo numerico', () => {
  const real = baseProjections();
  const simulated = baseProjections({
    scenarioProjections: {
      conservative: { projectedBalance: 0, monthlyResult: 0, hasData: true },
      likely: { projectedBalance: 0, monthlyResult: 0, hasData: true },
      accelerated: { projectedBalance: 0, monthlyResult: 0, hasData: true },
    },
  });
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /NaN|Infinity/);
});

// ── Imutabilidade ────────────────────────────────────────────────────────

test('nao altera a projecao real', () => {
  const real = baseProjections();
  const simulated = baseProjections({ scenarioProjections: { ...baseProjections().scenarioProjections, likely: { projectedBalance: 99999, monthlyResult: 1, hasData: true } } });
  const snapshot = JSON.stringify(real);
  buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  assert.equal(JSON.stringify(real), snapshot);
});

test('nao altera a projecao simulada', () => {
  const real = baseProjections();
  const simulated = baseProjections();
  const snapshot = JSON.stringify(simulated);
  buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  assert.equal(JSON.stringify(simulated), snapshot);
});

test('chamadas consecutivas sao independentes (sem estado compartilhado)', () => {
  const real = baseProjections();
  const simulatedA = baseProjections({ scenarioProjections: { ...baseProjections().scenarioProjections, likely: { projectedBalance: 11000, monthlyResult: 100, hasData: true } } });
  const simulatedB = baseProjections({ scenarioProjections: { ...baseProjections().scenarioProjections, likely: { projectedBalance: 9000, monthlyResult: 100, hasData: true } } });
  const resultA = buildFutureComparison({ realProjections: real, simulatedProjections: simulatedA, selectedHorizon: 6 });
  const resultB = buildFutureComparison({ realProjections: real, simulatedProjections: simulatedB, selectedHorizon: 6 });
  assert.equal(resultA.scenarios.find((s) => s.id === 'likely').finalBalance.delta, 1000);
  assert.equal(resultB.scenarios.find((s) => s.id === 'likely').finalBalance.delta, -1000);
});

// ── Horizonte e cenários ────────────────────────────────────────────────

test('usa o mesmo horizonte dos dois objetos', () => {
  const real = baseProjections({ selectedHorizon: 12 });
  const simulated = baseProjections({ selectedHorizon: 12 });
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 12 });
  assert.equal(result.selectedHorizon, 12);
  assert.equal(result.isComparable, true);
});

test('horizontes diferentes entre real e simulado -> nao comparavel', () => {
  const real = baseProjections({ selectedHorizon: 6 });
  const simulated = baseProjections({ selectedHorizon: 12 });
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  assert.equal(result.isComparable, false);
  assert.ok(result.unavailableReasons.includes('horizon_mismatch'));
});

test('selectedHorizon do parametro diverge dos objetos -> nao comparavel', () => {
  const real = baseProjections({ selectedHorizon: 6 });
  const simulated = baseProjections({ selectedHorizon: 6 });
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 12 });
  assert.equal(result.isComparable, false);
});

test('compara todos os cenarios presentes em ambos, na ordem oficial de availableScenarios', () => {
  const real = baseProjections();
  const simulated = baseProjections();
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  assert.deepEqual(result.scenarios.map((s) => s.id), ['conservative', 'likely', 'accelerated']);
});

test('cenario presente apenas em um dos lados nao entra na comparacao', () => {
  const real = baseProjections();
  const simulated = baseProjections({
    scenarioProjections: {
      likely: { projectedBalance: 10500, monthlyResult: 2000, hasData: true },
      accelerated: { projectedBalance: 12500, monthlyResult: 2500, hasData: true },
    },
  });
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  assert.deepEqual(result.scenarios.map((s) => s.id), ['likely', 'accelerated']);
});

test('nao mistura cenarios (likely real nunca compara com conservative simulado)', () => {
  const real = baseProjections();
  const simulated = baseProjections();
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  const likely = result.scenarios.find((s) => s.id === 'likely');
  assert.equal(likely.finalBalance.real, 10000);
  assert.equal(likely.finalBalance.simulated, 10000);
});

// ── Ausência de histórico ────────────────────────────────────────────────

test('sem historico real -> comparacao indisponivel, sem fabricar saldo', () => {
  const real = baseProjections({ hasHistory: false, scenarioProjections: {} });
  const simulated = baseProjections();
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  assert.equal(result.isComparable, false);
  assert.deepEqual(result.scenarios, []);
  assert.ok(result.unavailableReasons.includes('insufficient_history'));
});

test('sem historico simulado -> comparacao indisponivel', () => {
  const real = baseProjections();
  const simulated = baseProjections({ hasHistory: false, scenarioProjections: {} });
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  assert.equal(result.isComparable, false);
});

test('projecoes ausentes -> comparacao indisponivel, sem lancar erro', () => {
  const result = buildFutureComparison({});
  assert.equal(result.isComparable, false);
  assert.ok(result.unavailableReasons.includes('missing_projections'));
});

// ── Metas (comparação por goalId) ───────────────────────────────────────

test('metas comparadas por goalId, nunca por posicao', () => {
  const real = baseProjections({
    goalProjections: [
      { goalId: 'g1', name: 'Viagem', feasibility: 'unviable', estimatedMonths: 20 },
      { goalId: 'g2', name: 'Reserva', feasibility: 'viable', estimatedMonths: 5 },
    ],
  });
  const simulated = baseProjections({
    // ordem invertida de propósito
    goalProjections: [
      { goalId: 'g2', name: 'Reserva', feasibility: 'viable', estimatedMonths: 3 },
      { goalId: 'g1', name: 'Viagem', feasibility: 'viable', estimatedMonths: 10 },
    ],
  });
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  const g1 = result.goals.find((g) => g.goalId === 'g1');
  const g2 = result.goals.find((g) => g.goalId === 'g2');
  assert.equal(g1.estimatedMonths.delta, -10);
  assert.equal(g1.feasibilityChanged, true);
  assert.equal(g2.estimatedMonths.delta, -2);
  assert.equal(g2.feasibilityChanged, false);
});

test('meta presente apenas em um dos lados e ignorada', () => {
  const real = baseProjections({ goalProjections: [{ goalId: 'g1', name: 'Viagem', feasibility: 'viable', estimatedMonths: 10 }] });
  const simulated = baseProjections({ goalProjections: [{ goalId: 'g2', name: 'Outra', feasibility: 'viable', estimatedMonths: 5 }] });
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  assert.deepEqual(result.goals, []);
});

test('sem metas em nenhum dos lados retorna array vazio, sem erro', () => {
  const real = baseProjections();
  const simulated = baseProjections();
  const result = buildFutureComparison({ realProjections: real, simulatedProjections: simulated, selectedHorizon: 6 });
  assert.deepEqual(result.goals, []);
});
