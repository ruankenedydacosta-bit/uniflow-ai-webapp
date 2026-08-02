// Detecção de sinais de reflexão (Fase 8).
//
// Converte o estado observado das Fases 1–7 (classificação, comparação,
// diagnósticos de divergência, modelo epistêmico, decisão, plano, objetivos,
// memória) em sinais de reflexão estruturados. Cada sinal é determinístico e
// carrega `type`, `layer`, `severity`, `evidenceCount` e `reasonCode`.
//
// Nada aqui altera as Fases 1–7 — os sinais alimentam apenas a reflexão.
import { REFLECTION_POLICY } from './reflectionPolicy.js';
import { createReflectionSignal } from './reflectionContracts.js';

function pushSignal(list, seed) {
  if (list.length >= REFLECTION_POLICY.maxSignals) return;
  list.push(createReflectionSignal(seed));
}

function comparisonToSignals(list, comparison) {
  const status = comparison?.status ?? null;
  switch (status) {
    case 'intent_divergence':
      pushSignal(list, {
        type: 'INTENT_MISMATCH',
        layer: 'classification',
        severity: 'high',
        evidenceCount: 1,
        reasonCode: 'comparison_intent_divergence',
      });
      break;
    case 'action_query_divergence':
      pushSignal(list, {
        type: 'INTENT_MISMATCH',
        layer: 'decision',
        severity: 'high',
        evidenceCount: 1,
        reasonCode: 'comparison_action_query_divergence',
      });
      break;
    case 'missing_field_divergence':
      pushSignal(list, {
        type: 'MISSING_INFORMATION',
        layer: 'decision',
        severity: 'medium',
        evidenceCount: 1,
        reasonCode: 'comparison_missing_field',
      });
      break;
    case 'confidence_gap':
      pushSignal(list, {
        type: 'LOW_CONFIDENCE',
        layer: 'classification',
        severity: 'medium',
        evidenceCount: 1,
        reasonCode: 'comparison_confidence_gap',
      });
      break;
    case 'pending_context_divergence':
      pushSignal(list, {
        type: 'CONTEXT_LOST',
        layer: 'pipeline',
        severity: 'high',
        evidenceCount: 1,
        reasonCode: 'comparison_pending_context',
      });
      break;
    default:
      break;
  }
}

function divergencesToSignals(list, divergences) {
  const entries = Array.isArray(divergences) ? divergences : [];
  const seen = new Set();
  for (const entry of entries) {
    if (list.length >= REFLECTION_POLICY.maxSignals) return;
    const type = entry?.type ?? null;
    if (!type || seen.has(type)) continue;
    seen.add(type);
    switch (type) {
      case 'intent_divergence':
      case 'action_query_divergence':
        pushSignal(list, {
          type: 'INTENT_MISMATCH',
          layer: 'classification',
          severity: entry.severity ?? 'high',
          evidenceCount: 1,
          reasonCode: `divergence_${type}`,
        });
        break;
      case 'context_switch_new_pending':
        pushSignal(list, {
          type: 'CONTEXT_LOST',
          layer: 'pipeline',
          severity: entry.severity ?? 'medium',
          evidenceCount: 1,
          reasonCode: 'divergence_context_switch',
        });
        break;
      case 'missing_field_divergence':
        pushSignal(list, {
          type: 'MISSING_INFORMATION',
          layer: 'decision',
          severity: entry.severity ?? 'medium',
          evidenceCount: 1,
          reasonCode: 'divergence_missing_field',
        });
        break;
      case 'pipeline_asked_known_field':
        pushSignal(list, {
          type: 'UNNECESSARY_QUESTION',
          layer: 'pipeline',
          severity: entry.severity ?? 'low',
          evidenceCount: 1,
          reasonCode: 'divergence_asked_known_field',
        });
        break;
      case 'correction_without_pending':
        pushSignal(list, {
          type: 'USER_CORRECTION',
          layer: 'pipeline',
          severity: entry.severity ?? 'medium',
          evidenceCount: 1,
          reasonCode: 'divergence_correction_without_pending',
        });
        break;
      case 'confirmation_without_pending':
        pushSignal(list, {
          type: 'UNNECESSARY_QUESTION',
          layer: 'pipeline',
          severity: entry.severity ?? 'low',
          evidenceCount: 1,
          reasonCode: 'divergence_confirmation_without_pending',
        });
        break;
      default:
        break;
    }
  }
}

function epistemicToSignals(list, epistemicModel) {
  const conflicts = Array.isArray(epistemicModel?.conflicts) ? epistemicModel.conflicts : [];
  const stale = Array.isArray(epistemicModel?.staleItems) ? epistemicModel.staleItems : [];
  const sufficiency = epistemicModel?.sufficiency ?? null;
  if (conflicts.length > 0) {
    pushSignal(list, {
      type: 'EPISTEMIC_CONFLICT',
      layer: 'epistemic',
      severity: 'high',
      evidenceCount: conflicts.length,
      reasonCode: 'epistemic_conflict',
    });
  }
  if (stale.length > 0) {
    pushSignal(list, {
      type: 'STALE_INFORMATION',
      layer: 'epistemic',
      severity: 'medium',
      evidenceCount: stale.length,
      reasonCode: 'epistemic_stale',
    });
  }
  const overallSufficient = sufficiency?.overall === true || sufficiency?.isSufficient === true;
  if (sufficiency && !overallSufficient) {
    pushSignal(list, {
      type: 'MISSING_INFORMATION',
      layer: 'epistemic',
      severity: 'medium',
      evidenceCount: sufficiency?.missingCount ?? 1,
      reasonCode: 'epistemic_insufficient',
    });
  }
}

function memoryToSignals(list, persistentMemory, operationalMemory) {
  const conflicts = Array.isArray(persistentMemory?.conflicts) ? persistentMemory.conflicts : [];
  const candidates = Array.isArray(persistentMemory?.candidates) ? persistentMemory.candidates : [];
  const retrieved = Array.isArray(persistentMemory?.retrieved) ? persistentMemory.retrieved : [];
  if (conflicts.length > 0) {
    pushSignal(list, {
      type: 'MEMORY_CONFLICT',
      layer: 'memory',
      severity: 'high',
      evidenceCount: conflicts.length,
      reasonCode: 'memory_conflict',
    });
  }
  const hasRetrieved = retrieved.length > 0 || candidates.length > 0;
  const opMemory = operationalMemory ?? {};
  const hasOperational = Boolean(opMemory.conversationId ?? opMemory.lastSubject);
  if (!hasRetrieved && !hasOperational) {
    pushSignal(list, {
      type: 'MISSING_INFORMATION',
      layer: 'memory',
      severity: 'low',
      evidenceCount: 1,
      reasonCode: 'memory_empty',
    });
  }
}

function decisionToSignals(list, decisionLayer) {
  if (!decisionLayer) return;
  const risk = decisionLayer.risk ?? 'NONE';
  const decisionType = decisionLayer.decisionType ?? null;
  const sufficiency = decisionLayer.contextEvaluation?.sufficiency ?? 'UNKNOWN';
  const dependencies = Array.isArray(decisionLayer.dependencies) ? decisionLayer.dependencies : [];

  if (risk === 'CRITICAL' || risk === 'HIGH') {
    pushSignal(list, {
      type: 'DECISION_MISMATCH',
      layer: 'decision',
      severity: risk === 'CRITICAL' ? 'critical' : 'high',
      evidenceCount: 1,
      reasonCode: 'decision_high_risk',
    });
  }

  if (decisionType === 'ASK' && sufficiency === 'SUFFICIENT') {
    pushSignal(list, {
      type: 'UNNECESSARY_QUESTION',
      layer: 'decision',
      severity: 'medium',
      evidenceCount: 1,
      reasonCode: 'decision_ask_while_sufficient',
    });
  }

  if (decisionType === 'RESPOND' && dependencies.length > 0) {
    pushSignal(list, {
      type: 'MISSING_QUESTION',
      layer: 'decision',
      severity: 'high',
      evidenceCount: dependencies.length,
      reasonCode: 'decision_respond_with_missing_dependencies',
    });
  }

  if (decisionType === 'EXECUTE' && risk === 'CRITICAL') {
    pushSignal(list, {
      type: 'EXECUTOR_MISMATCH',
      layer: 'executor',
      severity: 'critical',
      evidenceCount: 1,
      reasonCode: 'decision_execute_with_critical_risk',
    });
  }
}

function planningToSignals(list, planning) {
  if (!planning) return;
  const status = planning.status ?? 'UNKNOWN';
  const risk = planning.risk ?? 'NONE';
  const missing = Array.isArray(planning.missingDependencies)
    ? planning.missingDependencies
    : Array.isArray(planning.missing) ? planning.missing : [];

  if (status === 'BLOCKED' || risk === 'CRITICAL') {
    pushSignal(list, {
      type: 'PLANNING_MISMATCH',
      layer: 'planning',
      severity: 'high',
      evidenceCount: 1,
      reasonCode: 'planning_blocked',
    });
  }
  if (missing.length > 0) {
    pushSignal(list, {
      type: 'MISSING_INFORMATION',
      layer: 'planning',
      severity: 'medium',
      evidenceCount: missing.length,
      reasonCode: 'planning_missing_dependencies',
    });
  }
}

function goalsToSignals(list, goals) {
  if (!goals) return;
  const conflicts = Array.isArray(goals.conflicts) ? goals.conflicts : [];
  const status = goals.status ?? 'UNKNOWN';
  if (conflicts.length > 0 || status === 'BLOCKED') {
    pushSignal(list, {
      type: 'GOAL_MISMATCH',
      layer: 'goals',
      severity: 'high',
      evidenceCount: Math.max(conflicts.length, 1),
      reasonCode: 'goals_blocked_or_conflict',
    });
  }
}

export function detectReflectionSignals(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const signals = [];
  const {
    classification,
    comparison,
    divergenceDiagnostics,
    epistemicModel,
    decisionLayer,
    planning,
    goals,
    persistentMemory,
    operationalMemory,
    userCorrection,
    outcome,
    repetitionCount,
    providerFailed,
    voiceFailed,
  } = safe;

  // Correções e rejeições explícitas do usuário (maior prioridade).
  if (userCorrection?.isCorrection) {
    pushSignal(signals, {
      type: 'USER_CORRECTION',
      layer: 'pipeline',
      severity: 'high',
      evidenceCount: 1,
      reasonCode: 'explicit_correction_phrase',
    });
    if (userCorrection.correctionPair) {
      pushSignal(signals, {
        type: 'CATEGORY_MISMATCH',
        layer: 'classification',
        severity: 'medium',
        evidenceCount: 1,
        reasonCode: 'category_correction_pair',
      });
    }
  }
  if (userCorrection?.isCancellation) {
    pushSignal(signals, {
      type: 'USER_REJECTION',
      layer: 'pipeline',
      severity: 'medium',
      evidenceCount: 1,
      reasonCode: 'explicit_cancellation_phrase',
    });
  }
  if (repetitionCount >= REFLECTION_POLICY.repetitionThreshold) {
    pushSignal(signals, {
      type: 'USER_REPETITION',
      layer: 'pipeline',
      severity: 'medium',
      evidenceCount: repetitionCount,
      reasonCode: 'user_repeated_message',
    });
  }

  // Fases 1–2: classificação e comparação.
  const confidence = typeof classification?.confidence === 'number'
    ? classification.confidence
    : 1;
  if (confidence < REFLECTION_POLICY.lowConfidenceThreshold) {
    pushSignal(signals, {
      type: 'LOW_CONFIDENCE',
      layer: 'classification',
      severity: 'medium',
      evidenceCount: 1,
      reasonCode: 'classification_low_confidence',
    });
  }
  comparisonToSignals(signals, comparison);
  divergencesToSignals(signals, divergenceDiagnostics);

  // Fase 4: modelo epistêmico.
  epistemicToSignals(signals, epistemicModel);

  // Fase 3: memória persistente/operacional.
  memoryToSignals(signals, persistentMemory, operationalMemory);

  // Fase 5: decisão.
  decisionToSignals(signals, decisionLayer);

  // Fase 6: planejamento.
  planningToSignals(signals, planning);

  // Fase 7: objetivos.
  goalsToSignals(signals, goals);

  // Falhas externas.
  if (providerFailed) {
    pushSignal(signals, {
      type: 'PROVIDER_FAILURE',
      layer: 'pipeline',
      severity: 'high',
      evidenceCount: 1,
      reasonCode: 'provider_failed',
    });
  }
  if (voiceFailed) {
    pushSignal(signals, {
      type: 'VOICE_FAILURE',
      layer: 'pipeline',
      severity: 'low',
      evidenceCount: 1,
      reasonCode: 'voice_failed',
    });
  }

  // Padrão de sucesso (apenas com evidência).
  if (outcome === 'SUCCESS_CONFIRMED' || outcome === 'SUCCESS_INFERRED') {
    pushSignal(signals, {
      type: 'SUCCESSFUL_PATTERN',
      layer: 'executor',
      severity: 'low',
      evidenceCount: 1,
      reasonCode: `outcome_${outcome}`,
    });
  }

  return signals.slice(0, REFLECTION_POLICY.maxSignals);
}
