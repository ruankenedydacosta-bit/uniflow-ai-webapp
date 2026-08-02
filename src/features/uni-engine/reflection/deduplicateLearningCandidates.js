// Deduplicação de candidatos de aprendizado (Fase 8).
//
// Candidatos equivalentes não podem crescer indefinidamente. Deduplica por:
// usuário/workspace lógico recebido + tipo + subjectKey + normalizedValue +
// janela temporal. Nunca armazena IDs pessoais na telemetria.
import { REFLECTION_POLICY } from './reflectionPolicy.js';

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function deduplicateLearningCandidates(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const candidates = Array.isArray(safe.candidates) ? safe.candidates : [];
  const windowMs = Number.isFinite(safe.windowMs) ? safe.windowMs : DEFAULT_WINDOW_MS;
  const deduplicated = [];
  const removed = [];

  for (const candidate of candidates) {
    const existingIndex = deduplicated.findIndex((item) => {
      if (item.type !== candidate.type) return false;
      if (item.subjectKey !== candidate.subjectKey) return false;
      if (item.normalizedValue !== candidate.normalizedValue) return false;
      const candidateTime = candidate.createdAt ? Date.parse(candidate.createdAt) : Date.now();
      const existingTime = item.createdAt ? Date.parse(item.createdAt) : Date.now();
      if (!Number.isFinite(candidateTime) || !Number.isFinite(existingTime)) return false;
      return Math.abs(candidateTime - existingTime) <= windowMs;
    });

    if (existingIndex === -1) {
      deduplicated.push(candidate);
      continue;
    }

    const existing = deduplicated[existingIndex];
    const existingConfidence = typeof existing.confidence === 'number' ? existing.confidence : 0;
    const candidateConfidence = typeof candidate.confidence === 'number' ? candidate.confidence : 0;

    // Mantém o mais confiante e mescla evidências (limitado).
    const mergedEvidence = [
      ...(Array.isArray(existing.evidence) ? existing.evidence : []),
      ...(Array.isArray(candidate.evidence) ? candidate.evidence : []),
    ].slice(0, REFLECTION_POLICY.maxEvidencePerCandidate);

    const merged = {
      ...existing,
      evidence: mergedEvidence,
      confidence: Math.max(existingConfidence, candidateConfidence),
    };
    if (candidateConfidence > existingConfidence) {
      merged.candidateId = candidate.candidateId;
      merged.reasonCode = candidate.reasonCode ?? merged.reasonCode;
    }
    deduplicated[existingIndex] = merged;
    removed.push(candidate);
  }

  return { deduplicated, removed };
}
