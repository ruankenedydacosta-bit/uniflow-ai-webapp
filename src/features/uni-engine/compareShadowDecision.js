// Comparação em Shadow Mode do Uni Engine (Fase 1).
//
// Compara a decisão do Uni Engine com a decisão observável do pipeline
// atual. O comparador é PURAMENTE DIAGNÓSTICO: nunca altera nenhum
// resultado, nunca influencia o pipeline.
const ACTION_QUERY_SET = new Set(['action', 'query']);

function derivePipelineMessageType(pipeline) {
  if (pipeline.pendingActive) return 'pending_reply';
  const detected = pipeline.detectedIntent;
  if (detected === 'register_income'
    || detected === 'register_expense'
    || detected === 'register_transfer'
    || detected === 'set_balance'
    || detected === 'ambiguous_balance_or_income'
    || detected === 'create_goal') {
    return 'action';
  }
  if (detected === 'check_balance' || detected === 'forecast') return 'query';
  return 'unknown';
}

function severityFor(status) {
  switch (status) {
    case 'agreement':
      return 'low';
    case 'confidence_gap':
      return 'low';
    case 'missing_field_divergence':
      return 'medium';
    case 'intent_divergence':
    case 'pending_context_divergence':
    case 'action_query_divergence':
      return 'high';
    default:
      return 'medium';
  }
}

export function compareShadowDecision(engine, pipeline) {
  const safeEngine = engine && typeof engine === 'object' ? engine : {};
  const safePipeline = pipeline && typeof pipeline === 'object' ? pipeline : {};

  if (!safeEngine.classification) {
    return {
      status: 'engine_unknown',
      engineIntent: null,
      pipelineIntent: safePipeline.detectedIntent ?? null,
      severity: 'medium',
      reasons: ['engine_no_classification'],
    };
  }

  const pipelineMessageType = derivePipelineMessageType(safePipeline);
  const engineMessageType = safeEngine.classification.messageType;
  const engineIntent = safeEngine.classification.primaryIntent;
  const pipelineIntent = safePipeline.pendingActive
    ? safePipeline.pendingIntent ?? safePipeline.detectedIntent
    : safePipeline.detectedIntent;

  // Divergência de contexto de pendência: o motor viu ação nova explícita
  // enquanto o pipeline ainda tratava a entrada como resposta à pendência.
  if (
    safePipeline.pendingActive
    && engineMessageType === 'action'
    && pipelineIntent
    && pipelineIntent !== engineIntent
    && !['cancel_pending', 'confirm_pending', 'small_talk'].includes(engineIntent)
  ) {
    return {
      status: 'pending_context_divergence',
      engineIntent,
      pipelineIntent,
      severity: 'high',
      reasons: ['engine_new_explicit_action', 'pipeline_treats_as_pending_reply'],
    };
  }

  // Divergência ação × consulta.
  if (
    ACTION_QUERY_SET.has(engineMessageType)
    && ACTION_QUERY_SET.has(pipelineMessageType)
    && engineMessageType !== pipelineMessageType
  ) {
    return {
      status: 'action_query_divergence',
      engineIntent,
      pipelineIntent,
      severity: 'high',
      reasons: [`engine_${engineMessageType}`, `pipeline_${pipelineMessageType}`],
    };
  }

  // Divergência de intenção (ambos ação).
  if (
    engineMessageType === 'action'
    && pipelineMessageType === 'action'
    && engineIntent
    && pipelineIntent
    && engineIntent !== pipelineIntent
  ) {
    return {
      status: 'intent_divergence',
      engineIntent,
      pipelineIntent,
      severity: 'high',
      reasons: ['engine_intent_differs_from_pipeline'],
    };
  }

  // Divergência de campo ausente: o motor pergunta por um campo enquanto o
  // pipeline seguiu adiante como se tudo estivesse pronto.
  if (
    safeEngine.plan?.decision === 'ask'
    && (safeEngine.plan?.missingFields?.length ?? 0) > 0
    && (pipelineMessageType === 'action' || pipelineMessageType === 'pending_reply')
    && safePipeline.resultType === 'ready'
  ) {
    return {
      status: 'missing_field_divergence',
      engineIntent,
      pipelineIntent,
      severity: 'medium',
      reasons: ['engine_missing_fields', 'pipeline_ready'],
    };
  }

  // Lacuna de confiança: intenções concordam, mas a confiança do motor é
  // baixa o suficiente para exigir pergunta.
  if (
    engineMessageType === pipelineMessageType
    && engineIntent === pipelineIntent
    && safeEngine.classification.confidence < 0.6
  ) {
    return {
      status: 'confidence_gap',
      engineIntent,
      pipelineIntent,
      severity: 'low',
      reasons: ['low_engine_confidence'],
    };
  }

  // Pipeline sem informação observável.
  if (pipelineMessageType === 'unknown' && !safePipeline.pendingActive) {
    return {
      status: 'pipeline_unknown',
      engineIntent,
      pipelineIntent,
      severity: 'medium',
      reasons: ['pipeline_outcome_not_observable'],
    };
  }

  // Concordância.
  return {
    status: 'agreement',
    engineIntent,
    pipelineIntent,
    severity: severityFor('agreement'),
    reasons: [
      `engine_${engineMessageType}`,
      `pipeline_${pipelineMessageType}`,
      engineIntent === pipelineIntent ? 'same_intent' : 'compatible_outcomes',
    ],
  };
}
