// Uni Engine — Motor de Raciocínio Financeiro (Fase 15). Bloco 5:
// Planejamento interno.
//
// buildFinancialPlanner({ snapshot, diagnostics, inferences }) produz um
// plano técnico descartável a partir dos diagnósticos e inferências.
// Garantias:
//   - NUNCA exibe nada ao usuário (`visible` permanece false);
//   - NUNCA executa qualquer ação (`executed` permanece false);
//   - objetivos, próximas ações, prioridades, oportunidades e riscos são
//     apenas estruturas internas serializáveis.
import { FINANCIAL_PLANNER_OBJECTIVES, FINANCIAL_PLANNER_ACTIONS } from '../types/financialReasoningTypes.js';

const PRIORITY_ORDER = Object.freeze({ high: 0, medium: 1, low: 2, info: 3 });

const OBJECTIVE_BY_DIAGNOSTIC = Object.freeze({
  negative_balance: 'protect_cash',
  income_decline: 'diversify_income',
  expense_growth: 'reduce_expenses',
  cash_risk: 'protect_cash',
  low_patrimony: 'build_reserve',
  credit_dependence: 'reduce_credit_dependence',
  low_liquidity: 'build_reserve',
  insufficient_reserve: 'build_reserve',
  delayed_goal: 'catch_up_goal',
});

function priorityRank(priority) {
  return PRIORITY_ORDER[priority] ?? PRIORITY_ORDER.info;
}

export function buildFinancialPlanner({ snapshot = null, diagnostics = [], inferences = [] } = {}) {
  const safe = snapshot && typeof snapshot === 'object' ? snapshot : null;
  const safeDiagnostics = Array.isArray(diagnostics) ? diagnostics : [];
  const safeInferences = Array.isArray(inferences) ? inferences : [];

  const objectivesMap = new Map();
  const rationaleMap = new Map();

  const considerObjective = ({ type, priority, rationale, evidenceKeys }) => {
    if (!FINANCIAL_PLANNER_OBJECTIVES.includes(type)) return;
    const existing = objectivesMap.get(type);
    if (!existing || priorityRank(priority) < priorityRank(existing.priority)) {
      objectivesMap.set(type, {
        type,
        priority,
        rationale,
        evidenceKeys,
        visible: false,
        executed: false,
      });
      rationaleMap.set(type, rationale);
    }
  };

  for (const diagnostic of safeDiagnostics) {
    const mapped = OBJECTIVE_BY_DIAGNOSTIC[diagnostic.type];
    if (mapped) {
      considerObjective({
        type: mapped,
        priority: diagnostic.priority,
        rationale: diagnostic.explanation,
        evidenceKeys: [diagnostic.id],
      });
    }
  }

  const inferenceTypes = new Set(safeInferences.map((item) => item.type));
  if (inferenceTypes.has('negative_trend') || inferenceTypes.has('risk_increasing')) {
    considerObjective({
      type: 'protect_cash',
      priority: 'high',
      rationale: 'Tendência negativa ou risco crescente identificado na inferência.',
      evidenceKeys: safeInferences
        .filter((item) => item.type === 'negative_trend' || item.type === 'risk_increasing')
        .map((item) => item.id),
    });
  }
  if (inferenceTypes.has('saves')) {
    considerObjective({
      type: 'increase_savings',
      priority: 'low',
      rationale: 'Padrão de economia observado pode ser mantido e ampliado.',
      evidenceKeys: safeInferences.filter((item) => item.type === 'saves').map((item) => item.id),
    });
  }
  if (safe && safe.result && Number(safe.result.monthly ?? 0) < 0) {
    considerObjective({
      type: 'increase_savings',
      priority: 'medium',
      rationale: 'Resultado mensal observado negativo ou nulo.',
      evidenceKeys: ['snapshot-result'],
    });
  }
  if (safe && safe.goals && safe.goals.length === 0) {
    considerObjective({
      type: 'build_reserve',
      priority: 'low',
      rationale: 'Nenhuma meta ativa observada; reserva ajuda a criar direção.',
      evidenceKeys: ['snapshot-goals-empty'],
    });
  }

  const objectives = [...objectivesMap.values()].sort(
    (a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.type.localeCompare(b.type),
  );

  // Próximas ações derivadas — apenas formas possíveis de endereçar objetivos.
  const actionDefinitions = Object.freeze({
    build_reserve: {
      action: 'reserve_policy',
      condition: 'existe meta de reserva derivada de saída média',
      why: 'reduz risco de caixa e baixa liquidez',
    },
    increase_savings: {
      action: 'reserve_policy',
      condition: 'resultado mensal positivo ou padrão de poupança',
      why: 'ampliar rateio interno para poupança',
    },
    diversify_income: {
      action: 'income_restore',
      condition: 'entrada corrente abaixo da anterior',
      why: 'recuperar entradas antes de pressões de saída',
    },
    reduce_expenses: {
      action: 'expense_review',
      condition: 'saída acima da média da janela',
      why: 'reduzir pressão sobre caixa',
    },
    protect_cash: {
      action: 'liquidity_review',
      condition: 'caixa curto ou risco de caixa sinalizado',
      why: 'preservar liquidez imediata',
    },
    catch_up_goal: {
      action: 'goal_review',
      condition: 'meta com ritmo atrasado',
      why: 'recolocar meta no ritmo',
    },
    reduce_credit_dependence: {
      action: 'credit_review',
      condition: 'uso de crédito elevado',
      why: 'reduzir exposição ao crédito',
    },
  });

  const nextActions = objectives.map((objective) => {
    const definition = actionDefinitions[objective.type] ?? null;
    return {
      id: `action-${objective.type}`,
      type: FINANCIAL_PLANNER_ACTIONS.includes(definition?.action) ? definition.action : 'patrimony_review',
      objective: objective.type,
      priority: objective.priority,
      target: objective.rationale,
      condition: definition?.condition ?? null,
      why: definition?.why ?? null,
      visible: false,
      executed: false,
    };
  });

  const priorities = objectives.map((objective) => ({
    type: objective.type,
    urgency: objective.priority,
  }));

  // Oportunidades: sinais positivos observados (nunca recomendações exibidas).
  const opportunities = [];
  if (safeInferences.some((item) => item.type === 'positive_trend')) {
    opportunities.push({
      id: 'opportunity-positive_trend',
      type: 'positive_trend',
      source: 'inference',
      note: 'Tendência positiva observada na janela.',
    });
  }
  if (safe && safe.creditCards && safe.creditCards.some((card) => card.available > 0)) {
    opportunities.push({
      id: 'opportunity-credit_headroom',
      type: 'credit_headroom',
      source: 'snapshot',
      note: 'Há limite de crédito disponível observado.',
    });
  }
  if (safe && safe.reserve && safe.reserve.sufficient) {
    opportunities.push({
      id: 'opportunity-reserve_health',
      type: 'reserve_health',
      source: 'snapshot',
      note: 'Reserva observada dentro da meta derivada.',
    });
  }

  // Riscos: diagnósticos que representam exposição financeira.
  const risks = safeDiagnostics
    .filter((item) => item.priority === 'high' || item.priority === 'medium')
    .map((item) => ({
      id: `risk-${item.type}`,
      type: item.type,
      priority: item.priority,
      confidence: item.confidence,
      note: item.explanation,
    }));

  return {
    visible: false,
    executed: false,
    objectives,
    nextActions,
    priorities,
    opportunities,
    risks,
  };
}
