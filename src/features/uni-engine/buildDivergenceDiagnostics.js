// Diagnóstico de Divergências do Uni Engine (Fase 2).
//
// Traduz as divergências observadas entre o Uni Engine e o pipeline atual em
// entradas de diagnóstico estruturadas e legíveis, por exemplo:
//
//   "Pipeline pediu conta. Engine detectou que a conta já estava implícita."
//   "Pipeline iniciou nova pendência. Engine detectou mudança de assunto."
//   "Pipeline respondeu consulta. Engine detectou intenção de ação."
//
// REGRA ABSOLUTA: o diagnóstico é PURAMENTE informativo. Nunca altera o
// comportamento do pipeline, nunca bloqueia nada, nunca executa nada.
import { UNI_ENGINE_DIVERGENCE_TYPES } from './uniEngineContracts.js';

function pipelineAwaitedField(input, analyzed) {
  const pendingAction = input?.context?.pendingAction ?? null;
  const pending = analyzed?.pending ?? {};
  return pending.awaitedField
    ?? pendingAction?.pendingField
    ?? (Array.isArray(pendingAction?.issues) && pendingAction.issues.length > 0
      ? pendingAction.issues[0].field
      : null);
}

function fieldLabel(field) {
  const labels = {
    account: 'conta',
    destinationAccount: 'conta de destino',
    amount: 'valor',
    category: 'categoria',
    description: 'descrição',
    date: 'data',
    intent: 'intenção',
  };
  return labels[field] ?? field ?? 'campo';
}

function buildEntry(type, severity, pipelineObservation, engineDetection, evidence) {
  return {
    type,
    severity,
    pipelineObservation,
    engineDetection,
    description: `${pipelineObservation} ${engineDetection}`,
    impact: 'none',
    evidence,
  };
}

export function buildDivergenceDiagnostics(options = {}) {
  const comparison = options.comparison ?? null;
  const classification = options.classification ?? null;
  const plan = options.plan ?? null;
  const referenceResolution = options.referenceResolution ?? null;
  const cognitiveContext = options.cognitiveContext ?? null;
  const analyzed = options.analyzed ?? null;
  const input = options.input ?? null;
  const memory = options.memory ?? null;

  const safeClassification = classification ?? {};
  const safeComparison = comparison ?? {};
  const diagnostics = [];

  // 1. Pipeline pediu um campo que o motor resolveu implicitamente.
  const awaitedField = pipelineAwaitedField(input, analyzed);
  if (
    awaitedField
    && referenceResolution?.resolved
    && referenceResolution.resolution
  ) {
    const resolvedType = referenceResolution.referenceType;
    const fieldMatches = resolvedType === 'account'
      ? awaitedField === 'account' || awaitedField === 'destinationAccount'
      : resolvedType === 'value'
        ? awaitedField === 'amount'
        : true;
    if (fieldMatches) {
      const label = fieldLabel(awaitedField);
      diagnostics.push(buildEntry(
        'pipeline_asked_known_field',
        'low',
        `Pipeline pediu ${label}.`,
        `Engine detectou que ${label} já estava implícita (${referenceResolution.resolution.source}).`,
        {
          awaitedField,
          resolutionType: resolvedType,
          resolutionSource: referenceResolution.resolution.source,
          confidence: referenceResolution.confidence,
        },
      ));
    }
  }

  // 2. Pipeline iniciou nova pendência enquanto o motor detectou mudança de assunto.
  if (
    (safeClassification.messageType === 'action' || analyzed?.pending?.exists)
    && cognitiveContext?.subjectChanged
  ) {
    diagnostics.push(buildEntry(
      'context_switch_new_pending',
      'medium',
      'Pipeline iniciou nova pendência.',
      'Engine detectou mudança de assunto.',
      {
        fromSubject: memory?.lastSubject ?? null,
        toSubject: cognitiveContext.currentSubject,
      },
    ));
  }

  // 3-7. Divergências espelhadas da comparação em Shadow Mode (Fase 1),
  // agora com registro descritivo.
  const comparisonStatus = safeComparison.status ?? null;
  const engineIntent = safeClassification.primaryIntent ?? null;
  const pipelineIntent = safeComparison.pipelineIntent ?? null;

  if (comparisonStatus === 'action_query_divergence') {
    const pipelineWasQuery = ['check_balance', 'forecast', 'question'].includes(pipelineIntent);
    diagnostics.push(buildEntry(
      'action_query_divergence',
      'high',
      pipelineWasQuery
        ? 'Pipeline respondeu consulta.'
        : 'Pipeline tratou como ação.',
      `Engine detectou intenção de ${pipelineWasQuery ? 'ação' : 'consulta'}.`,
      { engineIntent, pipelineIntent },
    ));
  }

  if (comparisonStatus === 'intent_divergence') {
    diagnostics.push(buildEntry(
      'intent_divergence',
      'high',
      `Pipeline tratou como ${pipelineIntent ?? 'desconhecido'}.`,
      `Engine classificou como ${engineIntent ?? 'desconhecido'}.`,
      { engineIntent, pipelineIntent },
    ));
  }

  if (comparisonStatus === 'pending_context_divergence') {
    diagnostics.push(buildEntry(
      'pending_context_divergence',
      'high',
      'Pipeline manteve pendência ativa.',
      'Engine detectou ação nova explícita.',
      { engineIntent, pipelineIntent },
    ));
  }

  if (comparisonStatus === 'missing_field_divergence') {
    diagnostics.push(buildEntry(
      'missing_field_divergence',
      'medium',
      'Pipeline marcou como pronto.',
      `Engine identificou campos ausentes (${(plan?.missingFields ?? []).join(', ') || 'nenhum'}).`,
      { missingFields: plan?.missingFields ?? [] },
    ));
  }

  if (comparisonStatus === 'confidence_gap') {
    diagnostics.push(buildEntry(
      'confidence_gap',
      'low',
      'Pipeline confiou na intenção.',
      'Engine detectou confiança abaixo do limiar.',
      { confidence: safeClassification.confidence ?? null },
    ));
  }

  // 8. Confirmação/cancelamento sem pendência ativa.
  if (
    (safeClassification.messageType === 'confirmation'
      || safeClassification.messageType === 'cancellation')
    && !analyzed?.pending?.exists
  ) {
    diagnostics.push(buildEntry(
      'confirmation_without_pending',
      'low',
      'Pipeline recebeu confirmação/cancelamento.',
      'Engine detectou ausência de pendência ativa.',
      { messageType: safeClassification.messageType },
    ));
  }

  // 9. Correção sem pendência para corrigir.
  if (safeClassification.messageType === 'correction' && !analyzed?.compatibility?.pendingIntent) {
    diagnostics.push(buildEntry(
      'correction_without_pending',
      'low',
      'Pipeline recebeu correção.',
      'Engine não encontrou pendência para corrigir.',
      {},
    ));
  }

  return diagnostics;
}

export { UNI_ENGINE_DIVERGENCE_TYPES };
