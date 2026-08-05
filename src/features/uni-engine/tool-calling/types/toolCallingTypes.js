// Uni Engine — Fase 20: Tool Calling (base). Tipos fechados.
//
// Camada base isolada de Tool Calling. Não integra com OpenAI/Supabase/Asaas/
// voz/autenticação. Tudo nasce desligado e nada é executado sem autorização
// explícita. Não há ferramentas reais registradas nesta fase.
export const TOOL_CALLING_VERSION = '1.0';

// Configuração padrão da Fase 20. Interruptor mestre desligado; shadow ligado
// por padrão (avaliar é seguro); telemetria sempre desligada por padrão;
// required sempre falso por padrão (nenhuma execução é obrigatória).
export const TOOL_CALLING_DEFAULT_CONFIG = Object.freeze({
  toolCallingEnabled: false,
  toolCallingShadowMode: true,
  toolCallingTelemetryEnabled: false,
  toolCallingRequired: false,
});

// Status de uma chamada de ferramenta (resultado padronizado).
export const TOOL_CALL_STATUSES = Object.freeze([
  'idle',
  'selected',
  'executing',
  'executed',
  'completed',
  'skipped',
  'blocked',
  'not_found',
  'disabled',
  'unauthorized',
  'not_allowed',
  'invalid_arguments',
  'error',
  'timeout',
  'cancelled',
  'duplicate',
  'fallback',
]);

// Decisão de seleção (gate da fase base).
export const TOOL_CALL_SELECTION_DECISIONS = Object.freeze([
  'execute',
  'skip',
  'fallback',
]);

// Chaves de segurança de uma execução de ferramenta.
export const TOOL_CALL_SAFETY_KEYS = Object.freeze([
  'executionAllowed',
  'authorized',
  'financialMutation',
  'networkAccessed',
  'wrote',
  'persisted',
  'externalServiceCalled',
  'duplicatedExecution',
]);

export function isToolCallStatus(value) {
  return TOOL_CALL_STATUSES.includes(value);
}

export function isToolCallSelectionDecision(value) {
  return TOOL_CALL_SELECTION_DECISIONS.includes(value);
}

export function validateToolCallingConfig(config) {
  if (!config || typeof config !== 'object') return { valid: false, errors: ['CONFIG_INVALID'] };
  const errors = [];
  if (typeof config.toolCallingEnabled !== 'boolean') errors.push('TOOL_CALLING_ENABLED_MISSING_OR_NOT_BOOLEAN');
  if (typeof config.toolCallingShadowMode !== 'boolean') errors.push('TOOL_CALLING_SHADOW_MODE_MISSING_OR_NOT_BOOLEAN');
  if (typeof config.toolCallingTelemetryEnabled !== 'boolean') errors.push('TOOL_CALLING_TELEMETRY_MISSING_OR_NOT_BOOLEAN');
  if (typeof config.toolCallingRequired !== 'boolean') errors.push('TOOL_CALLING_REQUIRED_MISSING_OR_NOT_BOOLEAN');
  return { valid: errors.length === 0, errors };
}