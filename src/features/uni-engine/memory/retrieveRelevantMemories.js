// Recuperação e ranking determinístico de memórias relevantes (Fase 3).
//
// retrieveRelevantMemories({ memories, message, cognitiveContext, limit, policy, now }):
//   - filtra expiradas, contestadas, superseded, deleted, rejected;
//   - ordena por score determinístico (sujeito, status, tipo×intent, recência,
//     confiança, nº de evidências);
//   - limita a quantidade;
//   - nunca entrega o histórico inteiro.
//
// Função pura — o repository entrega os candidatos, o ranking decide.
import {
  MEMORY_POLICY,
  getRetentionForType,
} from './memoryPolicy.js';
import { parseMemorySubject } from './normalizeMemorySubject.js';
import { projectMemoryForEngine } from './memoryContracts.js';

// Mapeamento tipo × intent: quais tipos de memória importam para cada intent.
// Lista conservadora — memória NUNCA executa nem altera resposta.
const INTENT_MEMORY_TYPES = Object.freeze({
  check_balance: ['account_preference', 'user_declared_fact', 'episodic_context'],
  register_expense: [
    'merchant_category_association',
    'merchant_account_association',
    'account_preference',
    'category_preference',
    'episodic_context',
  ],
  register_income: ['account_preference', 'episodic_context'],
  register_transfer: ['account_preference', 'episodic_context'],
  set_balance: ['account_preference', 'episodic_context'],
  create_goal: ['procedure_preference', 'episodic_context'],
  question: [
    'user_declared_fact',
    'account_preference',
    'conversation_preference',
    'episodic_context',
  ],
});

const STATUS_ACTIVE_BONUS = Object.freeze({
  active: 2.0,
  confirmed: 1.8,
  candidate: 0.5,
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

// Tokens da mensagem para correspondência de subjectKey.
function messageTokens(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const tokens = text.toLowerCase().match(/[a-z0-9à-ú]+/g) ?? [];
  const stop = new Set([
    'de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a', 'os', 'as', 'um', 'uma',
    'para', 'por', 'no', 'na', 'nos', 'nas', 'com', 'em', 'se', 'eu', 'voce',
    'quando', 'falar', 'use', 'sempre', 'nao', 'prefiro', 'que',
  ]);
  return tokens.filter((token) => !stop.has(token) && token.length > 2);
}

function subjectMatchScore(subjectKey, tokens) {
  const parsed = parseMemorySubject(subjectKey);
  if (!parsed || tokens.length === 0) return 0;
  const entityTokens = parsed.entity.split(' ').filter((token) => token.length > 2);
  if (entityTokens.length === 0) return 0;
  let exact = 0;
  let partial = 0;
  for (const entityToken of entityTokens) {
    if (tokens.includes(entityToken)) exact += 1;
    else if (tokens.some((token) => token.includes(entityToken) || entityToken.includes(token))) {
      partial += 1;
    }
  }
  if (exact === entityTokens.length) return 1;
  return exact * 0.7 + partial * 0.3;
}

export function retrieveRelevantMemories({
  memories = null,
  message = null,
  cognitiveContext = null,
  limit = null,
  policy = MEMORY_POLICY,
  now = Date.now(),
} = {}) {
  const safePolicy = isPlainObject(policy) ? policy : MEMORY_POLICY;
  const list = safeArray(memories);
  const maxLimit = limit ?? safePolicy.maxRetrievedMemories;
  const cappedLimit = Math.min(Math.max(Number(maxLimit) || 1, 1), 50);
  const intent = cognitiveContext?.intent
    ?? cognitiveContext?.currentIntent
    ?? null;
  const tokens = messageTokens(typeof message === 'string' ? message : message?.text);

  const excluded = {
    expired: 0,
    inactive: 0,
    blocked: 0,
  };

  const scored = [];
  for (const raw of list) {
    if (!isPlainObject(raw)) continue;
    const item = isPlainObject(raw.value) && raw.value ? raw : raw;
    if (item.status === 'deleted' || item.status === 'rejected') {
      excluded.inactive += 1;
      continue;
    }
    if (item.status === 'superseded' || item.status === 'contested') {
      excluded.inactive += 1;
      continue;
    }
    if (item.expiresAt != null && new Date(item.expiresAt).getTime() <= now) {
      excluded.expired += 1;
      continue;
    }
    if (
      item.metadata?.blockedUntil != null
      && new Date(item.metadata.blockedUntil).getTime() > now
    ) {
      excluded.blocked += 1;
      continue;
    }

    const statusBonus = STATUS_ACTIVE_BONUS[item.status] ?? 0;
    const subjectScore = subjectMatchScore(item.subjectKey, tokens);

    // Recência dentro da janela de retenção do tipo (0..1).
    const retention = getRetentionForType(item.memoryType, safePolicy);
    let recency;
    if (retention != null) {
      const age = now - new Date(item.lastSeenAt ?? now).getTime();
      recency = Math.max(0, 1 - age / retention);
    } else {
      recency = 1;
    }

    const intentTypes = INTENT_MEMORY_TYPES[intent] ?? [];
    const typeMatch = intentTypes.includes(item.memoryType) ? 1 : 0;
    const confidence = Number(item.confidence) || 0;
    const evidenceScore = Math.min(1, (Number(item.evidenceCount) || 0) / 5);

    const score = (
      statusBonus * 1.0
      + subjectScore * 2.0
      + typeMatch * 1.0
      + recency * 0.5
      + confidence * 0.5
      + evidenceScore * 0.2
    );

    scored.push({ item, score });
  }

  scored.sort((left, right) => right.score - left.score || 0);
  const selected = scored.slice(0, cappedLimit).map((entry) => projectMemoryForEngine(entry.item));

  return {
    memories: selected,
    diagnostics: {
      evaluated: list.length,
      retrieved: selected.length,
      limit: cappedLimit,
      excludedExpired: excluded.expired,
      excludedInactive: excluded.inactive,
      excludedBlocked: excluded.blocked,
      appliedToDecision: false,
    },
  };
}
