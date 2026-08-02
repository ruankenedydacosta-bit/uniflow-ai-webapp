// Integration — orientação de esclarecimento (CLARIFICATION_GUIDANCE,
// Parte 1).
//
// Pode: selecionar uma pergunta curta e objetiva quando intenção, conta,
// categoria, valor ou objetivo estiverem ambíguos; evitar que declaração
// vire consulta (nunca age fora de um esclarecimento legado já em curso) e
// evitar que frase completa vire nome de conta (templates fechados, nunca
// texto do usuário). NÃO pode: decidir silenciosamente, executar ação ou
// transformar hipótese em fato.
//
// Segurança: só atua quando o pipeline legado JÁ está pedindo esclarecimento
// (status needs_clarification) e o texto legado bate EXATAMENTE com um
// template conhecido — a troca é sempre para outra pergunta curta fechada.
import {
  mapLegacyAmbiguityToClarificationKey,
  getClarificationTemplate,
} from './integrationPolicy.js';

export function applyClarificationGuidance({
  legacy,
  suggested = null,
  active = false,
} = {}) {
  const safeSuggested = suggested && typeof suggested === 'object' ? suggested : {};
  const ambiguityType = typeof safeSuggested.ambiguityType === 'string'
    ? safeSuggested.ambiguityType
    : null;
  const optionsCount = typeof safeSuggested.optionsCount === 'number'
    ? Math.min(Math.max(safeSuggested.optionsCount, 0), 8)
    : null;

  const guidance = {
    clarificationKey: null,
    ambiguityType,
    optionsCount,
    applied: false,
    suggestedText: null,
    reason: null,
  };

  if (!active || !legacy || legacy.protectedType) {
    guidance.reason = active && legacy?.protectedType ? 'PROTECTED_RESPONSE' : 'CAPABILITY_NOT_ACTIVE';
    return { guidance, finalText: legacy?.text ?? null };
  }
  if (legacy.responseType !== 'clarification') {
    guidance.reason = 'NOT_A_CLARIFICATION';
    return { guidance, finalText: legacy.text };
  }

  const legacyKey = mapLegacyAmbiguityToClarificationKey(legacy);
  const currentTemplate = getClarificationTemplate(legacyKey);
  if (!legacyKey || !currentTemplate || legacy.text !== currentTemplate) {
    guidance.reason = legacy.text === currentTemplate ? 'NO_MAPPING' : 'TEXT_OUTSIDE_ALLOWLIST';
    return { guidance, finalText: legacy.text };
  }

  // Seleciona a pergunta curta objetiva compatível com a ambiguidade
  // declarada pelo motor — sempre uma troca entre templates fechados.
  const suggestedKey = ambiguityType
    ? mapLegacyAmbiguityToClarificationKey({ ambiguityType })
    : null;
  const targetKey = suggestedKey ?? legacyKey;
  const targetTemplate = getClarificationTemplate(targetKey);
  if (!targetTemplate) {
    guidance.reason = 'NO_SAFE_TARGET';
    return { guidance, finalText: legacy.text };
  }

  guidance.clarificationKey = targetKey;
  guidance.suggestedText = targetTemplate;
  guidance.applied = true;
  guidance.reason = 'SHORT_OBJECTIVE_QUESTION_SELECTED';
  return { guidance, finalText: targetTemplate };
}
