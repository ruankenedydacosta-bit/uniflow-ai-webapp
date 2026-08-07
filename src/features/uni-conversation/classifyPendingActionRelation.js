// BUG 2 (Sprint 4, Bloco 4.0): classificação central de "essa mensagem
// nova responde a uma Pending Action ativa, ou muda de assunto?" --
// substitui a checagem estreita e espalhada que existia antes (só
// `isLikelyFinancialQuestion`, uma allowlist de ~11 palavras interrogativas
// no início da frase, usada em apenas 2 dos vários pontos que consomem
// texto durante uma pendência).
//
// Causa raiz do bug antigo: nenhum lugar decidia "isso parece resposta ou
// mudança de assunto" antes de `resolvePendingActionInput` tratar QUALQUER
// texto não vazio como candidato a nome de conta/categoria. Frases como
// "Estou gastando demais?" (pergunta sem pronome interrogativo inicial)
// passavam despercebidas e viravam propostas de criação de conta.
//
// Este módulo é 100% determinístico e local -- nenhuma chamada de rede,
// nenhuma dependência de LLM (ver relatório do Ciclo 1: uso de LLM para
// esta classificação fica para um bloco futuro da Sprint 4; aqui a meta é
// corrigir o bug com a arquitetura já existente, sem introduzir um novo
// orquestrador semântico). Reaproveita utilitários já testados:
// `normalizeFinancialText`, `resolveRelativeDateExpression`,
// `classifyPendingActionReply`.
import { normalizeFinancialText, resolveRelativeDateExpression } from '../uni-intents/index.js';
import { classifyPendingActionReply } from './pendingActionInput.js';

export const PENDING_ACTION_RELATIONS = Object.freeze({
  ANSWERS_PENDING: 'answers_pending',
  CHANGES_SUBJECT: 'changes_subject',
  AMBIGUOUS: 'ambiguous',
});

const IDENTITY_FIELDS = Object.freeze(['name', 'institution_name', 'institution', 'nickname', 'alias']);

// Mesmo padrão de "campos aguardados" documentado na auditoria (
// financialIntentAction.js / financialPendingActionFlow.js): 'account' e
// 'destinationAccount' esperam nome de conta; 'category' espera nome de
// categoria; 'date' espera expressão temporal.
const ACCOUNT_FIELDS = new Set(['account', 'destinationAccount', 'account_required']);
const CATEGORY_FIELDS = new Set(['category', 'category_required']);
const DATE_FIELDS = new Set(['date', 'date_invalid']);

// Sinal de pergunta muito mais amplo que o antigo `isLikelyFinancialQuestion`
// (que só reconhecia frases começando por uma das ~11 palavras
// interrogativas): qualquer frase terminada em "?" é tratada como pergunta
// -- é exatamente o sinal que faltava para "Estou gastando demais?".
const QUESTION_MARK = /\?\s*$/;
const INTERROGATIVE_START = /^\s*(?:qual|quais|quanto|quantos|quantas|quando|onde|como|que|quem|por que|porque|o que|para que|será que|sera que|é normal|posso|devo)\b/i;

function readIdentityField(item, field) {
  return field.split('.').reduce((current, key) => current?.[key], item);
}

function findIdentityMatch(items, text) {
  const normalizedInput = normalizeFinancialText(text);
  if (!normalizedInput) return null;
  const active = (Array.isArray(items) ? items : []).filter((item) => item?.is_active !== false);
  const exact = active.find((item) => IDENTITY_FIELDS.some((field) => normalizeFinancialText(readIdentityField(item, field)) === normalizedInput));
  if (exact) return exact;
  return active.find((item) => IDENTITY_FIELDS.some((field) => {
    const identity = normalizeFinancialText(readIdentityField(item, field));
    return identity && (normalizedInput.includes(identity) || identity.includes(normalizedInput));
  })) ?? null;
}

function looksLikeQuestionOrNewTopic(text) {
  return QUESTION_MARK.test(text) || INTERROGATIVE_START.test(text);
}

function resolvePendingField(pendingAction) {
  return pendingAction?.field
    ?? pendingAction?.issues?.[0]?.field
    ?? pendingAction?.action?.issues?.[0]?.field
    ?? null;
}

function buildDefaultClarification(pendingAction, amountLabel) {
  const label = amountLabel ? ` os ${amountLabel}` : ' esse lançamento';
  return `Você quer continuar registrando${label} ou prefere falar sobre outra coisa agora?`;
}

// Retorno estruturado:
// { relation: 'answers_pending' | 'changes_subject' | 'ambiguous',
//   confidence: number, normalizedInput: string|null, reason: string,
//   suggestedClarification: string|null }
export function classifyPendingActionRelation({
  pendingAction = null,
  userText = '',
  conversationContext = {},
  availableAccounts = [],
  availableCategories = [],
} = {}) {
  const text = typeof userText === 'string' ? userText.trim() : '';

  if (!text) {
    return {
      relation: PENDING_ACTION_RELATIONS.AMBIGUOUS,
      confidence: 0,
      normalizedInput: null,
      reason: 'empty_input',
      suggestedClarification: buildDefaultClarification(pendingAction, conversationContext.amountLabel),
    };
  }

  // "confirmar"/"cancelar" e variações -- sempre respondem à pendência,
  // nunca mudam de assunto (mesmo padrão já testado em pendingActionInput.js).
  const replyType = classifyPendingActionReply(text);
  if (replyType === 'confirm' || replyType === 'cancel') {
    return {
      relation: PENDING_ACTION_RELATIONS.ANSWERS_PENDING,
      confidence: 1,
      normalizedInput: text,
      reason: `reply_${replyType}`,
      suggestedClarification: null,
    };
  }

  const field = resolvePendingField(pendingAction);

  // Match direto contra conta/categoria realmente existente tem prioridade
  // sobre qualquer heurística de "parece pergunta" -- "Foi no Nubank?" (com
  // "?") deve responder à pendência, não mudar de assunto, se "Nubank"
  // bate com uma conta real.
  if (ACCOUNT_FIELDS.has(field)) {
    const match = findIdentityMatch(availableAccounts, text);
    if (match) {
      return {
        relation: PENDING_ACTION_RELATIONS.ANSWERS_PENDING,
        confidence: 0.95,
        normalizedInput: match.name,
        reason: 'matches_known_account',
        suggestedClarification: null,
      };
    }
  }

  if (CATEGORY_FIELDS.has(field)) {
    const match = findIdentityMatch(availableCategories, text);
    if (match) {
      return {
        relation: PENDING_ACTION_RELATIONS.ANSWERS_PENDING,
        confidence: 0.95,
        normalizedInput: match.name,
        reason: 'matches_known_category',
        suggestedClarification: null,
      };
    }
  }

  if (DATE_FIELDS.has(field)) {
    const resolved = resolveRelativeDateExpression(text, conversationContext.referenceDate ?? null);
    if (resolved?.resolvedDate) {
      return {
        relation: PENDING_ACTION_RELATIONS.ANSWERS_PENDING,
        confidence: 0.9,
        normalizedInput: resolved.resolvedDate,
        reason: 'matches_date_expression',
        suggestedClarification: null,
      };
    }
  }

  // Nenhum match direto -- agora sim, o sinal de pergunta/novo assunto
  // decide. É aqui que "Estou gastando demais?"/"Quem foi Einstein?"
  // deixam de ser tratados como resposta.
  if (looksLikeQuestionOrNewTopic(text)) {
    return {
      relation: PENDING_ACTION_RELATIONS.CHANGES_SUBJECT,
      confidence: 0.8,
      normalizedInput: null,
      reason: 'looks_like_question_or_new_topic',
      suggestedClarification: null,
    };
  }

  // Texto curto, sem "?", sem bater em nenhuma conta/categoria conhecida,
  // em um campo que espera nome livre (ex.: nova conta/categoria a criar)
  // -- ainda pode ser uma resposta legítima (ex.: "Carteira", "Mercado
  // Livre"), então não é automaticamente "muda de assunto"; mas também não
  // temos confiança suficiente para tratar como resposta certa sem
  // perguntar, já que o texto não bateu em nada conhecido.
  return {
    relation: PENDING_ACTION_RELATIONS.AMBIGUOUS,
    confidence: 0.3,
    normalizedInput: null,
    reason: 'no_clear_signal',
    suggestedClarification: buildDefaultClarification(pendingAction, conversationContext.amountLabel),
  };
}
