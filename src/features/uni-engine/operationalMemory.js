// Memória Operacional do Uni Engine (Fase 2 — Integração Cognitiva Assistida).
//
// Memória temporária da conversa: dura somente enquanto a conversa está ativa
// e é mantida PELO CHAMADOR (componente/módulo que injeta o objeto via
// runUniEngineShadow). NUNCA é persistida — não cria banco, tabela, migration
// nem storage. Se o objeto for descartado, a memória desaparece com ele.
//
// O motor atualiza a memória por `updateOperationalMemory(memory, patch)` ao
// final de cada rodada válida. `buildMemoryPatch` é um construtor puro do
// patch, derivado apenas das saídas do motor — testável isoladamente.
import { normalizeSearchText } from '../../utils/searchText.js';

export const OPERATIONAL_MEMORY_FIELDS = Object.freeze([
  'lastIntent',
  'lastMessageType',
  'lastAction',
  'lastAccount',
  'lastAccountId',
  'lastCategory',
  'lastValue',
  'lastEntity',
  'lastExecutor',
  'lastPlanDecision',
  'lastPlanType',
  'lastConfirmation',
  'lastCorrection',
  'lastQuestion',
  'lastQuery',
  'lastSubject',
  'lastReference',
  'lastUserMessage',
  'lastUniMessage',
  'turnCount',
]);

function emptyMemory() {
  return {
    lastIntent: null,
    lastMessageType: null,
    lastAction: null,
    lastAccount: null,
    lastAccountId: null,
    lastCategory: null,
    lastValue: null,
    lastEntity: null,
    lastExecutor: null,
    lastPlanDecision: null,
    lastPlanType: null,
    lastConfirmation: null,
    lastCorrection: null,
    lastQuestion: null,
    lastQuery: null,
    lastSubject: null,
    lastReference: null,
    lastUserMessage: null,
    lastUniMessage: null,
    turnCount: 0,
  };
}

export function createOperationalMemory(seed = {}) {
  const safeSeed = seed && typeof seed === 'object' ? seed : {};
  return {
    ...emptyMemory(),
    ...OPERATIONAL_MEMORY_FIELDS.reduce((acc, field) => {
      if (field in safeSeed) acc[field] = safeSeed[field];
      return acc;
    }, {}),
  };
}

// Cópia serializável e segura da memória — é o que o motor expõe no resultado.
export function readOperationalMemory(memory) {
  const safeMemory = memory && typeof memory === 'object' ? memory : {};
  const copy = { ...emptyMemory() };
  for (const field of OPERATIONAL_MEMORY_FIELDS) {
    if (Object.hasOwn(safeMemory, field)) {
      copy[field] = safeMemory[field] ?? null;
    }
  }
  return copy;
}

// Atualiza a memória EM MODO IN-PLACE (o chamador é o dono do objeto) e
// devolve a própria memória. Apenas campos conhecidos são aplicados.
export function updateOperationalMemory(memory, patch = {}) {
  if (!memory || typeof memory !== 'object') return memory ?? null;
  const safePatch = patch && typeof patch === 'object' ? patch : {};
  for (const field of OPERATIONAL_MEMORY_FIELDS) {
    if (Object.hasOwn(safePatch, field)) {
      memory[field] = safePatch[field] ?? null;
    }
  }
  if (typeof safePatch.turnCount === 'number') {
    memory.turnCount = safePatch.turnCount;
  }
  return memory;
}

export function resetOperationalMemory(memory) {
  if (!memory || typeof memory !== 'object') return memory ?? null;
  return updateOperationalMemory(memory, emptyMemory());
}

function findAccountId(accountName, snapshot) {
  if (!accountName || !snapshot) return null;
  const normalized = normalizeSearchText(accountName);
  const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
  const match = accounts.find((account) => {
    const name = normalizeSearchText(account?.name ?? '');
    return name && (name === normalized || name.includes(normalized) || normalized.includes(name));
  });
  return match?.id ?? null;
}

function resolveLastAccount({ epistemic, snapshot }) {
  const entry = epistemic?.account ?? {};
  if (entry.value != null && entry.status !== 'missing' && entry.status !== 'ambiguous') {
    return {
      name: entry.value,
      id: findAccountId(entry.value, snapshot),
    };
  }
  return { name: null, id: null };
}

// Construtor puro do patch de memória. `lastUniMessage` vem do histórico
// analisado (fase 1); `lastQuestionAsked` vem do contexto cognitivo.
export function buildMemoryPatch({
  classification = null,
  plan = null,
  epistemic = null,
  referenceResolution = null,
  cognitiveContext = null,
  messageText = null,
  lastUniMessage = null,
  snapshot = null,
  memory = null,
} = {}) {
  const safeClassification = classification ?? {};
  const safePlan = plan ?? {};
  const messageType = safeClassification.messageType ?? null;
  const intent = safeClassification.primaryIntent ?? null;
  const account = resolveLastAccount({ epistemic, snapshot });
  const amount = epistemic?.amount?.value ?? null;
  const category = epistemic?.category?.value ?? null;
  const description = epistemic?.description?.value ?? null;
  const resolution = referenceResolution?.resolved ? referenceResolution.resolution : null;

  const patch = {
    lastIntent: intent,
    lastMessageType: messageType,
    lastAction:
      messageType === 'action' || messageType === 'confirmation' || messageType === 'cancellation'
        ? intent
        : undefined,
    lastAccount: account.name,
    lastAccountId: account.id,
    lastCategory:
      category != null && epistemic?.category?.status !== 'missing'
        ? category
        : undefined,
    lastValue: typeof amount === 'number' && amount > 0 ? amount : undefined,
    lastEntity: description ?? resolution?.description ?? undefined,
    lastExecutor: safePlan.executorExpected ?? safePlan.theoreticalExecutor ?? undefined,
    lastPlanDecision: safePlan.decision ?? undefined,
    lastPlanType: safePlan.planType ?? undefined,
    lastConfirmation:
      messageType === 'confirmation'
        ? 'confirmed'
        : messageType === 'cancellation'
          ? 'cancelled'
          : undefined,
    lastCorrection: messageType === 'correction' ? messageText : undefined,
    lastQuestion: cognitiveContext?.lastQuestionAsked ?? undefined,
    lastQuery: messageType === 'query' ? messageText : undefined,
    lastSubject: cognitiveContext?.currentSubject ?? undefined,
    lastReference: resolution
      ? {
          type: resolution.type,
          value: resolution.description ?? resolution.value,
          source: resolution.source,
          confidence: resolution.confidence,
        }
      : undefined,
    lastUserMessage: messageText,
    lastUniMessage: lastUniMessage ?? undefined,
    turnCount: ((memory?.turnCount ?? 0) + 1),
  };

  const finalPatch = {};
  for (const field of OPERATIONAL_MEMORY_FIELDS) {
    if (Object.hasOwn(patch, field) && patch[field] !== undefined) {
      finalPatch[field] = patch[field];
    }
  }
  return finalPatch;
}
