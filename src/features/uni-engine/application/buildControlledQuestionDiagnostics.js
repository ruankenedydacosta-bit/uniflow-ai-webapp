// Uni Engine — Controlled Question (Parte 6, Bloco Único): diagnóstico.
//
// Diagnósticos fechados da pergunta controlada. Códigos estáticos, sem texto
// de pergunta, sem valores, sem IDs. Reutiliza createControlledQuestionDiagnostic
// do contrato.
import { createControlledQuestionDiagnostic } from './controlledQuestionContracts.js';

export function buildControlledQuestionDiagnostics({
  applied = false,
  capability = null,
  reason = null,
  templateKey = null,
  requestedField = null,
} = {}) {
  const diagnostics = [];
  diagnostics.push(createControlledQuestionDiagnostic({
    code: applied ? 'CONTROLLED_QUESTION_APPLIED' : 'CONTROLLED_QUESTION_SKIPPED',
    reason: applied ? 'controlled_question_applied' : 'controlled_question_skipped',
    capability,
    metadata: {
      applied,
      templateKey,
      requestedField,
      fallbackReason: reason,
    },
  }));
  if (applied && capability) {
    diagnostics.push(createControlledQuestionDiagnostic({
      code: capability === 'CLARIFICATION_GUIDANCE'
        ? 'CONTROLLED_CLARIFICATION_SELECTED'
        : 'CONTROLLED_QUESTION_SELECTED',
      reason: capability === 'CLARIFICATION_GUIDANCE'
        ? 'controlled_clarification_selected'
        : 'controlled_question_selected',
      capability,
      metadata: { templateKey },
    }));
  }
  return diagnostics;
}
