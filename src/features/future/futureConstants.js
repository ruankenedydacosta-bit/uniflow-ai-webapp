export const SCENARIOS = {
  CONSERVATIVE: 'conservative',
  LIKELY: 'likely',
  ACCELERATED: 'accelerated',
};

export const SCENARIO_CONFIG = {
  [SCENARIOS.CONSERVATIVE]: {
    id: SCENARIOS.CONSERVATIVE,
    label: 'Conservador',
    description: 'Receita com pequena redução, despesas com pequena elevação',
    incomeAdjustment: -0.08,
    expenseAdjustment: 0.05,
    contributionAdjustment: -0.15,
  },
  [SCENARIOS.LIKELY]: {
    id: SCENARIOS.LIKELY,
    label: 'Provável',
    description: 'Baseado nas médias reais atuais',
    incomeAdjustment: 0,
    expenseAdjustment: 0,
    contributionAdjustment: 0,
  },
  [SCENARIOS.ACCELERATED]: {
    id: SCENARIOS.ACCELERATED,
    label: 'Acelerado',
    description: 'Pequena melhora de receita, pequena redução de despesas',
    incomeAdjustment: 0.08,
    expenseAdjustment: -0.05,
    contributionAdjustment: 0.15,
  },
};

export const HORIZONS = [3, 6, 12];

export const GOAL_FEASIBILITY = {
  VIABLE: 'viable',
  ATTENTION: 'attention',
  UNVIABLE: 'unviable',
};

export const GOAL_FEASIBILITY_LABEL = {
  [GOAL_FEASIBILITY.VIABLE]: 'Viável',
  [GOAL_FEASIBILITY.ATTENTION]: 'Atenção',
  [GOAL_FEASIBILITY.UNVIABLE]: 'Inviável',
};

export const GOAL_FEASIBILITY_VARIANT = {
  [GOAL_FEASIBILITY.VIABLE]: 'success',
  [GOAL_FEASIBILITY.ATTENTION]: 'warning',
  [GOAL_FEASIBILITY.UNVIABLE]: 'danger',
};
