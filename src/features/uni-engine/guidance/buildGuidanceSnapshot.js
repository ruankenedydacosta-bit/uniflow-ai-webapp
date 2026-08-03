// Uni Engine — Guidance observacional (Parte 2, Bloco 2).
//
// buildGuidanceSnapshot({ legacy, engineResult, context }):
//   1. deriva sugestões por capacidade a partir do resultado da Uni Engine
//      (reusa buildIntegrationSuggested — a camada de integração fica
//      intacta);
//   2. calcula as quatro guidances (Question, Clarification, Style, Length)
//      como se estivessem ATIVAS, apenas para observação;
//   3. consolida o snapshot serializável em memória (mode observational,
//      legacyPreserved true) + diagnóstico redigido;
//   4. qualquer erro → snapshot vazio (falha segura, nunca altera o app).
//
// Garantias: nada é aplicado, nada altera a resposta, nada executa, nada
// persiste. O texto legado nunca entra no snapshot — apenas chaves, bandas e
// razões.
import { buildIntegrationSuggested } from '../integration/runUniEngineIntegration.js';
import { computeQuestionGuidance } from './computeQuestionGuidance.js';
import { computeClarificationGuidance } from './computeClarificationGuidance.js';
import { computeStyleGuidance } from './computeStyleGuidance.js';
import { computeLengthGuidance } from './computeLengthGuidance.js';
import { buildGuidanceDiagnostics } from './buildGuidanceDiagnostics.js';
import {
  createEmptyGuidanceSnapshot,
  createGuidanceSnapshot,
  validateGuidanceSnapshot,
} from './guidanceContracts.js';

function safeObject(value) {
  return value && typeof value === 'object' ? value : {};
}

export function buildGuidanceSnapshot({
  legacy = null,
  engineResult = null,
  context = null,
} = {}) {
  const safeContext = safeObject(context);
  const isDev = Boolean(safeContext.isDev);
  const engine = safeObject(engineResult);

  try {
    const question = computeQuestionGuidance({
      legacy,
      suggested: buildIntegrationSuggested('QUESTION_GUIDANCE', engine),
    });
    const clarification = computeClarificationGuidance({
      legacy,
      suggested: buildIntegrationSuggested('CLARIFICATION_GUIDANCE', engine),
    });
    const style = computeStyleGuidance({
      legacy,
      suggested: buildIntegrationSuggested('RESPONSE_STYLE_GUIDANCE', engine),
    });
    const length = computeLengthGuidance({
      legacy,
      suggested: buildIntegrationSuggested('RESPONSE_LENGTH_GUIDANCE', engine),
    });

    const guidances = {
      QUESTION_GUIDANCE: question.guidance,
      CLARIFICATION_GUIDANCE: clarification.guidance,
      RESPONSE_STYLE_GUIDANCE: style.guidance,
      RESPONSE_LENGTH_GUIDANCE: length.guidance,
    };
    const diagnostics = buildGuidanceDiagnostics({ guidances });

    const snapshot = createGuidanceSnapshot({
      questionGuidance: question.guidance,
      clarificationGuidance: clarification.guidance,
      styleGuidance: style.guidance,
      lengthGuidance: length.guidance,
      diagnostics,
    });

    const validation = validateGuidanceSnapshot(snapshot);
    if (!validation.valid) {
      if (isDev && typeof console?.warn === 'function') {
        console.warn(`[uni-engine] guidance snapshot contract invalid: ${validation.errors.join(',')}`);
      }
      return createEmptyGuidanceSnapshot({});
    }
    return snapshot;
  } catch (error) {
    if (isDev && typeof console?.warn === 'function') {
      console.warn(`[uni-engine] guidance snapshot error: ${error?.code ?? 'GUIDANCE_INTERNAL_ERROR'}`);
    }
    return createEmptyGuidanceSnapshot({});
  }
}
