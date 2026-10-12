const RHYTHM_STATUS = { ON_TRACK: 'on_track', ATTENTION: 'attention', LATE: 'late' };

export function getGoalStatus(goal) {
  if (goal.status === 'completed') return 'completed';
  if (goal.status === 'canceled') return 'canceled';
  if (goal.status === 'paused') return 'paused';
  if (goal.archived_at) return 'archived';
  return 'active';
}

export function calcProgress(current, target) {
  if (!target || target <= 0) return 0;
  return Math.min(Math.round((Math.max(current, 0) / target) * 100), 100);
}

export function calcRemaining(current, target) {
  const remaining = target - Math.max(current, 0);
  return Math.max(remaining, 0);
}

export function calcMonthsBetween(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (start >= end) return 1;
  const months = (end.getFullYear() - start.getFullYear()) * 12
    + (end.getMonth() - start.getMonth());
  return Math.max(months, 1);
}

export function calcRequiredMonthlyAmount(goal) {
  const remaining = calcRemaining(goal.current_amount, goal.target_amount);
  if (remaining <= 0) return 0;
  if (goal.target_date) {
    const monthsLeft = calcRemainingMonths(goal.target_date);
    if (monthsLeft !== null && monthsLeft > 0) return remaining / monthsLeft;
  }
  if (goal.planned_monthly_amount) return goal.planned_monthly_amount;
  return null;
}

// "2026-12-01" vira meia-noite local, não UTC. Com `new Date(texto)` a data
// pura cai no dia anterior em Brasília e o alvo de dezembro vira novembro.
export function lerData(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  const dataPura = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (dataPura) return new Date(Number(dataPura[1]), Number(dataPura[2]) - 1, Number(dataPura[3]));
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

// Meses cheios entre duas datas.
export function mesesEntre(inicio, fim) {
  const de = lerData(inicio);
  const ate = lerData(fim);
  if (!de || !ate || ate <= de) return 0;
  let meses = (ate.getFullYear() - de.getFullYear()) * 12 + (ate.getMonth() - de.getMonth());
  if (ate.getDate() < de.getDate()) meses -= 1;
  return Math.max(meses, 0);
}

// A data-alvo vale o dia inteiro: a meta só vence no dia seguinte.
function venceu(alvo, hoje) {
  return hoje >= new Date(alvo.getFullYear(), alvo.getMonth(), alvo.getDate() + 1);
}

// Meses de aporte que ainda cabem até a data-alvo, contando o mês do prazo
// como o último: de outubro até março são 5, como na criação da meta
// (#156). Data-alvo vencida dá 0.
export function calcRemainingMonths(targetDate, hoje = new Date()) {
  const alvo = lerData(targetDate);
  if (!alvo) return null;
  if (venceu(alvo, hoje)) return 0;
  const meses = (alvo.getFullYear() - hoje.getFullYear()) * 12 + (alvo.getMonth() - hoje.getMonth());
  return Math.max(meses, 1);
}

// Progresso esperado pelo tempo, em meses cheios desde o início. Contado
// por dia, a meta criada hoje sem nada guardado já nascia em Atenção.
export function calcExpectedProgress(goal, hoje = new Date()) {
  if (!goal.start_date || !goal.target_date) return null;
  if (goal.status === 'completed') return 100;
  const start = lerData(goal.start_date);
  const end = lerData(goal.target_date);
  if (!start || !end) return null;
  if (venceu(end, hoje)) return 100;
  if (hoje <= start) return 0;
  // O plano vai até o fim do dia da data-alvo: de 1º de janeiro a 31 de
  // dezembro são 12 meses.
  const fimDoPlano = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  const mesesDoPlano = Math.max(mesesEntre(start, fimDoPlano), 1);
  return Math.min(Math.round((mesesEntre(start, hoje) / mesesDoPlano) * 100), 100);
}

// Ritmo pelo plano: quanto do que falta os aportes planejados até a data
// não cobrem, em meses de aporte. Até um mês atrás é Atenção; mais que
// isso, Atrasada. Assim o ajuste do plano (#159) põe a meta de volta no
// ritmo. Meta sem valor por mês planejado segue o progresso esperado.
function ritmoPeloPlano(goal, hoje) {
  const planejado = Number(goal.planned_monthly_amount);
  if (!(planejado > 0)) return undefined;
  const meses = calcRemainingMonths(goal.target_date, hoje);
  if (!meses) return undefined;
  const faltaEmCentavos = Math.round(calcRemaining(Number(goal.current_amount || 0), Number(goal.target_amount || 0)) * 100);
  const descoberto = faltaEmCentavos - Math.round(planejado * 100) * meses;
  if (descoberto <= 0) return RHYTHM_STATUS.ON_TRACK;
  return descoberto <= Math.round(planejado * 100) ? RHYTHM_STATUS.ATTENTION : RHYTHM_STATUS.LATE;
}

export function calcRhythmStatus(goal, hoje = new Date()) {
  if (goal.status === 'completed' || goal.status === 'canceled') return null;
  const expected = calcExpectedProgress(goal, hoje);
  if (expected === null) return null;
  const alvo = lerData(goal.target_date);
  // Vencida: o percentual arredondado mostraria 100% faltando centavos.
  if (alvo && venceu(alvo, hoje)) {
    if (calcRemaining(Number(goal.current_amount || 0), Number(goal.target_amount || 0)) > 0) return RHYTHM_STATUS.LATE;
    return RHYTHM_STATUS.ON_TRACK;
  }
  const peloPlano = ritmoPeloPlano(goal, hoje);
  if (peloPlano) return peloPlano;
  const progress = calcProgress(goal.current_amount, goal.target_amount);
  if (progress >= expected) return RHYTHM_STATUS.ON_TRACK;
  const deficit = expected - progress;
  if (deficit <= 15) return RHYTHM_STATUS.ATTENTION;
  return RHYTHM_STATUS.LATE;
}

export function getRhythmLabel(status) {
  const labels = {
    on_track: 'no ritmo',
    attention: 'atenção',
    late: 'atrasada',
  };
  return labels[status] || '';
}

export function getRhythmVariant(status) {
  const variants = {
    on_track: 'success',
    attention: 'warning',
    late: 'danger',
  };
  return variants[status] || 'default';
}

export function calcTotalPlanned(goals) {
  return goals.reduce((sum, g) => sum + Number(g.target_amount || 0), 0);
}

export function calcTotalAccumulated(goals) {
  return goals.reduce((sum, g) => sum + Number(g.current_amount || 0), 0);
}

export function calcOverallProgress(goals) {
  const total = calcTotalPlanned(goals);
  const accrued = calcTotalAccumulated(goals);
  return calcProgress(accrued, total);
}

export function calcActiveGoals(goals) {
  return goals.filter((g) => g.status === 'active' || g.status === 'paused');
}

export function calcCompletedGoals(goals) {
  return goals.filter((g) => g.status === 'completed');
}

export function calcLateGoals(goals) {
  return goals.filter((g) => {
    if (g.status === 'completed' || g.status === 'canceled') return false;
    if (!g.target_date) return false;
    return new Date(g.target_date) < new Date()
      && calcProgress(g.current_amount, g.target_amount) < 100;
  });
}

export function calcRequiredToReachGoal(goal) {
  if (!goal.planned_monthly_amount || goal.planned_monthly_amount <= 0) return null;
  const remaining = calcRemaining(goal.current_amount, goal.target_amount);
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / goal.planned_monthly_amount);
}

export function calcMonthsUntilTarget(goal) {
  if (goal.status === 'completed') return 0;
  const remaining = calcRemaining(goal.current_amount, goal.target_amount);
  if (remaining <= 0) return 0;
  const monthly = goal.planned_monthly_amount || calcRequiredMonthlyAmount(goal);
  if (!monthly || monthly <= 0) return null;
  return Math.ceil(remaining / monthly);
}
