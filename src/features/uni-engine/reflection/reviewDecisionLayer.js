// Revisão da Camada de Decisão (Fase 8).
//
// Compara a decisão recomendada pela Fase 5 com a decisão real do pipeline,
// o resultado observado e a necessidade de pergunta/confirmação. Produz
// diagnóstico — nunca corrige automaticamente.
import { createReflectionReview } from './reflectionContracts.js';

export function reviewDecisionLayer(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const decisionLayer = safe.decisionLayer ?? null;
  const comparison = safe.comparison ?? null;
  const userCorrection = safe.userCorrection ?? null;

  const expected = ['decisão coerente com a intenção', 'perguntas apenas quando necessário', 'confirmação quando o risco exige'];
  const observed = [];
  const divergence = [];
  const blockers = [];
  const diagnostics = [];

  if (!decisionLayer) {
    return createReflectionReview({
      targetLayer: 'decision',
      status: 'NOT_APPLICABLE',
      confidence: 0,
      expected,
      observed: ['camada de decisão desligada'],
      divergence: [],
      blockers: ['DECISION_DISABLED'],
      diagnostics: ['SHADOW_ONLY'],
    });
  }

  const decisionType = decisionLayer.decisionType ?? 'UNKNOWN';
  const risk = decisionLayer.risk ?? 'NONE';
  const confidence = typeof decisionLayer.confidence === 'number' ? decisionLayer.confidence : 0;
  const sufficiency = decisionLayer.contextEvaluation?.sufficiency ?? 'UNKNOWN';
  const dependencies = Array.isArray(decisionLayer.dependencies) ? decisionLayer.dependencies : [];

  observed.push(`decisão: ${decisionType}`);
  observed.push(`risco: ${risk}`);
  observed.push(`suficiência: ${sufficiency}`);

  // Comparação com o pipeline (Fase 1).
  const comparisonStatus = comparison?.status ?? null;
  if (comparisonStatus === 'intent_divergence' || comparisonStatus === 'action_query_divergence') {
    divergence.push('DECISION_VS_PIPELINE_DIVERGENCE');
    diagnostics.push('DECISION_MISMATCH');
  }

  // Pergunta excessiva: ASK com contexto suficiente.
  if (decisionType === 'ASK' && sufficiency === 'SUFFICIENT') {
    divergence.push('EXCESSIVE_QUESTION');
    diagnostics.push('UNNECESSARY_QUESTION');
  }

  // Pergunta ausente: RESPOND com dependências pendentes.
  if (decisionType === 'RESPOND' && dependencies.length > 0) {
    divergence.push('MISSING_QUESTION');
    blockers.push('MISSING_QUESTION');
    diagnostics.push('MISSING_QUESTION');
  }

  // Confirmação necessária ausente: EXECUTE com risco alto.
  if (decisionType === 'EXECUTE' && (risk === 'HIGH' || risk === 'CRITICAL')) {
    divergence.push('CONFIRMATION_REQUIRED_BUT_EXECUTING');
    blockers.push('CONFIRMATION_REQUIRED');
    diagnostics.push('DECISION_MISMATCH');
  }

  // Correção do usuário indica decisão anterior equivocada.
  if (userCorrection?.isCorrection) {
    divergence.push('USER_CORRECTED_DECISION');
    diagnostics.push('USER_CORRECTION');
  }

  const status = blockers.length > 0
    ? 'BLOCKED'
    : divergence.length > 0
      ? 'DIVERGENT'
      : 'ALIGNED';

  return createReflectionReview({
    targetLayer: 'decision',
    status,
    confidence: clampStatusConfidence(divergence.length, confidence),
    expected,
    observed,
    divergence,
    blockers,
    diagnostics,
  });
}

function clampStatusConfidence(divergences, base = 1) {
  const value = Math.max(0, Math.min(1, base - divergences * 0.2));
  return Math.round(value * 1000) / 1000;
}
