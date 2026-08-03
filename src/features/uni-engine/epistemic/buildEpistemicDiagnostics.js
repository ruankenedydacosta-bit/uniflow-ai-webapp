// Diagnósticos do Motor Epistêmico
// Geração centralizada de diagnósticos para diferentes estágios

import { CONFIDENCE_LEVELS } from './epistemicTypes.js';

export const EPISTEMIC_DIAGNOSTIC_CODES = {
  VALID_FACT: 'VALID_FACT',
  UNVERIFIED_USER_REPORT: 'UNVERIFIED_USER_REPORT',
  MISSING_EVIDENCE: 'MISSING_EVIDENCE',
  CONTRADICTED_KNOWLEDGE: 'CONTRADICTED_KNOWLEDGE',
  STALE_KNOWLEDGE: 'STALE_KNOWLEDGE',
  INVALIDATED_KNOWLEDGE: 'INVALIDATED_KNOWLEDGE',
  SUPERSEDED_KNOWLEDGE: 'SUPERSEDED_KNOWLEDGE',
  INVALID_CONFIDENCE: 'INVALID_CONFIDENCE',
  INVALID_SOURCE: 'INVALID_SOURCE',
  NON_SERIALIZABLE_INPUT: 'NON_SERIALIZABLE_INPUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  EPISTEMIC_DISABLED: 'EPISTEMIC_DISABLED',
  SHADOW_ONLY: 'SHADOW_ONLY',
  NO_LEARNING_APPLIED: 'NO_LEARNING_APPLIED',
  SUCCESSFUL_PATTERN_DETECTED: 'SUCCESSFUL_PATTERN_DETECTED',
  FALLBACK_USED: 'FALLBACK_USED',
};

export function createEpistemicDiagnostic(type, message, details = {}) {
  if (!EPISTEMIC_DIAGNOSTIC_CODES[type]) {
    throw new Error(`UNKNOWN_DIAGNOSTIC_CODE: ${type}`);
  }

  return {
    code: type,
    message,
    details: isPlainObject(details) ? { ...details } : {},
    timestamp: new Date().toISOString(),
    severity: getDiagnosticSeverity(type),
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getDiagnosticSeverity(code) {
  if (code.includes('ERROR') || code.includes('INVALID') || code.includes('INTERNAL')) {
    return 'critical';
  }
  if (code.includes('CONTRADICTED') || code.includes('STALE')) {
    return 'high';
  }
  if (code.includes('MISSING_EVIDENCE') || code.includes('UNVERIFIED')) {
    return 'medium';
  }
  if (code.includes('SUCCESS') || code.includes('VALID') || code.includes('PATTERN')) {
    return 'low';
  }
  if (code.includes('SHADOW_ONLY') || code.includes('NO_LEARNING') || code.includes('FALLBACK')) {
    return 'ignore';
  }
  return 'medium';
}

export function buildEpistemicDiagnostics(snapshot) {
  const diagnostics = [];

  if (!snapshot?.enabled) {
    diagnostics.push(createEpistemicDiagnostic('EPISTEMIC_DISABLED', 'Epistemic engine is disabled'));
  }

  if (snapshot?.shadowMode && snapshot?.outcome === 'NEEDS_EVIDENCE') {
    diagnostics.push(createEpistemicDiagnostic('NEEDS_EVIDENCE', 'Epistemic engine needs more evidence'));
  }

  if (snapshot?.knowledge?.length > 0) {
    const highConfidence = snapshot.knowledge.filter((k) => k.confidenceLevel === 'VERIFIED' || k.confidenceLevel === 'HIGH').length;
    const mediumConfidence = snapshot.knowledge.filter((k) => k.confidenceLevel === 'MEDIUM').length;
    const lowConfidence = snapshot.knowledge.filter((k) => k.confidenceLevel === 'LOW' || k.confidenceLevel === 'NONE').length;

    if (highConfidence > 0) {
      diagnostics.push(createEpistemicDiagnostic('HIGH_CONFIDENCE_KNOWLEDGE', `${highConfidence} knowledge items with high confidence`, {
        count: highConfidence,
      }));
    }

    if (mediumConfidence > 0) {
      diagnostics.push(createEpistemicDiagnostic('MEDIUM_CONFIDENCE_KNOWLEDGE', `${mediumConfidence} knowledge items with medium confidence`, {
        count: mediumConfidence,
      }));
    }

    if (lowConfidence > 0) {
      diagnostics.push(createEpistemicDiagnostic('LOW_CONFIDENCE_KNOWLEDGE', `${lowConfidence} knowledge items with low or no confidence`, {
        count: lowConfidence,
      }));
    }
  }

  const contradictions = snapshot?.conflicts?.length || 0;
  if (contradictions > 0) {
    diagnostics.push(createEpistemicDiagnostic('CONTRADICTED_KNOWLEDGE', `${contradictions} contradictory knowledge items detected`, {
      count: contradictions,
    }));
  }

  const staleItems = snapshot?.knowledge?.filter((k) => k.status === 'STALE').length || 0;
  if (staleItems > 0) {
    diagnostics.push(createEpistemicDiagnostic('STALE_KNOWLEDGE', `${staleItems} stale knowledge items`, {
      count: staleItems,
    }));
  }

  if (snapshot?.shadow?.appliedToResponse) {
    diagnostics.push(createEpistemicDiagnostic('SUCCESSFUL_PATTERN_DETECTED', 'Knowledge influenced the response', {}));
  }

  if (snapshot?.shadow?.shadowMode && !snapshot?.shadow?.appliedToDecision && !snapshot?.shadow?.appliedToResponse) {
    diagnostics.push(createEpistemicDiagnostic('SHADOW_ONLY', 'Epistemic engine only observed, no application', {}));
  }

  if (snapshot?.fallbackUsed) {
    diagnostics.push(createEpistemicDiagnostic('FALLBACK_USED', 'Epistemic engine used fallback', {
      reason: snapshot?.fallbackReason,
    }));
  }

  return diagnostics;
}

export function createEpistemicTelemetry(snapshot) {
  return {
    correlationId: `epistemic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    engineVersion: EPISTEMIC_VERSION,
    enabled: snapshot?.enabled || false,
    shadowMode: snapshot?.shadowMode || false,
    fallbackUsed: snapshot?.fallbackUsed || false,
    fallbackReason: snapshot?.fallbackReason || null,
    errorCode: snapshot?.errorCode || null,
    reflectionTriggered: snapshot?.reflectionTriggered || false,
    outcome: snapshot?.outcome || 'UNKNOWN',
    signalCount: snapshot?.signals?.length || 0,
    signalTypes: [...new Set(snapshot?.signals?.map((s) => s?.type).filter(Boolean) || [])],
    reviewCount: snapshot?.reviews?.length || 0,
    candidateCount: snapshot?.learningCandidates?.length || 0,
    candidateTypes: [...new Set(snapshot?.learningCandidates?.map((c) => c?.type).filter(Boolean) || [])],
    confidenceBand: calculateConfidenceBand(snapshot?.knowledge || []),
    priorityBand: calculatePriorityBand(snapshot?.knowledge || []),
    riskBand: calculateRiskBand(snapshot?.knowledge || []),
    conflictCount: snapshot?.conflicts?.length || 0,
    fallback: snapshot?.fallbackUsed || false,
    errorCode: snapshot?.errorCode || null,
    latencyMs: snapshot?.latencyMs || 0,
  };
}

function calculateConfidenceBand(knowledge) {
  if (knowledge.length === 0) return null;

  const average = knowledge.reduce((sum, k) => sum + k.confidence, 0) / knowledge.length;
  const max = Math.max(...knowledge.map((k) => k.confidence));
  const band = average >= 0.8 ? 'high' : average >= 0.6 ? 'medium' : average >= 0.4 ? 'low' : 'very_low';

  return { average, max, band };
}

function calculatePriorityBand(knowledge) {
  const counts = {
    CRITICAL: knowledge.filter((k) => k.priority === 'CRITICAL').length,
    HIGH: knowledge.filter((k) => k.priority === 'HIGH').length,
    MEDIUM: knowledge.filter((k) => k.priority === 'MEDIUM').length,
    LOW: knowledge.filter((k) => k.priority === 'LOW').length,
    IGNORE: knowledge.filter((k) => k.priority === 'IGNORE').length,
    UNDETERMINED: knowledge.filter((k) => k.priority === 'UNDETERMINED').length,
  };

  return counts;
}

function calculateRiskBand(knowledge) {
  const risks = {
    HIGH: knowledge.filter((k) => k.risk === 'HIGH').length,
    CRITICAL: knowledge.filter((k) => k.risk === 'CRITICAL').length,
    MEDIUM: knowledge.filter((k) => k.risk === 'MEDIUM').length,
    LOW: knowledge.filter((k) => k.risk === 'LOW').length,
    UNDETERMINED: knowledge.filter((k) => k.risk === 'UNDETERMINED').length,
  };

  return risks;
}
