// Uni Engine — Capability Activation Readiness (Parte 4, Bloco 1).
//
// buildCapabilityReadinessSnapshot({ observationSnapshot,
// decisionReadinessSnapshot, activationDecisions, context }):
//   1. consome o Observation Snapshot da Parte 2 (e, opcionalmente, o
//      Decision Readiness da Parte 3);
//   2. lê APENAS as decisões de Activation já existentes (nunca re-executa);
//   3. classifica cada capability conhecida como elegível (ativação futura
//      possível), bloqueada (razão fechada) ou pendente de dependência;
//   4. calcula dependências faltantes e a próxima capability recomendada;
//   5. consolida o snapshot serializável e congelado (mode observational,
//      legacyPreserved true, applied false);
//   6. qualquer erro → snapshot vazio seguro (falha segura).
//
// Garantias: nada é ativado, nada modifica integração, nada escreve memória,
// nada acessa serviços externos de execução, nada altera a resposta nem
// pending action.
import { isValidActivationCapability } from '../activation/activationTypes.js';
import { isActivationStatusFutureApplicable } from '../readiness/readinessPolicy.js';
import {
  isForbiddenCapability,
  isActivationCandidate,
} from './capabilityReadinessTypes.js';
import {
  getCapabilityDependencies,
  getKnownCapabilities,
  selectNextRecommendedCapability,
} from './capabilityReadinessPolicy.js';
import {
  createEmptyCapabilityReadinessSnapshot,
  createCapabilityReadinessSnapshot,
  validateCapabilityReadinessSnapshot,
} from './capabilityReadinessContracts.js';
import { buildCapabilityReadinessDiagnostics } from './buildCapabilityReadinessDiagnostics.js';

function safeObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function warn(isDev, message) {
  if (isDev && typeof console?.warn === 'function') {
    console.warn(`[uni-engine] capability-readiness ${message}`);
  }
}

function collectActivationDecisions({ observationSnapshot, activationDecisions }) {
  if (Array.isArray(activationDecisions) && activationDecisions.length > 0) {
    return activationDecisions;
  }
  const decisions = observationSnapshot?.activationSnapshot?.decisions;
  return Array.isArray(decisions) ? decisions : [];
}

function decisionForCapability(decisions, capability) {
  if (!Array.isArray(decisions)) return null;
  return decisions.find((decision) => decision?.capability === capability) ?? null;
}

// Classifica uma capability conhecida em 'eligible' | 'blocked' | 'unknown'.
// A elegibilidade considera APENAS o estado observado da Activation (decisões
// já produzidas) — nunca aplica, nunca reavalia gates.
function classifyCapability(capability, decision) {
  if (!isValidActivationCapability(capability)) return { status: 'unknown' };
  if (isForbiddenCapability(capability)) {
    return { status: 'blocked', reason: 'FORBIDDEN_CAPABILITY' };
  }
  if (!isActivationCandidate(capability)) {
    return { status: 'blocked', reason: 'NOT_ELIGIBLE_IN_REGISTRY' };
  }
  if (!decision) {
    return { status: 'blocked', reason: 'NOT_EVALUATED' };
  }
  const activationStatus = typeof decision.activationStatus === 'string'
    ? decision.activationStatus
    : 'UNKNOWN';
  if (isActivationStatusFutureApplicable(activationStatus)) {
    return { status: 'eligible' };
  }
  return { status: 'blocked', reason: 'BLOCKED_BY_ACTIVATION' };
}

export function buildCapabilityReadinessSnapshot(options = {}) {
  const safe = safeObject(options);
  const safeContext = safeObject(safe.context);
  const isDev = Boolean(safeContext.isDev);
  const observationSnapshot = safeObject(safe.observationSnapshot);
  const decisionReadinessSnapshot = safeObject(safe.decisionReadinessSnapshot);

  try {
    const decisions = collectActivationDecisions(safe);

    // --- classificação inicial --------------------------------------
    const eligibleBase = [];
    const blocked = [];
    const evaluated = [];
    const byCapability = new Map();

    for (const capability of getKnownCapabilities()) {
      const decision = decisionForCapability(decisions, capability);
      const classification = classifyCapability(capability, decision);
      byCapability.set(capability, classification);
      evaluated.push(capability);
      if (classification.status === 'eligible') {
        eligibleBase.push(capability);
      } else if (classification.status === 'blocked') {
        blocked.push({ capability, reason: classification.reason });
      }
    }

    // --- resolução de dependências (ponto fixo, grafo acíclico) ------
    // Uma capability só permanece elegível se todas as suas dependências
    // também estão elegíveis. Iteração determinística até não mudar mais.
    const eligibleSet = new Set();
    let changed = true;
    while (changed) {
      changed = false;
      for (const capability of eligibleBase) {
        if (eligibleSet.has(capability)) continue;
        const deps = getCapabilityDependencies(capability);
        const depsSatisfied = deps.every((dep) => eligibleSet.has(dep));
        if (depsSatisfied) {
          eligibleSet.add(capability);
          changed = true;
        }
      }
    }

    // Capacidades base-elegíveis que não chegaram ao ponto fixo ficam
    // bloqueadas por dependência faltante.
    const missingDependencies = [];
    const eligible = [];
    for (const capability of eligibleBase) {
      if (eligibleSet.has(capability)) {
        eligible.push(capability);
        continue;
      }
      const deps = getCapabilityDependencies(capability);
      const missing = deps.filter((dep) => !eligibleSet.has(dep));
      blocked.push({ capability, reason: 'DEPENDENCY_MISSING' });
      if (missing.length > 0) {
        missingDependencies.push({ capability, dependencies: missing });
      }
    }

    // --- ordenação determinística -----------------------------------
    eligible.sort((a, b) => {
      const ia = getCapabilityDependencies(a).length;
      const ib = getCapabilityDependencies(b).length;
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b);
    });
    blocked.sort((a, b) => a.capability.localeCompare(b.capability));
    missingDependencies.sort((a, b) => a.capability.localeCompare(b.capability));

    const nextRecommendedCapability = selectNextRecommendedCapability(eligible);

    const shadowMode = Boolean(
      safeContext.shadowMode
      ?? observationSnapshot.shadowMode
      ?? true,
    );

    const diagnostics = buildCapabilityReadinessDiagnostics({
      eligibleCount: eligible.length,
      blockedCount: blocked.length,
      missingDependencyCount: missingDependencies.length,
      nextRecommendedCapability,
      shadowMode,
      legacyPreserved: true,
      applied: false,
    });

    const metadata = {
      sources: ['observation'],
      evaluatedCount: evaluated.length,
      eligibleCount: eligible.length,
      blockedCount: blocked.length,
      missingDependencyCount: missingDependencies.length,
      environment: typeof safeContext.environment === 'string' ? safeContext.environment : null,
    };
    if (decisionReadinessSnapshot && Object.keys(decisionReadinessSnapshot).length > 0) {
      metadata.sources.push('decision-readiness');
    }
    if (decisions.length > 0) metadata.sources.push('activation');

    const snapshot = createCapabilityReadinessSnapshot({
      enabled: Boolean(observationSnapshot && observationSnapshot.serializable === true),
      shadowMode,
      evaluatedCapabilities: evaluated,
      eligibleCapabilities: eligible,
      blockedCapabilities: blocked,
      missingDependencies,
      nextRecommendedCapability,
      diagnostics,
      metadata,
    });

    const validation = validateCapabilityReadinessSnapshot(snapshot);
    if (!validation.valid) {
      warn(isDev, `contract invalid: ${validation.errors.join(',')}`);
      return createEmptyCapabilityReadinessSnapshot({ shadowMode });
    }
    return snapshot;
  } catch (error) {
    warn(isDev, `error: ${error?.code ?? 'CAPABILITY_READINESS_INTERNAL_ERROR'} :: ${error?.message ?? ''}`);
    return createEmptyCapabilityReadinessSnapshot({
      shadowMode: Boolean(safeContext.shadowMode ?? true),
    });
  }
}
