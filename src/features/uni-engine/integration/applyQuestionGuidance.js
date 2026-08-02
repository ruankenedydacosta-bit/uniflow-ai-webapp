// Integration — orientação de pergunta (QUESTION_GUIDANCE, Parte 1).
//
// Pode: escolher entre perguntas já autorizadas pelo pipeline, evitar
// pergunta redundante, recomendar o campo realmente ausente e melhorar a
// especificidade da pergunta. NÃO pode: inventar resposta, preencher campo,
// escolher conta/categoria sem confirmação, pular pending action ou executar.
//
// Segurança: o texto legado SÓ é substituído quando bate EXATAMENTE com um
// template conhecido e o alvo também é um template conhecido — nunca há
// texto novo inventado e nunca há nomes/valores em nenhuma troca.
import {
  mapLegacyIssueToQuestionKey,
  mapMissingFieldToQuestionKey,
  getQuestionTemplate,
} from './integrationPolicy.js';
import { INTEGRATION_POLICY } from './integrationPolicy.js';

export function applyQuestionGuidance({
  legacy,
  suggested = null,
  active = false,
} = {}) {
  const safeSuggested = suggested && typeof suggested === 'object' ? suggested : {};
  const fieldsStillMissing = Array.isArray(safeSuggested.fieldsStillMissing)
    ? safeSuggested.fieldsStillMissing
      .filter((field) => typeof field === 'string')
      .slice(0, INTEGRATION_POLICY.maxFieldsStillMissing)
    : [];

  const guidance = {
    questionKey: null,
    fieldsStillMissing,
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

  const legacyKey = mapLegacyIssueToQuestionKey(legacy);
  const legacyTemplate = getQuestionTemplate(legacyKey);
  if (!legacyKey || !legacyTemplate || legacy.text !== legacyTemplate) {
    // Texto fora do allowlist de templates — nunca guia, nunca altera.
    guidance.reason = legacy.text === legacyTemplate ? 'NO_MAPPING' : 'TEXT_OUTSIDE_ALLOWLIST';
    return { guidance, finalText: legacy.text };
  }

  // Campo recomendado pelo motor: primeiro campo realmente ausente que o
  // pipeline legado ainda não está perguntando.
  let targetKey = null;
  for (const field of fieldsStillMissing) {
    const candidate = mapMissingFieldToQuestionKey(field, legacy.transactionType);
    if (candidate && candidate !== legacyKey && getQuestionTemplate(candidate)) {
      targetKey = candidate;
      break;
    }
  }
  // Sinal fraco do motor (questionKey 'missing_field') só é usado quando
  // fieldsStillMissing apontou um alvo diferente do atual.
  if (!targetKey) {
    guidance.reason = 'NO_SAFE_TARGET';
    return { guidance, finalText: legacy.text };
  }

  const targetTemplate = getQuestionTemplate(targetKey);
  guidance.questionKey = targetKey;
  guidance.suggestedText = targetTemplate;
  guidance.applied = true;
  guidance.reason = 'GUIDED_FIELD_SWAP';
  return { guidance, finalText: targetTemplate };
}
