// Sugestões Estruturadas para o Pipeline (Fase 2 — Integração Cognitiva
// Assistida).
//
// O Uni Engine NÃO executa nada; ele apenas PRODUZ inteligência. Este módulo
// empacota a recomendação em um objeto estruturado pronto para consumo pelo
// pipeline atual:
//
//   {
//     recommendedIntent,
//     recommendedExecutor,
//     recommendedQuestion,
//     missingFields,
//     confidence,
//     risk,
//     reason,
//   }
//
// Nesta fase a sugestão NÃO é utilizada automaticamente — somente
// disponibilizada como saída diagnóstica do motor.

function buildReason({ plan, classification }) {
  const decision = plan?.decision ?? null;
  const missing = Array.isArray(plan?.missingData) && plan.missingData.length > 0
    ? plan.missingData
    : (plan?.missingFields ?? []).map((field) => ({ field }));
  switch (decision) {
    case 'ask': {
      const fields = missing.map((entry) => entry.field).join(', ');
      return fields
        ? `Faltam dados (${fields}); recomenda-se perguntar antes de prosseguir.`
        : 'Ambiguidade detectada; recomenda-se perguntar para desambiguar.';
    }
    case 'confirm':
      return 'Ação completa; recomenda-se confirmar com o usuário antes da execução.';
    case 'respond':
      if (classification?.messageType === 'query') {
        return 'Consulta identificada; recomenda-se responder com dados do FinancialQueryEngine.';
      }
      if (classification?.messageType === 'small_talk') {
        return 'Mensagem social; recomenda-se responder normalmente.';
      }
      return 'Resposta direta; recomenda-se responder ao usuário.';
    case 'cancel':
      return 'Cancelamento explícito; recomenda-se encerrar a pendência sem executar nada.';
    case 'reject':
      return 'Ação bloqueada por segurança; recomenda-se não executar e explicar o bloqueio.';
    case 'defer':
      return 'Contexto insuficiente; recomenda-se aguardar mais informação.';
    default:
      return 'Nenhuma ação recomendada nesta rodada.';
  }
}

export function buildEngineSuggestions(options = {}) {
  const classification = options.classification ?? null;
  const plan = options.plan ?? null;
  const referenceResolution = options.referenceResolution ?? null;

  const safeClassification = classification ?? {};
  const safePlan = plan ?? {};
  const missingFields = Array.isArray(safePlan.missingFields) ? safePlan.missingFields : [];

  const suggestion = {
    recommendedIntent: safeClassification.primaryIntent ?? null,
    recommendedExecutor: safePlan.executorExpected ?? safePlan.theoreticalExecutor ?? null,
    recommendedQuestion: safePlan.nextQuestion?.text ?? null,
    missingFields,
    confidence:
      typeof safeClassification.confidence === 'number'
        ? Number(safeClassification.confidence.toFixed(3))
        : null,
    risk: safePlan.risk?.level ?? 'low',
    reason: buildReason({ plan: safePlan, classification: safeClassification }),
    alternatives: Array.isArray(safePlan.alternatives) ? safePlan.alternatives : [],
  };

  if (referenceResolution?.resolved && referenceResolution.resolution) {
    suggestion.implicitContext = {
      resolved: true,
      type: referenceResolution.referenceType,
      value: referenceResolution.resolution.description
        ?? referenceResolution.resolution.value
        ?? null,
      source: referenceResolution.resolution.source,
    };
  } else if (referenceResolution?.hasReference) {
    suggestion.implicitContext = {
      resolved: false,
      type: 'none',
      value: null,
      source: 'unresolved',
    };
  }

  return suggestion;
}
