// Health Check da Uni Engine (Fase 10 — Production Readiness).
//
// Enum fechado de status de saúde. Nenhum outro status é aceito pelos
// contratos de health check.
//
//   healthy            — motor ligado e todos os módulos ativos consistentes;
//   degraded           — motor ligado, mas com módulos opcionais desligados
//                        ou latências/avisos fora do ideal (ainda funcional);
//   disabled           — motor desligado (comportamento oficial e esperado);
//   inconsistent       — flags dizem que um módulo deveria rodar, mas a seção
//                        correspondente não existe (ou vice-versa);
//   contract_error     — um contrato de saída falhou na validação;
//   telemetry_error    — falha na telemetria/redação;
//   activation_blocked — activation ligada, mas nenhuma capacidade ativa
//                        (bloqueada por gates/rollout/política);
//   fallback_active    — algum módulo caiu no caminho de fallback seguro.
export const HEALTH_STATUSES = Object.freeze([
  'healthy',
  'degraded',
  'disabled',
  'inconsistent',
  'contract_error',
  'telemetry_error',
  'activation_blocked',
  'fallback_active',
]);

// Severidade de cada check individual (ordem de prioridade na resolução).
export const HEALTH_CHECK_SEVERITIES = Object.freeze({
  healthy: 0,
  degraded: 1,
  fallback_active: 2,
  inconsistent: 3,
  activation_blocked: 4,
  telemetry_error: 5,
  contract_error: 6,
  disabled: 7,
});

export function isValidHealthStatus(value) {
  return HEALTH_STATUSES.includes(value);
}

export function isHealthFailure(status) {
  return status !== 'healthy' && status !== 'degraded';
}

// Resolve o status agregado pela MAIOR severidade entre os checks.
export function resolveAggregateHealth(checks) {
  if (!Array.isArray(checks) || checks.length === 0) return 'degraded';
  let worst = 'healthy';
  for (const check of checks) {
    const status = isValidHealthStatus(check?.status) ? check.status : 'degraded';
    if (HEALTH_CHECK_SEVERITIES[status] > HEALTH_CHECK_SEVERITIES[worst]) {
      worst = status;
    }
  }
  return worst;
}
