import {
  MAX_REASON_CHARS,
  MAX_SUGGESTED_NAME_CHARS,
} from './categoryInferenceConfig.js';

// BLOCO D: contrato estruturado estrito da resposta da OpenAI para
// inferencia de categoria. A OpenAI NUNCA persiste nada -- ela apenas
// devolve esta estrutura, que e validada aqui antes de alimentar o fluxo
// determinístico existente (categoryResolution.js). Qualquer coisa que nao
// passe nesta validacao cai em fallback seguro (equivalente a nenhuma
// sugestao), nunca quebra o registro da transacao.
export const CATEGORY_INFERENCE_DECISIONS = Object.freeze({
  EXISTING_CATEGORY: 'existing_category',
  CREATE_CATEGORY: 'create_category',
  UNCERTAIN: 'uncertain',
});

const VALID_DECISIONS = new Set(Object.values(CATEGORY_INFERENCE_DECISIONS));

function clampText(value, max) {
  if (typeof value !== 'string') return null;
  const withoutControlCharacters = [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('');
  const cleaned = withoutControlCharacters.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, max);
}

function invalid(reason) {
  return Object.freeze({ valid: false, reason, inference: null });
}

/**
 * Valida a resposta bruta da IA (string JSON ou objeto ja parseado) contra
 * o contrato estruturado. `allowedCategoryIds` e a MESMA lista de IDs que
 * foi enviada no payload -- qualquer category_id fora dela invalida a
 * resposta (a IA nunca pode "inventar" um ID).
 */
export function validateCategoryInferenceResponse(raw, { allowedCategoryIds = [] } = {}) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return invalid('invalid_json');
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return invalid('invalid_json');
  }

  const decision = parsed.decision;
  if (typeof decision !== 'string' || !VALID_DECISIONS.has(decision)) {
    return invalid('invalid_decision');
  }

  const rawConfidence = parsed.confidence;
  const confidence = typeof rawConfidence === 'number' ? rawConfidence : Number(rawConfidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return invalid('invalid_confidence');
  }

  const allowedIds = new Set((Array.isArray(allowedCategoryIds) ? allowedCategoryIds : []).filter(Boolean));

  let categoryId = null;
  if (decision === CATEGORY_INFERENCE_DECISIONS.EXISTING_CATEGORY) {
    if (typeof parsed.category_id !== 'string' || !parsed.category_id) {
      return invalid('missing_category_id');
    }
    if (!allowedIds.has(parsed.category_id)) {
      return invalid('category_id_not_allowed');
    }
    categoryId = parsed.category_id;
  }

  // suggested_name so existe (e so importa) para create_category -- em
  // qualquer outro caso e ignorado, nunca usado para invalidar a resposta
  // inteira (campo extra e apenas descartado, conforme o contrato).
  let suggestedName = null;
  if (decision === CATEGORY_INFERENCE_DECISIONS.CREATE_CATEGORY) {
    suggestedName = clampText(parsed.suggested_name, MAX_SUGGESTED_NAME_CHARS);
    if (!suggestedName) {
      return invalid('missing_suggested_name');
    }
  }

  const reason = clampText(parsed.reason, MAX_REASON_CHARS) ?? '';

  return Object.freeze({
    valid: true,
    reason: null,
    inference: Object.freeze({
      decision,
      categoryId,
      confidence,
      suggestedName,
      reason,
    }),
  });
}
