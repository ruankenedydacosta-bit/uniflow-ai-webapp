// Sprint 3 (Interpretação Semântica) — contrato + validador puro da
// interpretação de intenção financeira devolvida pela LLM (modo
// `financial_intent` da Edge Function uni-chat-llm).
//
// A Edge Function já valida o mesmo contrato no servidor (defesa em
// profundidade) -- este validador roda de novo no cliente porque a
// resposta HTTP, mesmo vinda de um servidor confiável, nunca é tratada
// como corretamente tipada sem checagem: um JSON vazio, malformado ou
// fora do contrato aqui SEMPRE cai no fallback seguro (fluxo
// determinístico existente), nunca lança e nunca é usado parcialmente.

export const FINANCIAL_INTENT_STATUS = Object.freeze({
  RESOLVED: 'resolved',
  NEEDS_CLARIFICATION: 'needs_clarification',
  NOT_FINANCIAL: 'not_financial',
  UNSUPPORTED: 'unsupported',
});

export const FINANCIAL_INTENT_TYPES = Object.freeze([
  'total_balance', 'account_balance', 'total_expenses', 'total_income',
  'expenses_by_account', 'expenses_by_category', 'income_by_account', 'income_by_category',
  'financial_summary', 'top_expenses', 'recent_transactions',
  'period_comparison', 'period_detail', 'query_refinement',
  'create_expense', 'create_income', 'create_transfer', 'set_balance',
  'not_financial', 'unsupported',
]);

// As únicas intenções de LEITURA que esta Sprint efetivamente executa
// (ver semanticFinancialQuery.js). Intenções de escrita (create_*/
// set_balance) são reconhecidas mas NUNCA executadas por aqui -- apenas
// encaminhadas para o fluxo determinístico de registro já existente
// (financialConversation.interpret), que já exige confirmação explícita.
export const FINANCIAL_INTENT_READ_TYPES = Object.freeze([
  'total_balance', 'account_balance', 'total_expenses', 'total_income',
  'expenses_by_account', 'expenses_by_category', 'income_by_account', 'income_by_category',
  'financial_summary', 'top_expenses', 'recent_transactions',
  'period_comparison', 'period_detail', 'query_refinement',
]);

export const FINANCIAL_INTENT_WRITE_TYPES = Object.freeze([
  'create_expense', 'create_income', 'create_transfer', 'set_balance',
]);

export const FINANCIAL_INTENT_TOOL_NAMES = Object.freeze([
  'get_financial_summary', 'get_expense_breakdown', 'compare_financial_periods',
  'get_goal_progress', 'get_account_summary', 'get_recurring_expenses',
]);

const STATUS_SET = new Set(Object.values(FINANCIAL_INTENT_STATUS));
const INTENT_SET = new Set(FINANCIAL_INTENT_TYPES);
const TOOL_SET = new Set(FINANCIAL_INTENT_TOOL_NAMES);
const REASONING_TAG_PATTERN = /^[a-z0-9_]{2,40}$/;
const MAX_REASONING_TAGS = 6;

// Sprint 4 (Bloco 4.2.1): extensão ADITIVA e retrocompatível do contrato --
// campos ausentes caem nos defaults abaixo (isCompound: false, subIntents:
// [], requestedCapabilities: []), então toda interpretação da Sprint 3
// continua válida sem nenhuma mudança. `requestedCapabilities` só valida
// FORMATO aqui (uni-llm não deve depender do registro de capacidades, que
// vive em uni-chat) -- a existência real da capacidade é checada depois,
// no orquestrador semântico, que tem acesso ao registro.
const CAPABILITY_ID_PATTERN = /^[a-z0-9_]{2,40}$/;
const MAX_SUB_INTENTS = 3;
const MAX_REQUESTED_CAPABILITIES = 5;

function safeString(value, max = 200) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

function validateEntities(rawEntities) {
  const source = (rawEntities && typeof rawEntities === 'object' && !Array.isArray(rawEntities))
    ? rawEntities
    : {};
  const transactionType = ['expense', 'income', 'transfer'].includes(source.transactionType)
    ? source.transactionType
    : null;
  const amountNumber = Number(source.amount);
  const amount = source.amount != null && Number.isFinite(amountNumber) && amountNumber > 0
    ? amountNumber
    : null;
  return Object.freeze({
    transactionType,
    amount,
    account: safeString(source.account, 60),
    category: safeString(source.category, 60),
    description: safeString(source.description, 160),
    period: safeString(source.period, 80),
    comparisonPeriod: safeString(source.comparisonPeriod, 80),
  });
}

// Sub-interpretação de uma consulta composta ("Quanto gastei e qual minha
// maior despesa?") -- mesmo formato de intent+entities do contrato
// principal, sem aninhamento adicional (subIntents não têm subIntents).
// Retorna null (nunca lança) se o item não for minimamente válido; itens
// inválidos são descartados silenciosamente, nunca travam a interpretação
// inteira -- consistente com "falha parcial não apaga resultados válidos".
function validateSubIntent(rawSubIntent) {
  if (!rawSubIntent || typeof rawSubIntent !== 'object' || Array.isArray(rawSubIntent)) return null;
  const intent = typeof rawSubIntent.intent === 'string' && INTENT_SET.has(rawSubIntent.intent)
    ? rawSubIntent.intent
    : null;
  if (!intent) return null;
  return Object.freeze({
    intent,
    entities: validateEntities(rawSubIntent.entities),
  });
}

// Validador puro: nunca lança. Qualquer desvio do contrato devolve
// { valid: false, reason }, nunca uma interpretação parcialmente confiável.
export function validateFinancialIntentResponse(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, reason: 'empty_or_not_object' };
  }

  const status = raw.status;
  if (typeof status !== 'string' || !STATUS_SET.has(status)) {
    return { valid: false, reason: 'invalid_status' };
  }

  let intent = null;
  if (raw.intent !== null && raw.intent !== undefined) {
    if (typeof raw.intent !== 'string' || !INTENT_SET.has(raw.intent)) {
      return { valid: false, reason: 'invalid_intent' };
    }
    intent = raw.intent;
  }

  const confidence = typeof raw.confidence === 'number' ? raw.confidence : Number(raw.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return { valid: false, reason: 'invalid_confidence' };
  }

  const entities = validateEntities(raw.entities);

  let suggestedTool = null;
  if (raw.suggestedTool !== null && raw.suggestedTool !== undefined) {
    suggestedTool = typeof raw.suggestedTool === 'string' && TOOL_SET.has(raw.suggestedTool)
      ? raw.suggestedTool
      : null;
  }

  const clarificationQuestion = safeString(raw.clarificationQuestion, 200);
  if (status === FINANCIAL_INTENT_STATUS.NEEDS_CLARIFICATION && !clarificationQuestion) {
    return { valid: false, reason: 'missing_clarification_question' };
  }

  const reasoningTags = [];
  if (Array.isArray(raw.reasoningTags)) {
    for (const tag of raw.reasoningTags) {
      if (reasoningTags.length >= MAX_REASONING_TAGS) break;
      if (typeof tag === 'string' && REASONING_TAG_PATTERN.test(tag)) reasoningTags.push(tag);
    }
  }

  // Sprint 4 (Bloco 4.2.1) -- campos aditivos, sempre com default seguro.
  const isCompound = raw.isCompound === true;
  const subIntents = [];
  if (isCompound && Array.isArray(raw.subIntents)) {
    for (const rawSub of raw.subIntents) {
      if (subIntents.length >= MAX_SUB_INTENTS) break;
      const validated = validateSubIntent(rawSub);
      if (validated) subIntents.push(validated);
    }
  }

  const requestedCapabilities = [];
  if (Array.isArray(raw.requestedCapabilities)) {
    for (const capabilityId of raw.requestedCapabilities) {
      if (requestedCapabilities.length >= MAX_REQUESTED_CAPABILITIES) break;
      if (typeof capabilityId === 'string' && CAPABILITY_ID_PATTERN.test(capabilityId)) {
        requestedCapabilities.push(capabilityId);
      }
    }
  }

  const operation = ['read', 'write', 'clarify', 'compare', 'refine'].includes(raw.operation)
    ? raw.operation
    : null;

  return {
    valid: true,
    interpretation: Object.freeze({
      status,
      intent,
      confidence,
      entities,
      suggestedTool,
      clarificationQuestion,
      reasoningTags: Object.freeze(reasoningTags),
      operation,
      isCompound: subIntents.length > 0 ? true : false,
      subIntents: Object.freeze(subIntents),
      requestedCapabilities: Object.freeze(requestedCapabilities),
    }),
  };
}

export function isFinancialIntentReadType(intent) {
  return FINANCIAL_INTENT_READ_TYPES.includes(intent);
}

export function isFinancialIntentWriteType(intent) {
  return FINANCIAL_INTENT_WRITE_TYPES.includes(intent);
}
