// Uni Engine — Motor de Raciocínio Financeiro (Fase 15). Bloco 3:
// Diagnósticos financeiros internos.
//
// buildFinancialDiagnostics(snapshot) transforma o snapshot financeiro em
// sinais estruturados: cada diagnóstico possui id, tipo, prioridade,
// confiança, evidências e explicação. São hipóteses técnicas determinísticas
// (heurísticas documentadas) — NUNCA decisões, NUNCA recomendações exibidas
// e NUNCA valores fora do contexto serializável.
//
// Regras de produção: nenhum diagnóstico afirma um fato do mundo real;
// cada um declara confiança e evidências que o sustentam.
import { FINANCIAL_DIAGNOSTIC_PRIORITIES } from '../types/financialReasoningTypes.js';

const PRIORITY_ORDER = Object.freeze({
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
});

function clampConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function evidence(key, label, value) {
  return { key, label, value };
}

function buildDiagnostic({ id, type, priority, confidence, evidences, explanation }) {
  return {
    id,
    type,
    priority: FINANCIAL_DIAGNOSTIC_PRIORITIES.includes(priority) ? priority : 'info',
    confidence: clampConfidence(confidence),
    evidences: evidences ?? [],
    explanation: typeof explanation === 'string' ? explanation : null,
  };
}

export function buildFinancialDiagnostics(snapshot) {
  const safe = snapshot && typeof snapshot === 'object' ? snapshot : null;
  if (!safe || safe.hasData !== true) {
    return [];
  }

  const diagnostics = [];
  const {
    balance = {},
    income = {},
    expenses = {},
    result = {},
    reserve = {},
    patrimony = {},
    flow = {},
    creditCards = [],
    goals = [],
    recurring = [],
    latestEvents = [],
  } = safe;

  const totalBalance = Number(balance.total ?? 0);
  const monthlyIncome = Number(income.monthly ?? 0);
  const previousIncome = Number(income.previous ?? 0);
  const monthlyExpense = Number(expenses.monthly ?? 0);
  const avgExpense = Number(expenses.average ?? 0);
  const monthlyResult = Number(result.monthly ?? 0);
  const liquidBalance = Number(patrimony.liquid ?? 0);
  const netPatrimony = Number(patrimony.net ?? 0);
  const reserveCurrent = Number(reserve.current ?? 0);
  const reserveTarget = Number(reserve.target ?? 0);
  const reserveShortfall = Number(reserve.shortfall ?? 0);

  // 1. Saldo negativo.
  if (totalBalance < 0) {
    diagnostics.push(buildDiagnostic({
      id: 'diag-negative_balance',
      type: 'negative_balance',
      priority: 'high',
      confidence: 0.95,
      evidences: [
        evidence('total_balance', 'Saldo total', totalBalance),
      ],
      explanation: 'O saldo total consolidado está negativo.',
    }));
  }

  // 2. Queda de receita (mês corrente vs mês anterior).
  if (previousIncome > 0 && monthlyIncome < previousIncome * 0.8) {
    const ratio = monthlyIncome / previousIncome;
    diagnostics.push(buildDiagnostic({
      id: 'diag-income_decline',
      type: 'income_decline',
      priority: ratio < 0.6 ? 'high' : 'medium',
      confidence: 0.7,
      evidences: [
        evidence('income_current', 'Entrada do mês', monthlyIncome),
        evidence('income_previous', 'Entrada anterior', previousIncome),
        evidence('decline_ratio', 'Relação entre entradas', ratio),
      ],
      explanation: 'A entrada do mês corrente é inferior a 80% da entrada do mês anterior.',
    }));
  }

  // 3. Crescimento de despesas (mês corrente vs média da janela).
  if (avgExpense > 0 && monthlyExpense > avgExpense * 1.2) {
    const ratio = monthlyExpense / avgExpense;
    diagnostics.push(buildDiagnostic({
      id: 'diag-expense_growth',
      type: 'expense_growth',
      priority: ratio > 1.5 ? 'high' : 'medium',
      confidence: 0.65,
      evidences: [
        evidence('expense_current', 'Saída do mês', monthlyExpense),
        evidence('expense_average', 'Saída média', avgExpense),
        evidence('growth_ratio', 'Relação entre saídas', ratio),
      ],
      explanation: 'A saída do mês corrente supera em mais de 20% a média da janela observada.',
    }));
  }

  // 4. Despesas recorrentes (presença de compromissos recorrentes).
  if (Array.isArray(recurring) && recurring.length >= 3) {
    diagnostics.push(buildDiagnostic({
      id: 'diag-recurring_expenses',
      type: 'recurring_expenses',
      priority: 'info',
      confidence: 0.75,
      evidences: [
        evidence('recurring_count', 'Lançamentos recorrentes', recurring.length),
      ],
      explanation: 'Existem lançamentos recorrentes identificados na janela observada.',
    }));
  }

  // 5. Despesa anormal (valor único desproporcional à receita do mês).
  if (monthlyIncome > 0 && Array.isArray(latestEvents) && latestEvents.length > 0) {
    const largestExpense = latestEvents
      .filter((event) => event.type === 'expense')
      .reduce((max, event) => Math.max(max, Number(event.amount ?? 0)), 0);
    if (largestExpense > monthlyIncome * 0.5) {
      diagnostics.push(buildDiagnostic({
        id: 'diag-abnormal_expenses',
        type: 'abnormal_expenses',
        priority: 'medium',
        confidence: 0.6,
        evidences: [
          evidence('largest_expense', 'Maior saída', largestExpense),
          evidence('income_current', 'Entrada do mês', monthlyIncome),
          evidence('proportion', 'Proporção da entrada', largestExpense / monthlyIncome),
        ],
        explanation: 'Há uma saída individual com valor superior à metade da entrada do mês.',
      }));
    }
  }

  // 6. Risco de caixa (liquidez imediata insuficiente para o mês corrente).
  if (liquidBalance < monthlyExpense || (totalBalance < 0 && liquidBalance <= 0)) {
    diagnostics.push(buildDiagnostic({
      id: 'diag-cash_risk',
      type: 'cash_risk',
      priority: liquidBalance <= 0 ? 'high' : 'medium',
      confidence: 0.8,
      evidences: [
        evidence('liquid_balance', 'Caixa líquido', liquidBalance),
        evidence('expense_current', 'Saída do mês', monthlyExpense),
      ],
      explanation: 'O caixa líquido observado é insuficiente para cobrir a saída do mês corrente.',
    }));
  }

  // 7. Baixo patrimônio (patrimônio líquido observado não positivo).
  if (netPatrimony <= 0) {
    diagnostics.push(buildDiagnostic({
      id: 'diag-low_patrimony',
      type: 'low_patrimony',
      priority: 'medium',
      confidence: 0.7,
      evidences: [
        evidence('net_patrimony', 'Patrimônio líquido', netPatrimony),
        evidence('debts', 'Dívidas', Number(patrimony.debts ?? 0)),
      ],
      explanation: 'O patrimônio líquido observado não é positivo na janela atual.',
    }));
  }

  // 8. Dependência de crédito (uso do limite em algum cartão).
  if (Array.isArray(creditCards) && creditCards.length > 0) {
    const maxUtilization = creditCards.reduce(
      (max, card) => Math.max(max, Number(card.utilization ?? 0)),
      0,
    );
    if (maxUtilization > 0.5) {
      diagnostics.push(buildDiagnostic({
        id: 'diag-credit_dependence',
        type: 'credit_dependence',
        priority: maxUtilization > 0.8 ? 'high' : 'medium',
        confidence: 0.7,
        evidences: [
          evidence('max_utilization', 'Maior uso de limite', maxUtilization),
          evidence('cards_with_usage', 'Cartões com uso', creditCards.filter((card) => card.usage > 0).length),
        ],
        explanation: 'O uso de limite de crédito observado ultrapassa a metade do limite disponível.',
      }));
    }
  }

  // 9. Baixa liquidez (caixa abaixo da meta de 1–2 meses de despesa média).
  if (avgExpense > 0 && liquidBalance < avgExpense * 2) {
    const coverage = liquidBalance / avgExpense;
    diagnostics.push(buildDiagnostic({
      id: 'diag-low_liquidity',
      type: 'low_liquidity',
      priority: coverage < 1 ? 'high' : 'medium',
      confidence: 0.75,
      evidences: [
        evidence('liquid_balance', 'Caixa líquido', liquidBalance),
        evidence('expense_average', 'Saída média', avgExpense),
        evidence('coverage_months', 'Meses de cobertura', coverage),
      ],
      explanation: 'O caixa líquido cobre menos de dois meses de saída média observada.',
    }));
  }

  // 10. Reserva insuficiente (abaixo da meta derivada de N meses).
  if (reserveTarget > 0 && reserveShortfall > 0) {
    diagnostics.push(buildDiagnostic({
      id: 'diag-insufficient_reserve',
      type: 'insufficient_reserve',
      priority: reserveShortfall > reserveTarget * 0.5 ? 'high' : 'medium',
      confidence: 0.7,
      evidences: [
        evidence('reserve_current', 'Reserva corrente', reserveCurrent),
        evidence('reserve_target', 'Reserva alvo', reserveTarget),
        evidence('reserve_shortfall', 'Diferença da reserva', reserveShortfall),
      ],
      explanation: 'A reserva corrente observada está abaixo da meta derivada de saída média.',
    }));
  }

  // 11. Meta atrasada (ritmo de alguma meta ativa como 'late').
  const lateGoals = (Array.isArray(goals) ? goals : []).filter((goal) => goal.rhythm === 'late');
  if (lateGoals.length > 0) {
    diagnostics.push(buildDiagnostic({
      id: 'diag-delayed_goal',
      type: 'delayed_goal',
      priority: 'medium',
      confidence: 0.8,
      evidences: [
        evidence('late_goal_count', 'Metas atrasadas', lateGoals.length),
        evidence('late_goal_names', 'Metas atrasadas (nomes)', lateGoals.map((goal) => goal.name).filter(Boolean)),
      ],
      explanation: 'Existem metas ativas com ritmo de progresso atrasado.',
    }));
  }

  // Ordena por prioridade (high → info) e depois por confiança decrescente.
  return diagnostics.sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      || b.confidence - a.confidence,
  );
}
