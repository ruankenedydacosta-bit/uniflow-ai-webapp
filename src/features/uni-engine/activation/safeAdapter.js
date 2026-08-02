// Activation Engine — adapter seguro (Fase 9).
//
// Único ponto por onde uma orientação pode ser consumida pelo pipeline real.
// Aplica SOMENTE os campos estruturados permitidos pelo contrato da
// capacidade. Nunca substitui resposta, nunca executa, nunca escreve memória,
// nunca chama TTS nem banco.
import { getGuidanceContract, isAllowedGuidanceField } from './guidanceContracts.js';
import { ACTIVATION_POLICY } from './activationPolicy.js';
import { isCapabilityForbidden } from './capabilityRegistry.js';

export function buildAppliedEffect(options = {}) {
  const safe = options ?? {};
  const capability = safe.capability ?? 'UNKNOWN';
  const contract = getGuidanceContract(capability);
  const source = safe.suggested && typeof safe.suggested === 'object' ? safe.suggested : {};

  if (isCapabilityForbidden(capability)) {
    return { applied: false, effect: 'none', fields: [], blockedBy: 'CAPABILITY_FORBIDDEN_BY_POLICY' };
  }

  if (!contract) {
    return { applied: false, effect: 'none', fields: [], blockedBy: 'CAPABILITY_UNKNOWN' };
  }

  const fields = [];
  for (const field of contract.allowedFields) {
    if (!isAllowedGuidanceField(capability, field)) continue;
    if (!Object.hasOwn(source, field)) continue;
    const value = source[field];
    if (value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    fields.push(field);
  }

  const applied = fields.length > 0;
  return {
    applied,
    effect: contract.effect,
    fields: fields.slice(0, ACTIVATION_POLICY.maxSuggestedFields),
    blockedBy: null,
  };
}

export function consumeGuidance(options = {}) {
  const safe = options ?? {};
  const effect = buildAppliedEffect(safe);
  const applied = Boolean(safe.active) && effect.applied;
  return {
    ...effect,
    applied,
    consumed: applied,
    legacyPreserved: !applied,
  };
}
