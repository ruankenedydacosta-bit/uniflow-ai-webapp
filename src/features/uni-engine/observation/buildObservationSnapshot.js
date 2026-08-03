// Uni Engine — Observação da conversa (Parte 2, Bloco 3).
//
// buildObservationSnapshot({ integrationSnapshot, guidanceSnapshot,
// activationSnapshot, context }):
//   1. valida as entradas (sub-snapshots serializáveis, sem funções);
//   2. redige/sanitiza cada sub-snapshot (sem texto, sem funções, sem
//      referências circulares — sempre Object.freeze em profundidade);
//   3. deriva shadowMode e consolida capabilities (união ordenada);
//   4. monta diagnóstico redigido + timestamps + metadata técnica;
//   5. consolida o snapshot final serializável em memória (mode
//      observational, legacyPreserved true);
//   6. qualquer erro → snapshot vazio (falha segura, nunca altera o app).
//
// Garantias: nada é aplicado, nada altera a resposta, nada executa, nada
// persiste. Este módulo NÃO re-executa guidance/integração/activation — ele
// apenas consolida os snapshots já produzidos por essas camadas.
import {
  createEmptyObservationSnapshot,
  createObservationSnapshot,
  sanitizeActivationSnapshot,
  sanitizeGuidanceSnapshot,
  sanitizeIntegrationSnapshot,
} from './observationContracts.js';
import {
  validateObservationInput,
  validateObservationSnapshot,
} from './observationValidators.js';
import { buildObservationDiagnostics } from './observationDiagnostics.js';

function safeObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function warn(isDev, message) {
  if (isDev && typeof console?.warn === 'function') {
    console.warn(`[uni-engine] observation ${message}`);
  }
}

export function buildObservationSnapshot(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const safeContext = safeObject(safe.context);
  const isDev = Boolean(safeContext.isDev);

  try {
    const inputValidation = validateObservationInput(safe);
    if (!inputValidation.valid) {
      warn(isDev, `input invalid: ${inputValidation.errors.join(',')}`);
      return createEmptyObservationSnapshot({ shadowMode: Boolean(safeContext.shadowMode) });
    }

    const integrationSnapshot = sanitizeIntegrationSnapshot(safe.integrationSnapshot);
    const guidanceSnapshot = sanitizeGuidanceSnapshot(safe.guidanceSnapshot);
    const activationSnapshot = sanitizeActivationSnapshot(safe.activationSnapshot);

    // shadowMode: o contexto é a fonte mais autoritativa (flag explícita do
    // chamador); na ausência, a Activation (que reflete o modo de sombra real
    // das decisões) e, por último, a telemetria da integração. O campo
    // `shadowMode` default do contrato de integração (true quando ausente)
    // NÃO é usado — ele refletiria o default do contrato, não o modo real.
    const shadowMode = Boolean(
      safeContext.shadowMode
      ?? activationSnapshot?.shadowMode
      ?? integrationSnapshot?.telemetry?.shadowMode,
    );

    const diagnostics = buildObservationDiagnostics({
      integrationSnapshot,
      guidanceSnapshot,
      activationSnapshot,
      shadowMode,
      legacyPreserved: true,
    });

    const metadata = {
      sources: [],
      integrationStatus: integrationSnapshot?.status ?? null,
      integrationFallbackUsed: integrationSnapshot?.fallbackUsed ?? false,
      integrationApplied: integrationSnapshot?.applied ?? false,
      guidanceCapabilitiesCount: guidanceSnapshot?.capabilitiesComputed?.length ?? 0,
      activationDecisionsCount: activationSnapshot?.decisionsCount ?? 0,
      environment: typeof safeContext.environment === 'string' ? safeContext.environment : null,
    };
    if (integrationSnapshot) metadata.sources.push('integration');
    if (guidanceSnapshot) metadata.sources.push('guidance');
    if (activationSnapshot) metadata.sources.push('activation');

    const timestamps = {
      recordedAt: typeof safeContext.timestamp === 'string' ? safeContext.timestamp : null,
      integrationLatencyMs: integrationSnapshot?.latencyMs ?? null,
      guidanceLatencyMs: null,
    };

    const snapshot = createObservationSnapshot({
      shadowMode,
      integrationSnapshot,
      guidanceSnapshot,
      activationSnapshot,
      diagnostics,
      timestamps,
      metadata,
    });

    const contractValidation = validateObservationSnapshot(snapshot);
    if (!contractValidation.valid) {
      warn(isDev, `contract invalid: ${contractValidation.errors.join(',')}`);
      return createEmptyObservationSnapshot({ shadowMode });
    }
    return snapshot;
  } catch (error) {
    warn(isDev, `error: ${error?.code ?? 'OBSERVATION_INTERNAL_ERROR'}`);
    return createEmptyObservationSnapshot({ shadowMode: Boolean(safeContext.shadowMode) });
  }
}
