// Uni Engine — Controlled Question (Parte 6, Bloco Único): construtor do
// resultado aplicado.
//
// Monta o resultado serializável e congelado da pergunta controlada a partir
// da seleção fechada do template. Nunca escreve texto livre; o texto é
// SEMPRE o template permitido (finalQuestion), literal e estático. Pending
// Action e confirmação são apenas REPORTADOS como preservados — esta camada
// nunca os modifica.
import { createControlledQuestionResult } from './controlledQuestionContracts.js';
import { buildControlledQuestionDiagnostics } from './buildControlledQuestionDiagnostics.js';
import { CONTROLLED_QUESTION_VERSION } from './controlledQuestionTypes.js';

export function buildControlledQuestion({
  enabled = true,
  applied = false,
  capability = null,
  decisionType = null,
  requestedField = null,
  templateKey = null,
  finalQuestion = null,
  originalLegacyText = '',
  fallbackUsed = false,
  fallbackReason = null,
  sameTurn = false,
  pendingActionPreserved = true,
  confirmationPreserved = true,
  latencyMs = 0,
} = {}) {
  const diagnostics = buildControlledQuestionDiagnostics({
    applied,
    capability,
    reason: fallbackReason,
    templateKey,
    requestedField,
  });
  return createControlledQuestionResult({
    version: CONTROLLED_QUESTION_VERSION,
    enabled,
    applied,
    capability,
    decisionType,
    requestedField,
    templateKey,
    finalQuestion,
    originalLegacyText,
    fallbackUsed,
    fallbackReason,
    sameTurn,
    pendingActionPreserved,
    confirmationPreserved,
    diagnostics,
    safety: {},
    latencyMs,
  });
}
