export function estimateGoalProgress(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const goal = safe.goal ?? {};
  const snapshot = safe.financialSnapshot ?? {};
  const completeness = safe.completeness ?? {};
  const goalIntent = safe.goalIntent ?? {};

  if (!goalIntent.detected) return null;

  const targetAmount = goal.target?.amount ?? goal.targetAmount;
  if (targetAmount == null || targetAmount <= 0) return null;

  const available = completeness?.available ?? [];
  if (!available.includes('financial_snapshot')) return null;

  const totalBalance = snapshot.totalBalance;
  if (totalBalance == null || totalBalance <= 0) return null;

  // Não interpretar saldo total como progresso irrestrito
  // Progresso só faz sentido se há outras evidências de aporte direcionado
  const hasMemory = available.includes('memory');

  if (!hasMemory && targetAmount > 0) {
    return null;
  }

  const progress = Math.min(100, Math.max(0, (totalBalance / targetAmount) * 100));
  return Math.round(progress);
}