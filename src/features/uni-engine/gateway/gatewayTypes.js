// src/features/uni-engine/gateway/gatewayTypes.js
//
// Gateway único de entrada: entrada de texto válida
// e entrada de voz válida são os únicos sources aceitos;
// source desconhecido e rejeitado antes de qualquer execução.
export const GATEWAY_VERSION = '1.0.0';
export const GATEWAY_STATUSES = {
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  FALLBACK: 'fallback',
};

export const GATEWAY_SOURCES = {
  TEXT: 'text',
  VOICE: 'voice',
};

export const GATEWAY_ERRORS = {
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_CONFIG: 'INVALID_CONFIG',
  ENGINE_OFF: 'ENGINE_OFF',
  ENGINE_INTERNAL_ERROR: 'ENGINE_INTERNAL_ERROR',
  SERIALIZATION_ERROR: 'SERIALIZATION_ERROR',
  TURN_MISMATCH: 'TURN_MISMATCH',
  TIMEOUT: 'TIMEOUT',
  INVALID_SNAPSHOT: 'INVALID_SNAPSHOT',
  ROLLOUT_BLOCKED: 'ROLLOUT_BLOCKED',
};
