import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calcProgress, calcRemaining, calcMonthsBetween, calcRemainingMonths,
  calcRequiredMonthlyAmount, calcExpectedProgress, calcRhythmStatus,
  calcTotalPlanned, calcTotalAccumulated, calcOverallProgress,
  calcActiveGoals, calcCompletedGoals, calcLateGoals,
  calcRequiredToReachGoal, calcMonthsUntilTarget,
  getRhythmLabel, getRhythmVariant,
} from './goalCalc.js';

test('calcProgress retorna 0 para target zero', () => {
  assert.equal(calcProgress(100, 0), 0);
  assert.equal(calcProgress(0, 0), 0);
});

test('calcProgress retorna percentual arredondado', () => {
  assert.equal(calcProgress(50, 100), 50);
  assert.equal(calcProgress(1, 3), 33);
  assert.equal(calcProgress(100, 100), 100);
  assert.equal(calcProgress(150, 100), 100);
});

test('calcProgress protege current negativo', () => {
  assert.equal(calcProgress(-50, 100), 0);
});

test('calcRemaining retorna valor restante', () => {
  assert.equal(calcRemaining(30, 100), 70);
  assert.equal(calcRemaining(100, 100), 0);
  assert.equal(calcRemaining(150, 100), 0);
});

test('calcRemaining protege current negativo', () => {
  assert.equal(calcRemaining(-10, 100), 100);
});

test('calcMonthsBetween calcula meses entre datas', () => {
  assert.equal(calcMonthsBetween('2026-01-01', '2026-06-01'), 5);
  assert.equal(calcMonthsBetween('2026-01-01', '2027-01-01'), 12);
});

test('calcMonthsBetween retorna null sem datas', () => {
  assert.equal(calcMonthsBetween(null, '2026-06-01'), null);
  assert.equal(calcMonthsBetween('2026-01-01', null), null);
});

test('calcMonthsBetween retorna 1 quando start >= end', () => {
  assert.equal(calcMonthsBetween('2026-06-01', '2026-01-01'), 1);
});

test('calcRemainingMonths retorna meses ate data-alvo', () => {
  const future = new Date();
  future.setMonth(future.getMonth() + 6);
  const result = calcRemainingMonths(future.toISOString().split('T')[0]);
  assert.ok(result !== null);
  assert.ok(result >= 5 && result <= 7);
});

test('calcRemainingMonths retorna 0 para data passada', () => {
  assert.equal(calcRemainingMonths('2020-01-01'), 0);
});

test('calcRemainingMonths retorna null sem target_date', () => {
  assert.equal(calcRemainingMonths(null), null);
});

test('calcRequiredMonthlyAmount calcula mensal necessario por data', () => {
  const goal = {
    current_amount: 3000,
    target_amount: 9000,
    target_date: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  };
  const result = calcRequiredMonthlyAmount(goal);
  assert.ok(result !== null);
  assert.ok(result > 0);
});

test('calcRequiredMonthlyAmount retorna planned_monthly_amount sem target_date', () => {
  const goal = {
    current_amount: 3000,
    target_amount: 9000,
    planned_monthly_amount: 500,
  };
  assert.equal(calcRequiredMonthlyAmount(goal), 500);
});

test('calcRequiredMonthlyAmount retorna 0 se ja atingiu', () => {
  const goal = { current_amount: 9000, target_amount: 9000 };
  assert.equal(calcRequiredMonthlyAmount(goal), 0);
});

test('calcRequiredMonthlyAmount retorna null sem referencia', () => {
  const goal = { current_amount: 3000, target_amount: 9000 };
  assert.equal(calcRequiredMonthlyAmount(goal), null);
});

test('calcExpectedProgress retorna progresso esperado baseado em tempo', () => {
  const start = new Date();
  start.setMonth(start.getMonth() - 6);
  const end = new Date();
  end.setMonth(end.getMonth() + 6);
  const result = calcExpectedProgress({
    start_date: start.toISOString().split('T')[0],
    target_date: end.toISOString().split('T')[0],
  });
  assert.ok(result !== null);
  assert.ok(result > 30 && result < 70);
});

test('calcExpectedProgress retorna 100 para concluida', () => {
  const goal = { start_date: '2026-01-01', target_date: '2026-06-01', status: 'completed' };
  assert.equal(calcExpectedProgress(goal), 100);
});

test('calcExpectedProgress retorna null sem datas', () => {
  assert.equal(calcExpectedProgress({}), null);
});

test('calcRhythmStatus retorna on_track quando progress >= expected', () => {
  const result = calcRhythmStatus({
    current_amount: 80,
    target_amount: 100,
    start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    target_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'active',
  });
  assert.equal(result, 'on_track');
});

test('calcRhythmStatus retorna null para concluida', () => {
  assert.equal(calcRhythmStatus({ status: 'completed' }), null);
});

test('calcRhythmStatus retorna null para cancelada', () => {
  assert.equal(calcRhythmStatus({ status: 'canceled' }), null);
});

test('calcRhythmStatus retorna late para meta vencida nao concluida', () => {
  const result = calcRhythmStatus({
    current_amount: 10,
    target_amount: 100,
    start_date: '2019-01-01',
    target_date: '2020-01-01',
    status: 'active',
  });
  assert.equal(result, 'late');
});

test('calcTotalPlanned soma valores-alvo', () => {
  const goals = [
    { target_amount: 10000 },
    { target_amount: 20000 },
    { target_amount: 30000 },
  ];
  assert.equal(calcTotalPlanned(goals), 60000);
});

test('calcTotalAccumulated soma valores acumulados', () => {
  const goals = [
    { current_amount: 1000 },
    { current_amount: 2000 },
    { current_amount: 3000 },
  ];
  assert.equal(calcTotalAccumulated(goals), 6000);
});

test('calcOverallProgress calcula progresso geral', () => {
  const goals = [
    { target_amount: 10000, current_amount: 5000 },
    { target_amount: 20000, current_amount: 5000 },
  ];
  assert.equal(calcOverallProgress(goals), 33);
});

test('calcOverallProgress retorna 0 sem metas', () => {
  assert.equal(calcOverallProgress([]), 0);
});

test('calcActiveGoals filtra ativas e pausadas', () => {
  const goals = [
    { status: 'active' },
    { status: 'paused' },
    { status: 'completed' },
    { status: 'canceled' },
  ];
  assert.equal(calcActiveGoals(goals).length, 2);
});

test('calcCompletedGoals filtra concluidas', () => {
  const goals = [
    { status: 'active' },
    { status: 'completed' },
    { status: 'completed' },
  ];
  assert.equal(calcCompletedGoals(goals).length, 2);
});

test('calcLateGoals identifica metas vencidas nao concluidas', () => {
  const goals = [
    { status: 'active', target_date: '2020-01-01', current_amount: 50, target_amount: 100 },
    { status: 'completed', target_date: '2020-01-01', current_amount: 100, target_amount: 100 },
    { status: 'active', target_date: '2030-01-01', current_amount: 50, target_amount: 100 },
  ];
  assert.equal(calcLateGoals(goals).length, 1);
});

test('getRhythmLabel retorna label em portugues', () => {
  assert.equal(getRhythmLabel('on_track'), 'no ritmo');
  assert.equal(getRhythmLabel('attention'), 'atenção');
  assert.equal(getRhythmLabel('late'), 'atrasada');
  assert.equal(getRhythmLabel('unknown'), '');
});

test('getRhythmVariant retorna variante de cor', () => {
  assert.equal(getRhythmVariant('on_track'), 'success');
  assert.equal(getRhythmVariant('attention'), 'warning');
  assert.equal(getRhythmVariant('late'), 'danger');
});

test('calcRequiredToReachGoal retorna meses necessarios com aporte planejado', () => {
  const goal = {
    current_amount: 1000,
    target_amount: 5000,
    planned_monthly_amount: 500,
  };
  assert.equal(calcRequiredToReachGoal(goal), 8);
});

test('calcRequiredToReachGoal retorna null sem aporte', () => {
  assert.equal(calcRequiredToReachGoal({ current_amount: 1000, target_amount: 5000 }), null);
});

test('calcRequiredToReachGoal retorna 0 se ja atingiu', () => {
  const goal = { current_amount: 5000, target_amount: 5000, planned_monthly_amount: 500 };
  assert.equal(calcRequiredToReachGoal(goal), 0);
});

test('calcMonthsUntilTarget calcula meses ate concluir', () => {
  const goal = {
    current_amount: 2000,
    target_amount: 10000,
    planned_monthly_amount: 1000,
    status: 'active',
  };
  assert.equal(calcMonthsUntilTarget(goal), 8);
});

test('calcMonthsUntilTarget retorna null sem aporte', () => {
  const goal = {
    current_amount: 2000,
    target_amount: 10000,
    status: 'active',
  };
  assert.equal(calcMonthsUntilTarget(goal), null);
});

test('calcMonthsUntilTarget retorna 0 para concluida', () => {
  const goal = {
    current_amount: 10000,
    target_amount: 10000,
    status: 'completed',
  };
  assert.equal(calcMonthsUntilTarget(goal), 0);
});
