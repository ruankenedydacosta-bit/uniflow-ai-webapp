// Uni Engine — Motor de Raciocínio Financeiro (Fase 15). Bloco 4:
// Inferências financeiras internas.
//
// buildFinancialInference({ snapshot, diagnostics }) produz hipóteses
// descritivas sobre o comportamento financeiro observado. Regras absolutas:
//   - NUNCA afirma — todo resultado carrega `asserts: false`;
//   - todo resultado carrega confiança, evidências e raciocínio;
//   - `appliedToDecision` permanece SEMPRE false.
//
// As regras são heurísticas determinísticas documentadas abaixo; nada aqui
// executa, escreve, recomenda ao usuário ou altera a resposta visível.
import { FINANCIAL_INFERENCE_TYPES } from '../types/financialReasoningTypes.js';

function clampConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function evidence(key, label, value) {
  return { key, label, value };
}

function buildInference({ id, type, confidence, evidences, reasoning }) {
  return {
    id,
    type: FINANCIAL_INFERENCE_TYPES.includes(type) ? type : 'maintains_pattern',
    confidence: clampConfidence(confidence),
    evidences,
    reasoning: typeof reasoning === 'string' ? reasoning : null,
    asserts: false,
    appliedToDecision: false,
  };
}

export function buildFinancialInference({ snapshot = null, diagnostics = [] } = {}) {
  const safe = snapshot && typeof snapshot === 'object' ? snapshot : null;
  if (!safe || safe.hasData !== true) {
    return [];
  }

  const inferences = [];
  const {
    income = {},
    expenses = {},
    result = {},
    flow = {},
    reserve = {},
    patrimony = {},
    creditCards = [],
  } = safe;

  const monthlyIncome = Number(income.monthly ?? 0);
  const previousIncome = Number(income.previous ?? 0);
  const monthlyExpense = Number(expenses.monthly ?? 0);
  const avgExpense = Number(expenses.average ?? 0);
  const monthlyResult = Number(result.monthly ?? 0);
  const savingsRate = Number(result.savingsRate ?? 0);
  const liquidBalance = Number(patrimony.liquid ?? 0);

  const diagnosticTypes = new Set(
    (Array.isArray(diagnostics) ? diagnostics : []).map((item) => item.type),
  );

  const lastFlow = flow.last ?? null;
  const previousFlow = flow.previous ?? null;
  const lastResult = lastFlow ? Number(lastFlow.result ?? 0) : monthlyResult;
  const previousResult = previousFlow ? Number(previousFlow.result ?? 0) : null;
  const lastIncome = lastFlow ? Number(lastFlow.income ?? 0) : monthlyIncome;
  const lastExpense = lastFlow ? Number(lastFlow.expense ?? 0) : monthlyExpense;
  const previousFlowExpense = previousFlow ? Number(previousFlow.expense ?? 0) : null;

  // 1. Economiza: resultado positivo com taxa de poupança relevante.
  if (monthlyIncome > 0 && monthlyResult > 0 && savingsRate >= 0.15) {
    const confidence = savingsRate >= 0.3 ? 0.9 : 0.8;
    inferences.push(buildInference({
      id: 'inference-saves',
      type: 'saves',
      confidence,
      evidences: [
        evidence('monthly_result', 'Resultado do mês', monthlyResult),
        evidence('savings_rate', 'Taxa de poupança', savingsRate),
      ],
      reasoning: `Resultado positivo de ${monthlyResult} com taxa de poupança de ${Math.round(savingsRate * 100)}% sugere padrão de economia no mês observado.`,
    }));
  }

  // 2. Gasta acima da média: despesa corrente acima da média da janela.
  if (avgExpense > 0 && monthlyExpense > avgExpense * 1.15) {
    const ratio = monthlyExpense / avgExpense;
    const confidence = Math.min(0.9, 0.5 + ratio / 10);
    inferences.push(buildInference({
      id: 'inference-spends_above_average',
      type: 'spends_above_average',
      confidence,
      evidences: [
        evidence('expense_current', 'Despesa do mês', monthlyExpense),
        evidence('expense_average', 'Despesa média', avgExpense),
        evidence('spending_ratio', 'Relação de gasto', ratio),
      ],
      reasoning: `A despesa corrente (${monthlyExpense}) está ${Math.round((ratio - 1) * 100)}% acima da média observada (${avgExpense}).`,
    }));
  }

  // 3. Mantém padrão: sem sinais de economia nem de gasto acima da média.
  if (!inferences.some((item) => item.type === 'saves')
    && !inferences.some((item) => item.type === 'spends_above_average')) {
    inferences.push(buildInference({
      id: 'inference-maintains_pattern',
      type: 'maintains_pattern',
      confidence: 0.6,
      evidences: [
        evidence('expense_average', 'Despesa média', avgExpense),
        evidence('monthly_result', 'Resultado do mês', monthlyResult),
      ],
      reasoning: 'Sem desvio relevante de receita ou despesa na janela observada; o padrão permanece estável.',
    }));
  }

  // 4. Risco crescente: caixa curto, dependência de crédito ou piora sequencial.
  const riskInDiagnostics = diagnosticTypes.has('cash_risk')
    || diagnosticTypes.has('credit_dependence')
    || diagnosticTypes.has('insufficient_reserve');
  const worseningResult = previousResult !== null
    && lastResult < previousResult
    && lastResult < 0;
  const creditPressure = Array.isArray(creditCards)
    && creditCards.some((card) => Number(card.utilization ?? 0) > 0.8);
  if (riskInDiagnostics || worseningResult || creditPressure) {
    inferences.push(buildInference({
      id: 'inference-risk_increasing',
      type: 'risk_increasing',
      confidence: 0.7,
      evidences: [
        evidence('cash_risk', 'Risco de caixa sinalizado', riskInDiagnostics),
        evidence('worsening_result', 'Resultado sequencial em queda', worseningResult),
        evidence('credit_pressure', 'Pressão de crédito', creditPressure),
        evidence('liquid_balance', 'Caixa líquido', liquidBalance),
      ],
      reasoning: 'Sinais de caixa curto, crédito pressionado ou resultado sequencial em queda sugerem risco crescente na janela observada.',
    }));
  }

  // 5. Tendência positiva: receita subindo sem alta de despesas na janela.
  const incomeRising = previousIncome > 0 && monthlyIncome > previousIncome;
  const expenseFlat = previousFlowExpense === null || monthlyExpense <= previousFlowExpense * 1.05;
  if (incomeRising && expenseFlat && !diagnosticTypes.has('income_decline')) {
    inferences.push(buildInference({
      id: 'inference-positive_trend',
      type: 'positive_trend',
      confidence: 0.7,
      evidences: [
        evidence('income_current', 'Receita do mês', monthlyIncome),
        evidence('income_previous', 'Receita anterior', previousIncome),
        evidence('expense_flat', 'Despesa estável', expenseFlat),
      ],
      reasoning: 'Receita corrente acima da anterior com despesa estável sugere tendência positiva na janela observada.',
    }));
  }

  // 6. Tendência negativa: receita em queda ou despesa subindo em dois meses.
  const incomeDeclining = previousIncome > 0 && lastIncome < previousIncome * 0.9;
  const expensesRising = previousFlowExpense !== null
    && lastExpense > previousFlowExpense * 1.15;
  if (incomeDeclining || (expensesRising && previousResult !== null && previousResult <= 0)) {
    inferences.push(buildInference({
      id: 'inference-negative_trend',
      type: 'negative_trend',
      confidence: 0.75,
      evidences: [
        evidence('income_declining', 'Receita em queda', incomeDeclining),
        evidence('expenses_rising', 'Despesa em alta', expensesRising),
        evidence('reserve_shortfall', 'Déficit de reserva', Number(reserve.shortfall ?? 0)),
      ],
      reasoning: 'Receita em queda ou despesa em alta na janela observada sugere tendência negativa.',
    }));
  }

  return inferences;
}