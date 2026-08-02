// Risco de aprender algo incorreto (Fase 8).
//
// Avalia se um candidato de aprendizado pode ser perigoso (dado sensível,
// outro workspace, exceção como regra, evidência fraca única, reforço de
// comportamento incorreto, substituição de fato oficial, hipótese como fato,
// falha externa como preferência, correção de contexto como preferência
// permanente). Nível alto/CRÍTICO bloqueia aprovação.
import { containsSensitiveContent, REFLECTION_POLICY } from './reflectionPolicy.js';

export function detectLearningRisk(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const risks = [];
  const text = typeof safe.proposedValue === 'string' ? safe.proposedValue : '';
  const evidence = Array.isArray(safe.evidence) ? safe.evidence : [];
  const repetitionCount = Number.isFinite(safe.repetitionCount) ? safe.repetitionCount : 0;

  // Risco máximo: dado sensível.
  if (safe.sensitive || containsSensitiveContent(text)) {
    risks.push({ code: 'SENSITIVE_DATA', severity: 'CRITICAL' });
  }

  // Outro workspace.
  if (safe.otherWorkspace) {
    risks.push({ code: 'OTHER_WORKSPACE', severity: 'CRITICAL' });
  }

  // Evidência fraca única.
  if (evidence.length === 0 && repetitionCount === 0 && !safe.explicitCorrection) {
    risks.push({ code: 'SINGLE_WEAK_EVIDENCE', severity: 'HIGH' });
  }

  // Exceção como regra: correção isolada de contexto tratada como preferência.
  if (safe.contextCorrection && !safe.permanentPreference) {
    risks.push({ code: 'CONTEXT_CORRECTION_AS_PERMANENT', severity: 'MEDIUM' });
  }

  // Hipótese como fato.
  if (safe.hypothesisAsFact) {
    risks.push({ code: 'HYPOTHESIS_AS_FACT', severity: 'HIGH' });
  }

  // Falha externa como preferência do usuário.
  if (safe.providerFailure || safe.externalFailure) {
    risks.push({ code: 'EXTERNAL_FAILURE_AS_PREFERENCE', severity: 'MEDIUM' });
  }

  // Reforço de comportamento incorreto.
  if (safe.reinforceIncorrect) {
    risks.push({ code: 'REINFORCE_INCORRECT', severity: 'HIGH' });
  }

  // Substituição de fato oficial por preferência.
  if (safe.overridesOfficialFact) {
    risks.push({ code: 'PREFERENCE_OVERRIDES_FACT', severity: 'HIGH' });
  }

  // Exceção como regra genérica.
  if (safe.exceptionAsRule) {
    risks.push({ code: 'EXCEPTION_AS_RULE', severity: 'HIGH' });
  }

  if (risks.length === 0) {
    risks.push({ code: 'NONE', severity: 'NONE' });
  }

  const severityRank = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  const level = risks.reduce(
    (max, risk) => (severityRank[risk.severity] > severityRank[max] ? risk.severity : max),
    'NONE',
  );

  return {
    level,
    risks,
    safeToLearn: level !== 'HIGH' && level !== 'CRITICAL',
  };
}

// Helper de gateway: candidato com risco CRITICAL nunca é aprovado.
export function isLearningBlockedByRisk(riskLevel) {
  return riskLevel === 'HIGH' || riskLevel === 'CRITICAL';
}

export function normalizeRepetitionCount(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function hasEnoughEvidence(evidence, repetitionCount, policy = REFLECTION_POLICY) {
  const count = (Array.isArray(evidence) ? evidence.length : 0) + (normalizeRepetitionCount(repetitionCount) > 0 ? 1 : 0);
  return count >= policy.minEvidenceThreshold;
}
