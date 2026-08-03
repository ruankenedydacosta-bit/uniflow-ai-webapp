// src/features/uni-engine/gateway/gatewayPolicy.js
//
// Política de operação do gateway: histórico limitado por
// MAX_HISTORY_LENGTH, profundidade máxima de snapshot e fontes restritas a
// texto e voz (ver GATEWAY_SOURCES em gatewayTypes).
export const GATEWAY_POLICY = Object.freeze({
  MAX_HISTORY_LENGTH: 20,
  MIN_CONFIDENCE_THRESHOLD: 0.5,
  MAX_HISTORY_DEPTH: 10,
  ALLOWED_SOURCES: ['text', 'voice'],
  MAX_INPUT_LENGTH: 5000,
  MAX_SNAPSHOT_HISTORY: 5,
});
