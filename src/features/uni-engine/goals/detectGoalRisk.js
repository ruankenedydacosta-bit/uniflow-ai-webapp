import { createGoalRisk } from './goalContracts.js';

export function detectGoalRisk(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const goalIntent = safe.goalIntent ?? {};
  const completeness = safe.completeness ?? {};
  const feasibility = safe.feasibility ?? 'UNKNOWN';
  const snapshot = safe.financialSnapshot ?? {};
  const goal = safe.goal ?? {};
  const conflicts = Array.isArray(safe.conflicts) ? safe.conflicts : [];

  if (!goalIntent.detected) return [];

  const risks = [];

  // Dados insuficientes
  if (feasibility === 'INSUFFICIENT_DATA' || feasibility === 'UNKNOWN') {
    risks.push(createGoalRisk({
      type: 'INSUFFICIENT_DATA',
      description: 'Dados insuficientes para avaliar viabilidade do objetivo.',
    }));
  }

  // Meta irrealista: valor alvo >> saldo. Só é acusado para objetivos de
  // desembolso único (compra, investimento, quitação de dívida) SEM prazo —
  // objetivos de acumulação (poupança, emergência) têm aportes ao longo do
  // tempo e não podem ser julgados sem dados de renda (nunca inventados).
  const targetAmount = goal.target?.amount ?? goal.targetAmount;
  const snapshotBalance = snapshot.totalBalance;
  const singleShotTypes = ['PURCHASE', 'INVESTMENT', 'DEBT_PAYOFF', 'DEBT_REDUCTION'];
  const hasHorizon = typeof goal.target?.horizonMonths === 'number' && goal.target.horizonMonths > 0;
  if (
    targetAmount && targetAmount > 0
    && snapshotBalance != null && snapshotBalance >= 0
    && singleShotTypes.includes(goal.type)
    && !hasHorizon
    && targetAmount > snapshotBalance * 10
  ) {
    risks.push(createGoalRisk({
      type: 'UNREALISTIC_TARGET',
      description: 'Valor alvo muito acima do saldo atual disponível.',
    }));
  }

  // Dependências em cascata
  if (completeness?.missing?.length > 2 && conflicts.length > 0) {
    risks.push(createGoalRisk({
      type: 'DEPENDENCY_CASCADE',
      description: 'Múltiplas dependências pendentes com conflitos ativos.',
    }));
  }

  // Conflitos ativos
  if (conflicts.length > 0) {
    risks.push(createGoalRisk({
      type: 'CONFLICTING_GOALS',
      description: `${conflicts.length} conflito(s) detectado(s) entre objetivos.`,
    }));
  }

  if (risks.length === 0 && goalIntent.detected) {
    risks.push(createGoalRisk({ type: 'NONE', description: 'Nenhum risco crítico detectado.' }));
  }

  return risks;
}