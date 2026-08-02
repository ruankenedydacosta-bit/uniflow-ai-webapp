import { createGoalConflict } from './goalContracts.js';

export function detectGoalConflict(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const goalIntent = safe.goalIntent ?? {};

  if (!goalIntent.detected) return [];

  const conflicts = [];
  const matchedTypes = Array.isArray(goalIntent.matchedTypes) ? goalIntent.matchedTypes : [];
  const distinctTypes = [...new Set(matchedTypes.filter((type) => type !== 'UNKNOWN'))];

  // Tipos que consomem recurso financeiro de forma concorrente. Tipos de
  // acumulação (SAVINGS + EMERGENCY_FUND) são compatíveis — normalmente
  // descrevem o mesmo objetivo e não geram conflito.
  const RESOURCE_TYPES = ['SAVINGS', 'EMERGENCY_FUND', 'DEBT_REDUCTION', 'DEBT_PAYOFF', 'PURCHASE', 'INVESTMENT'];
  const ACCUMULATION_TYPES = ['SAVINGS', 'EMERGENCY_FUND'];
  const BUSINESS_TYPES = ['BUSINESS', 'CASH_FLOW'];

  const resourceTypes = distinctTypes.filter((type) => RESOURCE_TYPES.includes(type));

  // Conflito de recurso: múltiplos tipos concorrentes de desembolso.
  if (
    resourceTypes.length >= 2
    && !resourceTypes.every((type) => ACCUMULATION_TYPES.includes(type))
  ) {
    conflicts.push(createGoalConflict({
      type: 'RESOURCE_CONFLICT',
      description: `Múltiplos tipos de objetivo detectados: ${distinctTypes.join(', ')}.`,
      goals: distinctTypes,
    }));
  }

  // Conflito pessoal vs empresarial: tipos pessoais e empresariais misturados
  // na mesma mensagem nunca devem ser mesclados em um único objetivo — o
  // workspace pessoal e o empresarial permanecem separados.
  const hasBusiness = distinctTypes.some((type) => BUSINESS_TYPES.includes(type));
  const hasPersonal = resourceTypes.length > 0;
  if (hasBusiness && hasPersonal) {
    conflicts.push(createGoalConflict({
      type: 'PERSONAL_VS_BUSINESS',
      description: 'Tipos pessoais e empresariais detectados simultaneamente.',
      goals: distinctTypes,
    }));
  }

  // Conflito de prioridade se houver muitos campos pendentes
  if (safe.completeness?.missing?.length > 3) {
    const hasPriority = conflicts.some((c) => c.type === 'RESOURCE_CONFLICT');
    if (!hasPriority) {
      conflicts.push(createGoalConflict({
        type: 'PRIORITY_CONFLICT',
        description: 'Muitas informações ausentes para resolver o objetivo.',
        goals: matchedTypes,
      }));
    }
  }

  return conflicts;
}