// Política central do Modelo Epistêmico (Fase 4 — Shadow Mode).
//
// TODOS os números epistêmicos (prioridade de fontes, pesos de evidência,
// parâmetros de confiança, janelas de staleness, limites) vivem neste único
// arquivo — nenhum número arbitrário espalhado pelo código.
//
// Princípios:
//   - determinística (sem LLM, sem aleatoriedade, sem rede);
//   - banco/FinancialSnapshot vence memória;
//   - confirmação/correção explícitas atuais vencem inferência;
//   - memória nunca substitui dado oficial;
//   - nenhuma afirmação autoriza execução nesta fase (Shadow Mode);
//   - confiança sempre explicável a partir de evidência.

export const EPISTEMIC_POLICY = Object.freeze({
  // Limites físicos de uma rodada de verificação (desempenho).
  limits: Object.freeze({
    maxItemsPerVerification: 40,
    maxEvidencePerItem: 16,
    maxContradictionsPerItem: 8,
    maxConflicts: 16,
    maxRecommendations: 12,
    maxEvidencePerTypeSummary: 24,
  }),

  // Prioridade entre fontes (seção 7). Menor número = maior prioridade.
  sourcePriority: Object.freeze({
    database_record: 1,
    financial_snapshot: 1,
    user_confirmation: 2,
    user_correction: 3,
    user_explicit_statement: 4,
    persistent_memory: 5,
    operational_memory: 6,
    conversation_context: 6,
    deterministic_inference: 7,
    system_rule: 7,
    external_source: 8, // reservado — não usado nesta fase
    unknown: 9,
  }),

  // Pesos determinísticos por tipo de evidência (podem ser negativos).
  evidenceWeights: Object.freeze({
    direct_database: 0.5,
    direct_user_statement: 0.35,
    user_confirmation: 0.4,
    user_correction: 0.55,
    repeated_observation: 0.2,
    memory_retrieval: 0.15,
    context_reference: 0.1,
    deterministic_rule: 0.25,
    contradicting_evidence: -0.45,
  }),

  // Fórmula da confiança (seção 8):
  //   conf = clamp01(base + scale * score + sourceFactor + bônus + penalidades)
  // onde score = clamp(-1, 1, soma(pesos) / sqrt(n)) após deduplicação.
  confidence: Object.freeze({
    base: 0.2,
    scale: 0.85,
    sourcePriorityFactorStep: 0.02, // max(0, (10 - prioridade) * step)
    confirmationBonus: 0.12,
    correctionBonus: 0.14,
    conflictPenaltyPerContradiction: 0.25,
    stalePenalty: 0.2,
    memoryCandidatePenalty: 0.15,
  }),

  // Faixas conceituais de confiança (0..1) — seção 8.
  bands: Object.freeze({
    insufficientMax: 0.24,
    lowMax: 0.49,
    moderateMax: 0.69,
    highMax: 0.89,
    veryHighMin: 0.9,
  }),

  // Suficiência de evidência (seção 9) — limiares por propósito.
  sufficiency: Object.freeze({
    displayMinConfidence: 0.7,
    suggestMinConfidence: 0.5,
    askMaxConfidence: 0.5,
    confirmMinConfidence: 0.8,
    storeMemoryMinConfidence: 0.6,
  }),

  // Janelas de staleness por domínio (seção 11) — null = nunca expira.
  // Domínio derivado do sujeito da afirmação (ver evaluateStaleness).
  stalenessWindowsMs: Object.freeze({
    balance: 7 * 24 * 60 * 60 * 1000, // saldo: validade curta
    transaction: null, // transação: histórica, não expira
    preference: 365 * 24 * 60 * 60 * 1000, // preferência: longa, corrigível
    episodic: 24 * 60 * 60 * 1000, // contexto episódico: curta
    recurring: 180 * 24 * 60 * 60 * 1000, // associação recorrente: renovável
    fact: 365 * 24 * 60 * 60 * 1000, // fato declarado: depende do domínio
    default: 90 * 24 * 60 * 60 * 1000,
  }),

  // A idade a partir da qual o item é considerado EXPIRADO (não apenas stale).
  expirationMultiplier: 3,

  // Suficiência de evidência mínima para item válido (evidência obrigatória).
  evidence: Object.freeze({
    minEvidenceForValidity: 1,
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

// Prioridade numérica de uma fonte (1 = mais alta).
export function getSourcePriority(source, policy = EPISTEMIC_POLICY) {
  return policy.sourcePriority[source] ?? policy.sourcePriority.unknown;
}

// Peso determinístico de um tipo de evidência.
export function getEvidenceWeight(evidenceType, policy = EPISTEMIC_POLICY) {
  return policy.evidenceWeights[evidenceType] ?? 0;
}

// Domínio de staleness de um item, derivado do sujeito (determinístico).
export function stalenessDomainForSubject(subject) {
  if (typeof subject !== 'string') return 'default';
  const normalized = subject.toLowerCase();
  if (normalized.includes('balance') || normalized.includes('saldo')) return 'balance';
  if (normalized.includes('transaction') || normalized.includes('transacao')
    || normalized.includes('expense') || normalized.includes('income')
    || normalized.includes('transfer')) return 'transaction';
  if (normalized.includes('preference') || normalized.includes('preferencia')) return 'preference';
  if (normalized.includes('episodic') || normalized.includes('episodico')) return 'episodic';
  if (normalized.includes('recurring') || normalized.includes('recorrencia')) return 'recurring';
  if (normalized.includes('fact') || normalized.includes('fato')) return 'fact';
  return 'default';
}

export function stalenessWindowMs(domain, policy = EPISTEMIC_POLICY) {
  // `undefined` cai no default; `null` (domínio sem expiração) permanece null.
  const value = policy.stalenessWindowsMs[domain];
  return value === undefined ? policy.stalenessWindowsMs.default : value;
}

// Faixa conceitual de uma confiança.
export function describeConfidence(confidence, policy = EPISTEMIC_POLICY) {
  const value = Number(confidence) || 0;
  if (value >= policy.bands.veryHighMin) return 'very_high';
  if (value > policy.bands.moderateMax) return 'high';
  if (value > policy.bands.lowMax) return 'moderate';
  if (value > policy.bands.insufficientMax) return 'low';
  return 'insufficient';
}

// -----------------------------------------------
// Resolução de prioridade entre dois itens (seção 7)
//
// Retorna o item que deve vencer quando dois itens disputam o mesmo sujeito.
// Temporalidade entra na política: entre duas fontes da MESMA prioridade,
// vence a mais recente (dado mais atual); memória antiga nunca vence banco.
// -----------------------------------------------
export function resolveEpistemicPriority(itemA, itemB, policy = EPISTEMIC_POLICY) {
  const a = itemA && typeof itemA === 'object' ? itemA : null;
  const b = itemB && typeof itemB === 'object' ? itemB : null;
  if (!a) return b;
  if (!b) return a;

  const priorityA = getSourcePriority(a.source ?? 'unknown', policy);
  const priorityB = getSourcePriority(b.source ?? 'unknown', policy);
  if (priorityA !== priorityB) {
    return priorityA < priorityB ? a : b;
  }

  // Mesma prioridade: correção/confirmação atuais vencem memória antiga.
  const recencyRank = { user_correction: 3, user_confirmation: 2 };
  const rankA = recencyRank[a.source] ?? 0;
  const rankB = recencyRank[b.source] ?? 0;
  if (rankA !== rankB) return rankA > rankB ? a : b;

  // Mesma fonte: o mais recentemente verificado vence.
  const timeA = Date.parse(a.lastVerifiedAt ?? '') || 0;
  const timeB = Date.parse(b.lastVerifiedAt ?? '') || 0;
  if (timeA !== timeB) return timeA > timeB ? a : b;

  // Empate total: maior confiança.
  return (a.confidence ?? 0) >= (b.confidence ?? 0) ? a : b;
}
