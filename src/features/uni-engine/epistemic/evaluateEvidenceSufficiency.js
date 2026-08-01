// Suficiência de evidência (Fase 4 — seção 9).
//
// evaluateEvidenceSufficiency(item, purpose):
//   display       → aceita supported/confirmed, confiança alta;
//   suggest       → aceita probable/confirmed/supported, confiança moderada;
//   ask           → suficiente quando perguntar é a ação correta;
//   confirm       → exige dados completos, não conflitantes e frescos;
//   execute       → SEMPRE bloqueado nesta fase (Shadow Mode);
//   store_memory  → exige evidência suficiente e sem contradição.
//
// Resultado:
//   { sufficient, reason, missingEvidence, blockers, recommendedAction }
import {
  EPISTEMIC_POLICY,
} from './epistemicPolicy.js';

const STATUS_WEIGHT = Object.freeze({
  confirmed: 5,
  supported: 4,
  probable: 3,
  possible: 2,
  hypothesis: 1,
  missing: 0,
  ambiguous: 0,
  conflicting: 0,
  stale: 1,
  invalid: 0,
  unknown: 0,
});

function statusRank(status) {
  return STATUS_WEIGHT[status] ?? 0;
}

function evaluateForDisplay(item) {
  const policy = EPISTEMIC_POLICY;
  const rank = statusRank(item.epistemicStatus);
  if (rank >= 4 && item.confidence >= policy.sufficiency.displayMinConfidence) {
    return { sufficient: true, reason: 'display_allowed' };
  }
  const blockers = [];
  if (item.epistemicStatus === 'missing') blockers.push('missing_value');
  if (item.epistemicStatus === 'conflicting') blockers.push('conflicting');
  if (item.epistemicStatus === 'invalid') blockers.push('invalid');
  if (item.confidence < policy.sufficiency.displayMinConfidence) {
    blockers.push('insufficient_confidence');
  }
  return {
    sufficient: false,
    reason: 'display_blocked',
    blockers,
    recommendedAction: 'ask_user',
  };
}

function evaluateForSuggest(item) {
  const policy = EPISTEMIC_POLICY;
  const rank = statusRank(item.epistemicStatus);
  if (rank >= 3 && item.confidence >= policy.sufficiency.suggestMinConfidence) {
    return { sufficient: true, reason: 'suggestion_allowed' };
  }
  return {
    sufficient: false,
    reason: 'suggestion_blocked',
    blockers: ['insufficient_confidence'],
    recommendedAction: 'ask_user',
  };
}

function evaluateForAsk(item) {
  // Perguntar é a ação correta quando o item está ausente, ambíguo,
  // conflitante, com confiança baixa ou apenas hipótese.
  const rank = statusRank(item.epistemicStatus);
  const shouldAsk = rank <= 2
    || item.epistemicStatus === 'missing'
    || item.epistemicStatus === 'ambiguous'
    || item.epistemicStatus === 'conflicting';
  if (shouldAsk) {
    return { sufficient: true, reason: 'ask_recommended' };
  }
  return {
    sufficient: false,
    reason: 'ask_not_needed',
    recommendedAction: 'use_for_display',
  };
}

function evaluateForConfirm(item) {
  const policy = EPISTEMIC_POLICY;
  const rank = statusRank(item.epistemicStatus);
  const contradictions = Array.isArray(item.contradictions) ? item.contradictions.length : 0;
  if (
    rank >= 4
    && item.confidence >= policy.sufficiency.confirmMinConfidence
    && contradictions === 0
    && item.epistemicStatus !== 'stale'
  ) {
    return { sufficient: true, reason: 'confirmation_allowed' };
  }
  const blockers = [];
  if (contradictions > 0) blockers.push('conflicting');
  if (item.epistemicStatus === 'stale') blockers.push('stale');
  if (item.confidence < policy.sufficiency.confirmMinConfidence) {
    blockers.push('insufficient_confidence');
  }
  return {
    sufficient: false,
    reason: 'confirmation_blocked',
    blockers,
    recommendedAction: 'require_confirmation',
  };
}

function evaluateForExecute() {
  // Regra absoluta da Fase 4: NENHUMA afirmação epistêmica autoriza execução.
  return {
    sufficient: false,
    reason: 'execution_blocked_shadow_mode',
    blockers: ['shadow_mode_execution_blocked'],
    recommendedAction: 'block',
  };
}

function evaluateForStoreMemory(item) {
  const policy = EPISTEMIC_POLICY;
  const contradictions = Array.isArray(item.contradictions) ? item.contradictions.length : 0;
  const evidenceCount = Array.isArray(item.evidence) ? item.evidence.length : 0;
  if (
    evidenceCount >= policy.evidence.minEvidenceForValidity
    && contradictions === 0
    && item.confidence >= policy.sufficiency.storeMemoryMinConfidence
  ) {
    return { sufficient: true, reason: 'memory_candidate_allowed' };
  }
  const blockers = [];
  if (contradictions > 0) blockers.push('contradicting_evidence');
  if (evidenceCount === 0) blockers.push('missing_evidence');
  if (item.confidence < policy.sufficiency.storeMemoryMinConfidence) {
    blockers.push('insufficient_evidence');
  }
  return {
    sufficient: false,
    reason: 'memory_candidate_blocked',
    blockers,
    recommendedAction: 'ignore',
  };
}

const EVALUATORS = Object.freeze({
  display: evaluateForDisplay,
  suggest: evaluateForSuggest,
  ask: evaluateForAsk,
  confirm: evaluateForConfirm,
  execute: evaluateForExecute,
  store_memory: evaluateForStoreMemory,
});

export function evaluateEvidenceSufficiency(item, purpose, options = {}) {
  if (!item || typeof item !== 'object') {
    return {
      sufficient: false,
      reason: 'item_invalid',
      missingEvidence: [],
      blockers: ['invalid_item'],
      recommendedAction: 'ignore',
    };
  }
  const evaluator = EVALUATORS[purpose];
  if (typeof evaluator !== 'function') {
    return {
      sufficient: false,
      reason: 'purpose_unknown',
      missingEvidence: [],
      blockers: ['unknown_purpose'],
      recommendedAction: 'ignore',
    };
  }
  return evaluator(item, options);
}
