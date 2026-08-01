// Métricas de Concordância do Uni Engine (Fase 2).
//
// Métricas determinísticas da rodada: concordância, falso positivo, falso
// negativo, contexto recuperado, ambiguidade detectada, referência implícita
// resolvida, mudança de assunto e latência.
//
// Definições (Shadow Mode — nada altera o pipeline):
//   - agreement: motor e pipeline chegaram ao mesmo desfecho observável.
//   - falsePositive: motor sinalizou divergência/risco, mas o pipeline
//     entregou resultado 'ready' com a MESMA intenção → alarme desnecessário.
//   - falseNegative: motor concordou (sem pergunta pendente), mas o pipeline
//     precisou de esclarecimento/errou → o motor não enxergou o problema.
//   - contextRecovered: referência implícita resolvida com contexto local.
//   - ambiguityDetected: qualquer ambiguidade classificada pelo motor.
//   - implicitReferenceResolved: referência implícita resolvida nesta rodada.
//   - contextSwitch: mudança de assunto detectada pelo contexto cognitivo.

function pipelineNotReady(resultType) {
  return resultType === 'needs_clarification'
    || resultType === 'error'
    || resultType === 'blocked';
}

function enginePredictedReady(plan) {
  const decision = plan?.decision;
  return decision === 'respond' || decision === 'confirm' || decision === 'execute';
}

export function computeAgreementMetrics(options = {}) {
  const comparison = options.comparison ?? null;
  const classification = options.classification ?? null;
  const plan = options.plan ?? null;
  const referenceResolution = options.referenceResolution ?? null;
  const cognitiveContext = options.cognitiveContext ?? null;
  const pipeline = options.pipeline ?? null;
  const divergences = options.divergences ?? null;
  const latencyMs = options.latencyMs ?? null;

  const safeComparison = comparison ?? {};
  const safeClassification = classification ?? {};
  const resultType = pipeline?.resultType ?? 'unknown';
  const status = safeComparison.status ?? 'engine_unknown';

  const agreement = status === 'agreement';

  const falsePositive = Boolean(
    status !== 'agreement'
    && status !== 'pipeline_unknown'
    && resultType === 'ready'
    && pipeline?.detectedIntent
    && pipeline.detectedIntent === safeClassification.primaryIntent,
  );

  const falseNegative = Boolean(
    agreement
    && pipelineNotReady(resultType)
    && enginePredictedReady(plan)
    && (plan?.missingFields?.length ?? 0) === 0,
  );

  const ambiguityDetected = Boolean(
    safeClassification.ambiguity
    || (Array.isArray(plan?.ambiguities) && plan.ambiguities.length > 0),
  );

  return {
    agreement,
    comparisonStatus: status,
    falsePositive,
    falseNegative,
    contextRecovered: Boolean(
      referenceResolution?.resolved
      && referenceResolution.source !== 'user_message',
    ),
    ambiguityDetected,
    implicitReferenceResolved: Boolean(referenceResolution?.resolved),
    contextSwitch: Boolean(cognitiveContext?.subjectChanged),
    divergenceCount: Array.isArray(divergences) ? divergences.length : 0,
    latencyMs: typeof latencyMs === 'number' ? Number(latencyMs.toFixed(2)) : null,
  };
}
