// Uni Engine — Motor de Raciocínio Financeiro (Fase 15). Bloco 6:
// Comparador observacional (pipeline legado × motor financeiro).
//
// compareFinancialPipelines({ legacy, engineSnapshot, engineDiagnostics }) é
// puramente diagnóstico: cruza o estado que o pipeline legado observaria
// com o que o motor financeiro consolidou e detecta divergências técnicas.
//
// Garantias absolutas:
//   - nunca substitui decisões (`influenceApplied` SEMPRE false);
//   - nunca altera o pipeline legado (`legacyPreserved` SEMPRE true);
//   - sem escrita, sem rede, sem execução — objeto serializável apenas.
export function compareFinancialPipelines({
  legacy = null,
  engineSnapshot = null,
  engineDiagnostics = [],
} = {}) {
  const safeLegacy = legacy && typeof legacy === 'object' ? legacy : null;
  const safeEngine = engineSnapshot && typeof engineSnapshot === 'object' ? engineSnapshot : null;
  const safeDiagnostics = Array.isArray(engineDiagnostics) ? engineDiagnostics : [];

  const divergences = [];

  if (!safeEngine || safeEngine.hasData !== true) {
    return {
      version: '1.0',
      present: true,
      status: 'no_data',
      agreement: 0,
      divergences: [],
      summary: {
        signals: 0,
        mismatches: 0,
        legacyPreserved: true,
        influenceApplied: false,
      },
    };
  }

  if (!safeLegacy) {
    divergences.push({
      type: 'legacy_insufficient',
      severity: 'info',
      reason: 'Estado legado indisponível para comparação no turno.',
    });
  } else {
    // Divergência de números consolidados (arredondamento tolerado).
    const engineBalance = Number(safeEngine.balance?.total ?? 0);
    const engineIncome = Number(safeEngine.income?.monthly ?? 0);
    const engineExpense = Number(safeEngine.expenses?.monthly ?? 0);
    const legacyBalance = Number(safeLegacy.totalBalance ?? NaN);
    const legacyIncome = Number(safeLegacy.monthlyIncome ?? NaN);
    const legacyExpense = Number(safeLegacy.monthlyExpense ?? NaN);

    const compareFigure = ({ key, engineValue, legacyValue, label }) => {
      if (!Number.isFinite(legacyValue)) {
        divergences.push({
          type: `${key}_unavailable_in_legacy`,
          severity: 'info',
          reason: `O pipeline legado não expôs ${label} para comparação.`,
        });
        return;
      }
      if (Math.abs(engineValue - legacyValue) > 0.01) {
        divergences.push({
          type: 'financial_figure_mismatch',
          severity: 'low',
          reason: `${label} divergente entre legado (${legacyValue}) e motor (${engineValue}).`,
          figure: key,
        });
      }
    };

    compareFigure({ key: 'balance', engineValue: engineBalance, legacyValue: legacyBalance, label: 'saldo' });
    compareFigure({ key: 'income', engineValue: engineIncome, legacyValue: legacyIncome, label: 'entrada' });
    compareFigure({ key: 'expense', engineValue: engineExpense, legacyValue: legacyExpense, label: 'saída' });
  }

  // Sinais do motor que o legado ainda não sinalizaria ao usuário.
  const diagnosticTypes = new Set(safeDiagnostics.map((item) => item.type));
  const signaledHigh = (safeLegacy?.riskSignaled ?? false);
  if (diagnosticTypes.has('negative_balance') || diagnosticTypes.has('cash_risk')) {
    if (!signaledHigh) {
      divergences.push({
        type: 'negative_cash_unsignaled',
        severity: 'medium',
        reason: 'O motor sinaliza caixa negativo ou curto que o pipeline legado não sinalizou no turno.',
      });
    }
  }
  if (diagnosticTypes.has('credit_dependence') && !(safeLegacy?.creditSignaled ?? false)) {
    divergences.push({
      type: 'credit_reliance_unsignaled',
      severity: 'low',
      reason: 'O motor detecta dependência de crédito sem sinal correspondente no pipeline legado.',
    });
  }
  if (diagnosticTypes.has('delayed_goal') && !(safeLegacy?.goalSignaled ?? false)) {
    divergences.push({
      type: 'goal_rhythm_unsignaled',
      severity: 'low',
      reason: 'O motor detecta meta atrasada sem sinal correspondente no pipeline legado.',
    });
  }

  const signals = safeDiagnostics.length;
  const mismatches = divergences.filter(
    (item) => item.severity === 'low' || item.severity === 'medium',
  ).length;
  const status = divergences.length === 0 ? 'aligned' : 'divergent';
  const agreement = signals === 0 ? 1 : Math.max(0, 1 - mismatches / Math.max(signals, 1));

  return {
    version: '1.0',
    present: true,
    status,
    agreement: Number(agreement.toFixed(3)),
    divergences,
    summary: {
      signals,
      mismatches,
      legacyPreserved: true,
      influenceApplied: false,
    },
  };
}
