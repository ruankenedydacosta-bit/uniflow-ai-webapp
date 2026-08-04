// Uni Engine — Cognitive Comparison (Fase 14, Bloco 3).
//
// compareLegacyWithEngine(): comparador determinístico, puramente
// observacional, que compara a interpretação/decisão da Uni Engine com o
// resultado REAL do pipeline legado no MESMO turno e produz um objeto
// serializável (contrato createCognitiveComparison):
//   - turnId/messageId do turno observado;
//   - legacyIntent × engineIntent;
//   - legacyRoute × engineRoute (rotas do vocabulário existente ROUTE_*);
//   - legacyAction × engineSuggestedAction;
//   - status de concordância (agreement/partial_agreement/divergence/
//     insufficient_data/engine_error/skipped);
//   - tipo e severidade de divergência (somente quando deriváveis);
//   - códigos de razão fechados;
//   - timestamps e duração sanitizada;
//   - influenceApplied SEMPRE false e legacyPreserved SEMPRE true.
//
// Garantias: nunca altera a resposta, nunca executa, nunca persiste, nunca
// registra texto completo, dados pessoais, tokens ou áudio. Determinístico
// para a mesma entrada e tolerante a campos ausentes.
import {
  createCognitiveComparison,
  createEmptyCognitiveComparison,
} from './cognitiveComparisonContracts.js';
import { engineRouteFromPlan } from './mapEngineRouteFromPlan.js';
import { legacyRouteFromResponse } from './mapLegacyRoute.js';

const CONFIDENCE_GAP_THRESHOLD = 0.25;

function nowIso() {
  return new Date().toISOString();
}

function safeObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function sameOrUnknown(a, b) {
  if (a == null && b == null) return { known: false, match: true };
  if (a == null || b == null) return { known: false, match: true };
  return { known: true, match: a === b };
}

export function compareLegacyWithEngine(options = {}) {
  const safe = safeObject(options);
  const legacy = safeObject(safe.legacy);
  const engine = safeObject(safe.engine);
  const plan = safe.plan != null && typeof safe.plan === 'object' ? safe.plan : null;

  const turnId = typeof safe.turnId === 'string' ? safe.turnId : null;
  const messageId = typeof safe.messageId === 'string' ? safe.messageId : null;
  const start = Date.now();

  // 1. Engine desligada → skipped (nenhum registro de divergência).
  if (!engine.enabled || engine.skipped === true) {
    return createCognitiveComparison({
      turnId,
      messageId,
      engineSkipped: true,
      agreementStatus: 'skipped',
      agreement: false,
      engine: { intent: engine.intent ?? null, route: null, suggestedAction: null },
      legacy: {
        intent: legacy.intent ?? null,
        route: legacy.route ?? legacyRouteFromResponse(legacy),
        action: legacy.action ?? null,
      },
      reasonCodes: ['ENGINE_DISABLED', 'NO_INFLUENCE'],
      timestamp: nowIso(),
      durationMs: Date.now() - start,
    });
  }

  // 2. Erro interno da Engine → engine_error (diagnóstico, nunca resposta).
  if (Boolean(engine.fallbackUsed) && typeof engine.errorCode === 'string') {
    return createCognitiveComparison({
      turnId,
      messageId,
      engineSkipped: false,
      engineErrorCode: engine.errorCode,
      agreementStatus: 'engine_error',
      agreement: false,
      divergenceType: 'engine_fallback',
      divergenceSeverity: 'high',
      engine: { intent: engine.intent ?? null, route: null, suggestedAction: null },
      legacy: {
        intent: legacy.intent ?? null,
        route: legacy.route ?? legacyRouteFromResponse(legacy),
        action: legacy.action ?? null,
      },
      reasonCodes: ['ENGINE_ERROR', 'ENGINE_FALLBACK', 'NO_INFLUENCE'],
      timestamp: nowIso(),
      durationMs: Date.now() - start,
    });
  }

  const legacyIntent = typeof legacy.intent === 'string' ? legacy.intent : null;
  const engineIntent = typeof engine.intent === 'string' ? engine.intent : null;
  const engineRoute =
    typeof engine.route === 'string'
      ? engine.route
      : engineRouteFromPlan(plan);
  const legacyRoute =
    typeof legacy.route === 'string'
      ? legacy.route
      : legacyRouteFromResponse(legacy);
  const legacyAction = typeof legacy.action === 'string' ? legacy.action : null;
  const engineSuggestedAction =
    typeof engine.suggestedAction === 'string' ? engine.suggestedAction : null;
  const engineConfidence =
    typeof engine.confidence === 'number' && Number.isFinite(engine.confidence)
      ? engine.confidence
      : null;
  const legacyConfidence =
    typeof legacy.confidence === 'number' && Number.isFinite(legacy.confidence)
      ? legacy.confidence
      : null;

  // 3. Dados insuficientes: nenhum dos lados produziu sinal observável
  //    (sem intenção, sem rota explícita, sem tipo de resposta legada, sem
  //    plano, sem fallback) → não há o que comparar (insufficient_data).
  const engineHasSignal = engineIntent != null
    || typeof engine.route === 'string'
    || plan != null
    || engine.fallbackUsed === true;
  const legacyHasSignal = legacyIntent != null
    || typeof legacy.route === 'string'
    || legacy.responseType != null
    || legacy.pendingActive === true
    || legacy.fallbackUsed === true;
  if (!engineHasSignal && !legacyHasSignal) {
    return createCognitiveComparison({
      turnId,
      messageId,
      engineSkipped: false,
      agreementStatus: 'insufficient_data',
      agreement: false,
      divergenceType: 'missing_context',
      divergenceSeverity: 'medium',
      engine: { intent: engineIntent, route: engineRoute, suggestedAction: engineSuggestedAction },
      legacy: { intent: legacyIntent, route: legacyRoute, action: legacyAction },
      confidence: engineConfidence,
      reasonCodes: ['LEGACY_UNAVAILABLE', 'MISSING_CONTEXT', 'NO_INFLUENCE'],
      timestamp: nowIso(),
      durationMs: Date.now() - start,
    });
  }

  // 4. Comparações determinísticas (campos ausentes são tolerados).
  const intentComparison = sameOrUnknown(legacyIntent, engineIntent);
  const routeComparison = sameOrUnknown(legacyRoute, engineRoute);
  // Comparação de ação: vocabulários distintos (intent legado vs decisão da
  // Engine) nunca são comparados automaticamente — apenas quando o chamador
  // declara explicitamente o descasamento (ação observada ≠ ação sugerida).
  const explicitActionMismatch = legacy.actionMismatch === true;
  const confidenceGap =
    legacyConfidence != null
    && engineConfidence != null
    && Math.abs(legacyConfidence - engineConfidence) >= CONFIDENCE_GAP_THRESHOLD;
  const epistemicConflictCount =
    typeof engine.epistemicConflicts === 'number' ? engine.epistemicConflicts : 0;
  const epistemicConflict = epistemicConflictCount > 0;
  const legacyFallback = legacy.fallbackUsed === true;

  // 5. Conjunto de divergências derivadas (ordem determinística fixa).
  const mismatches = [];
  if (intentComparison.known && !intentComparison.match) {
    mismatches.push({ type: 'intent_mismatch', severity: 'high', reason: 'INTENT_MISMATCH' });
  }
  if (routeComparison.known && !routeComparison.match) {
    mismatches.push({ type: 'route_mismatch', severity: 'medium', reason: 'ROUTE_MISMATCH' });
  }
  if (explicitActionMismatch) {
    mismatches.push({ type: 'action_mismatch', severity: 'medium', reason: 'ACTION_MISMATCH' });
  }
  if (confidenceGap) {
    mismatches.push({ type: 'confidence_mismatch', severity: 'low', reason: 'CONFIDENCE_GAP' });
  }
  if (epistemicConflict) {
    mismatches.push({ type: 'epistemic_conflict', severity: 'medium', reason: 'EPISTEMIC_CONFLICT' });
  }
  if (legacyFallback) {
    mismatches.push({ type: 'legacy_fallback', severity: 'medium', reason: 'LEGACY_FALLBACK' });
  }

  // 6. Resolução final do status (regras fechadas e determinísticas).
  let agreementStatus = 'agreement';
  let divergenceType = null;
  let divergenceSeverity = null;
  const reasonCodes = [];

  if (mismatches.length > 0) {
    const severities = mismatches.map((entry) => entry.severity);
    divergenceSeverity = severities.includes('high')
      ? 'high'
      : severities.includes('medium')
        ? 'medium'
        : 'low';
    if (mismatches.some((entry) => entry.type === 'intent_mismatch')) {
      agreementStatus = 'divergence';
    } else if (mismatches.length >= 2) {
      agreementStatus = 'divergence';
    } else {
      agreementStatus = 'partial_agreement';
    }
    divergenceType = mismatches[0].type;
    for (const entry of mismatches) {
      if (!reasonCodes.includes(entry.reason)) reasonCodes.push(entry.reason);
    }
  } else if (engine.fallbackUsed === true) {
    // Fallback da Engine sem erro: comparação possível, porém parcial.
    agreementStatus = 'partial_agreement';
    divergenceType = 'engine_fallback';
    divergenceSeverity = 'low';
    reasonCodes.push('ENGINE_FALLBACK');
  } else {
    reasonCodes.push('INTENT_MATCH');
    if (routeComparison.known && routeComparison.match) reasonCodes.push('ROUTE_MATCH');
    reasonCodes.push('ACTION_MATCH');
  }

  const agreement = agreementStatus === 'agreement';
  if (!agreement && divergenceType === null && mismatches.length === 0) {
    // Fallback defensivo: nenhuma divergência derivável → concordância.
    agreementStatus = 'agreement';
  }
  if (engineConfidence != null && engineConfidence < 0.5 && agreementStatus === 'agreement') {
    reasonCodes.push('LOW_CONFIDENCE');
  }
  reasonCodes.push('NO_INFLUENCE');

  return createCognitiveComparison({
    turnId,
    messageId,
    engineSkipped: false,
    agreementStatus,
    agreement,
    divergenceType,
    divergenceSeverity,
    engine: {
      intent: engineIntent,
      route: engineRoute,
      suggestedAction: engineSuggestedAction,
    },
    legacy: { intent: legacyIntent, route: legacyRoute, action: legacyAction },
    confidence: engineConfidence,
    reasonCodes,
    timestamp: nowIso(),
    durationMs: Date.now() - start,
  });
}

export function buildEmptyCognitiveComparison({ turnId = null, messageId = null } = {}) {
  return createEmptyCognitiveComparison({ turnId, messageId });
}