// Uni Engine — Context Bridge (Fase 11, Bloco 2): seletor de influência.
//
// selectSafeEngineInfluence — decide, de forma determinística e fechada, quais
// das influências SOLICITADAS pela resposta podem ser autorizadas. A seleção
// NUNCA cria conteúdo: apenas marca uma capacidade como allowed ou blocked.
// Regras:
//   - influência em BLOCKED_CONTEXT_INFLUENCES → sempre bloqueada;
//   - influência desconhecida (fora dos enums) → bloqueada;
//   - influência desabilitada no config (activationCapabilities.<CAP> !== true)
//     → bloqueada;
//   - demais → autorizada.
import {
  CONTEXT_BRIDGE_POLICY,
  isInfluenceAllowedByBridgePolicy,
  isInfluenceBlockedByBridgePolicy,
  isCapabilityEnabledByBridgePolicy,
} from './contextBridgePolicy.js';

function normalizeInfluence(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return value.trim().toUpperCase();
}

export function selectSafeEngineInfluence({
  requestedInfluences = [],
  config = null,
  forcedBlocked = [],
} = {}) {
  const requested = Array.isArray(requestedInfluences) ? requestedInfluences : [];
  const forced = Array.isArray(forcedBlocked) ? forcedBlocked : [];
  const allowedInfluences = [];
  const blockedInfluences = [];
  const blockedReasons = [];

  for (const raw of requested) {
    if (allowedInfluences.length + blockedInfluences.length >= CONTEXT_BRIDGE_POLICY.maxInfluences) {
      break;
    }
    const influence = normalizeInfluence(raw);
    if (influence === null) continue;
    if (allowedInfluences.includes(influence) || blockedInfluences.includes(influence)) continue;
    if (forced.includes(influence) || isInfluenceBlockedByBridgePolicy(influence)) {
      blockedInfluences.push(influence);
      blockedReasons.push('BLOCKED_BY_POLICY');
      continue;
    }
    if (!isInfluenceAllowedByBridgePolicy(influence)) {
      blockedInfluences.push(influence);
      blockedReasons.push('INFLUENCE_UNKNOWN');
      continue;
    }
    if (!isCapabilityEnabledByBridgePolicy(config, influence)) {
      blockedInfluences.push(influence);
      blockedReasons.push('CAPABILITY_DISABLED');
      continue;
    }
    allowedInfluences.push(influence);
    blockedReasons.push(null);
  }

  return Object.freeze({
    allowedInfluences: Object.freeze(allowedInfluences),
    blockedInfluences: Object.freeze(blockedInfluences),
    blockedReasons: Object.freeze(blockedReasons),
  });
}