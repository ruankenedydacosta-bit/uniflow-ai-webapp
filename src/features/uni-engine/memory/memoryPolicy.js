// Política central da Memória Inteligente Persistente (Fase 3).
//
// TODOS os números da memória (pesos, limites, retenção, promoção, faixas de
// confiança) vivem neste único arquivo — nenhum número arbitrário fora daqui.
// A política é imutável e testável.
//
// Princípios:
//   - determinística (sem LLM, sem aleatoriedade);
//   - confiança define APENAS ranking nesta fase;
//   - confiança nunca autoriza execução nem pula confirmação financeira;
//   - associação financeira nunca executa ação automaticamente.

export const MEMORY_POLICY = Object.freeze({
  // Limites físicos (espelham os checks da migration 028).
  maxSubjectKeyLength: 200,
  maxValueBytes: 16384,
  maxMetadataKeys: 64,
  maxMetadataDepth: 8,
  maxEvidencePerMemory: 200,
  maxEvidenceSummaryBytes: 8192,

  // Recuperação: quantidade máxima devolvida ao Uni Engine por rodada.
  maxRetrievedMemories: 8,

  // Captura: máximo de candidatos persistidos por mensagem.
  maxCandidatesPerMessage: 3,

  // Faixas conceituais de confiança (0..1).
  confidence: Object.freeze({
    lowMax: 0.39,
    moderateMax: 0.69,
    highMax: 0.89,
    confirmedMin: 0.9,
  }),

  // Pesos determinísticos por tipo de evidência (podem ser negativos).
  weights: Object.freeze({
    explicit_user_statement: 0.45,
    user_confirmation: 0.4,
    user_correction: 0.5,
    repeated_selection: 0.2,
    accepted_suggestion: 0.15,
    rejected_suggestion: -0.4,
    behavior_pattern: 0.1,
    system_observation: 0.05,
  }),

  // Fórmula da confiança: conf = clamp01(base + scale * score), onde
  // score = clamp(-1, 1, soma(pesos) / sqrt(número de evidências)).
  confidenceFormula: Object.freeze({
    base: 0.35,
    scale: 0.65,
  }),

  // Promoção determinística de status.
  promotion: Object.freeze({
    confirmedMinEvidence: 2,
    confirmedMinConfidence: 0.75,
    activeMinEvidence: 3,
    activeMinConfidence: 0.8,
  }),

  // Rejeição explícita: redução de confiança + bloqueio temporário de uso.
  rejection: Object.freeze({
    blockedSuggestionMs: 24 * 60 * 60 * 1000,
  }),

  // Retenção por tipo (null = longo prazo, sem expiração automática).
  // Tipos renováveis reestendem a expiração a cada consolidação.
  retention: Object.freeze({
    user_preference: null,
    conversation_preference: null,
    account_preference: 365 * 24 * 60 * 60 * 1000,
    category_preference: 365 * 24 * 60 * 60 * 1000,
    merchant_category_association: 180 * 24 * 60 * 60 * 1000,
    merchant_account_association: 180 * 24 * 60 * 60 * 1000,
    user_correction: null,
    recurring_pattern: 90 * 24 * 60 * 60 * 1000,
    user_declared_fact: null,
    episodic_context: 24 * 60 * 60 * 1000,
    procedure_preference: null,
  }),

  // Tipos renováveis: o uso renova a expiração (mesma janela da retenção).
  renewableTypes: Object.freeze([
    'account_preference',
    'category_preference',
    'merchant_category_association',
    'merchant_account_association',
    'recurring_pattern',
  ]),

  // Cache local: TTL curto e chaveado por userId + workspaceId.
  cache: Object.freeze({
    ttlMs: 60 * 1000,
  }),
});

export function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function clampMinusOneOne(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

// Confiança consolidada a partir da lista de pesos de evidência.
export function computeConfidence(weights, policy = MEMORY_POLICY) {
  const list = Array.isArray(weights) ? weights.filter(Number.isFinite) : [];
  if (list.length === 0) return 0;
  const sum = list.reduce((acc, weight) => acc + weight, 0);
  const score = clampMinusOneOne(sum / Math.sqrt(list.length));
  return clamp01(policy.confidenceFormula.base + policy.confidenceFormula.scale * score);
}

// Faixa conceitual de uma confiança (0..1).
export function describeConfidence(confidence, policy = MEMORY_POLICY) {
  const value = Number(confidence) || 0;
  if (value >= policy.confidence.confirmedMin) return 'confirmed';
  if (value > policy.confidence.highMax) return 'high';
  if (value > policy.confidence.moderateMax) return 'moderate';
  return 'low';
}

// Peso determinístico de um tipo de evidência.
export function getEvidenceWeight(evidenceType, policy = MEMORY_POLICY) {
  return policy.weights[evidenceType] ?? 0;
}

// Janela de retenção de um tipo de memória (null = longo prazo).
export function getRetentionForType(memoryType, policy = MEMORY_POLICY) {
  return policy.retention[memoryType] ?? null;
}

// Candidato inicial derivado de UMA evidência (regra da seção 3 da
// especificação):
//   - afirmação explícita do usuário → pode virar confirmed;
//   - correção explícita → confirmed;
//   - ocorrência isolada/inferida → candidate;
//   - rejeição explícita → bloqueio, sem candidato.
export function initialStatusForEvidence(evidenceType) {
  if (evidenceType === 'user_confirmation' || evidenceType === 'user_correction') {
    return 'confirmed';
  }
  return 'candidate';
}
