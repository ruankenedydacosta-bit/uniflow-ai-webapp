// Revisão do uso da memória (Fase 8).
//
// Avalia se a Fase 3 recuperou memória relevante, ignorou memória errada,
// não usou memória contestada, tratou expiração e conflitos. Produz
// diagnóstico — nunca escreve na memória nesta fase.
import { createReflectionReview } from './reflectionContracts.js';

export function reviewMemoryUsage(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const persistentMemory = safe.persistentMemory ?? null;
  const userCorrection = safe.userCorrection ?? null;

  const expected = ['memória relevante recuperada', 'memória errada ignorada', 'sem memória contestada', 'preferência sugerida corretamente'];
  const observed = [];
  const divergence = [];
  const blockers = [];
  const diagnostics = [];

  const retrieved = Array.isArray(persistentMemory?.retrieved) ? persistentMemory.retrieved : [];
  const conflicts = Array.isArray(persistentMemory?.conflicts) ? persistentMemory.conflicts : [];
  const candidates = Array.isArray(persistentMemory?.candidates) ? persistentMemory.candidates : [];
  const memoryEnabled = Boolean(persistentMemory?.enabled);

  if (!memoryEnabled) {
    return createReflectionReview({
      targetLayer: 'memory',
      status: 'NOT_APPLICABLE',
      confidence: 0,
      expected,
      observed: ['memória desligada'],
      divergence: [],
      blockers: ['MEMORY_DISABLED'],
      diagnostics: ['SHADOW_ONLY'],
    });
  }

  observed.push(`${retrieved.length} memória(s) recuperada(s)`);
  observed.push(`${conflicts.length} conflito(s)`);
  observed.push(`${candidates.length} candidato(s) de memória`);

  if (retrieved.length === 0) {
    divergence.push('RELEVANT_MEMORY_NOT_RETRIEVED');
    diagnostics.push('MISSING_INFORMATION');
  }
  if (conflicts.length > 0) {
    divergence.push('MEMORY_CONFLICT_DETECTED');
    blockers.push('MEMORY_CONFLICT');
    diagnostics.push('MEMORY_CONFLICT');
  }

  // Correção deveria gerar candidato: sinal de aprendizado a partir de
  // correção explícita, mesmo que o candidato ainda não exista.
  if (userCorrection?.isCorrection) {
    divergence.push('CORRECTION_SHOULD_GENERATE_CANDIDATE');
    diagnostics.push('USER_CORRECTION');
  }

  const status = blockers.length > 0
    ? 'BLOCKED'
    : divergence.length > 0
      ? 'DIVERGENT'
      : 'ALIGNED';

  return createReflectionReview({
    targetLayer: 'memory',
    status,
    confidence: clampStatusConfidence(divergence.length),
    expected,
    observed,
    divergence,
    blockers,
    diagnostics,
  });
}

function clampStatusConfidence(divergences) {
  const value = Math.max(0, Math.min(1, 1 - divergences * 0.25));
  return Math.round(value * 1000) / 1000;
}
