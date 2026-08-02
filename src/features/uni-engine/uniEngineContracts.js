// Contratos puros do Uni Engine (Fase 1 — Shadow Mode).
//
// Definem as formas de dados de TODA a entrada e saída do motor. Nenhum
// contrato contém funções, instâncias de áudio, cliente Supabase ou dados
// não serializáveis — o motor é uma camada analítica pura e descartável.
//
// Entrada conceitual:
//   {
//     message: { id, text, source, createdAt },
//     session: { userId, workspaceId, conversationId },
//     context: {
//       pendingAction,
//       conversationHistory,
//       financialSnapshot,
//       userPreferences,
//       currentRoute
//     },
//     currentPipeline: { detectedIntent, pendingIntent, pendingActive, resultType }
//   }
//
// Saída conceitual:
//   {
//     engineVersion,
//     correlationId,
//     normalizedMessage,
//     classification,
//     epistemicState,
//     plan,
//     validation,
//     shadowComparison,
//     diagnostics
//   }

// A versão 2.0 reflete a Fase 2 (Integração Cognitiva Assistida). Todos os
// contratos da Fase 1 continuam válidos e estáveis; a Fase 2 apenas adiciona
// seções novas de saída (cognitiveContext, referenceResolution, suggestions,
// agreementMetrics, divergenceDiagnostics, operationalMemory).
export const UNI_ENGINE_VERSION = '2.0';

// Fase 10 (Production Readiness) — revisão de consolidação. A versão
// funcional permanece UNI_ENGINE_VERSION (compatibilidade total); a revisão
// indica o nível de consolidação atual (health check, observability,
// envelopes padronizados e documentação). Nunca influencia o comportamento.
export const UNI_ENGINE_REVISION = '10.0';

// Nomes canônicos dos módulos da Uni Engine (Fases 1–9). Usados por health
// check e observability; qualquer outro nome é rejeitado pelos contratos.
export const UNI_ENGINE_MODULE_NAMES = Object.freeze([
  'core',
  'memory',
  'epistemic',
  'decision',
  'planning',
  'goals',
  'reflection',
  'activation',
  'telemetry',
]);

export const UNI_ENGINE_MESSAGE_TYPES = Object.freeze([
  'action',
  'query',
  'continuation',
  'confirmation',
  'correction',
  'cancellation',
  'clarification',
  'small_talk',
  'unsupported',
]);

export const UNI_ENGINE_PLAN_DECISIONS = Object.freeze([
  'respond',
  'ask',
  'confirm',
  'execute',
  'cancel',
  'defer',
  'reject',
]);

export const UNI_ENGINE_EPISTEMIC_STATUSES = Object.freeze([
  'confirmed_database',
  'confirmed_user',
  'inferred_high',
  'inferred_low',
  'ambiguous',
  'missing',
  'stale',
  'conflicting',
]);

export const UNI_ENGINE_COMPARISON_STATUSES = Object.freeze([
  'agreement',
  'intent_divergence',
  'pending_context_divergence',
  'missing_field_divergence',
  'action_query_divergence',
  'confidence_gap',
  'pipeline_unknown',
  'engine_unknown',
]);

export const UNI_ENGINE_MESSAGE_SOURCES = Object.freeze(['text', 'voice']);

export const UNI_ENGINE_THEORETICAL_EXECUTORS = Object.freeze([
  'execute_confirmed_financial_action',
  'FinancialQueryEngine',
  'createAssistantResponse',
  'category_inference',
  null,
]);

// Intents financeiras do pipeline atual (uni-intents) que o motor reconhece
// como AÇÃO explícita. Espelha ACTION_STATEMENT_INTENTS/ACTION_INTENTS dos
// módulos validados — nunca uma lista paralela divergente.
export const UNI_ENGINE_ACTION_INTENTS = Object.freeze([
  'register_income',
  'register_expense',
  'register_transfer',
  'set_balance',
  'ambiguous_balance_or_income',
  'create_goal',
]);

export const UNI_ENGINE_QUERY_INTENTS = Object.freeze([
  'check_balance',
  'forecast',
  'question',
]);

// Fase 2 — tipos de referência implícita resolvíveis pelo motor. A resolução
// usa SOMENTE contexto atual + histórico recente + FinancialSnapshot (nunca
// LLM, nunca banco).
export const UNI_ENGINE_REFERENCE_TYPES = Object.freeze([
  'account',
  'value',
  'transaction',
  'entity',
  'intent',
  'none',
]);

// Fase 2 — proveniência de uma resolução. 'unresolved' significa que o motor
// reconheceu a referência mas não conseguiu resolvê-la com os dados locais.
export const UNI_ENGINE_REFERENCE_SOURCES = Object.freeze([
  'operational_memory',
  'conversation_history',
  'financial_snapshot',
  'pending_action',
  'user_message',
  'unresolved',
]);

// Fase 2 — tipos de divergência registrados no diagnóstico. O diagnóstico é
// PURAMENTE informativo: o pipeline nunca é alterado pelo motor.
export const UNI_ENGINE_DIVERGENCE_TYPES = Object.freeze([
  'pipeline_asked_known_field',
  'context_switch_new_pending',
  'action_query_divergence',
  'intent_divergence',
  'pending_context_divergence',
  'missing_field_divergence',
  'confidence_gap',
  'confirmation_without_pending',
  'correction_without_pending',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Verifica se um valor é serializável (JSON-safe, sem funções, sem Maps/Sets).
export function isSerializableValue(value, seen = new Set()) {
  if (value === null || value === undefined) return true;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return true;
  if (type === 'function' || type === 'symbol' || type === 'bigint') return false;
  if (type === 'object') {
    if (value instanceof Map || value instanceof Set) return false;
    if (seen.has(value)) return true;
    seen.add(value);
    if (Array.isArray(value)) {
      return value.every((item) => isSerializableValue(item, seen));
    }
    return Object.values(value).every((item) => isSerializableValue(item, seen));
  }
  return false;
}

// Lista de funções usadas para garantir que a saída NÃO contenha nenhuma
// função (teste contratual obrigatório do Shadow Mode).
export function findFunctionsInValue(value, path = '', found = []) {
  if (value === null || value === undefined) return found;
  const type = typeof value;
  if (type === 'function') {
    found.push(path || '(root)');
    return found;
  }
  if (type === 'object') {
    if (Array.isArray(value)) {
      value.forEach((item, index) => findFunctionsInValue(item, `${path}[${index}]`, found));
    } else {
      Object.entries(value).forEach(([key, item]) => {
        findFunctionsInValue(item, path ? `${path}.${key}` : key, found);
      });
    }
  }
  return found;
}

export function validateUniEngineInput(input) {
  const errors = [];
  if (!isPlainObject(input)) {
    return { valid: false, errors: ['INPUT_NOT_OBJECT'] };
  }
  const message = input.message;
  if (!isPlainObject(message)) {
    errors.push('MESSAGE_REQUIRED');
  } else {
    if (typeof message.text !== 'string' || !message.text.trim()) {
      errors.push('MESSAGE_TEXT_REQUIRED');
    }
    if (message.id != null && typeof message.id !== 'string' && typeof message.id !== 'number') {
      errors.push('MESSAGE_ID_INVALID');
    }
    if (
      message.source != null
      && !UNI_ENGINE_MESSAGE_SOURCES.includes(message.source)
    ) {
      errors.push('MESSAGE_SOURCE_INVALID');
    }
  }
  const session = input.session;
  if (!isPlainObject(session)) {
    errors.push('SESSION_REQUIRED');
  } else {
    if (session.userId != null && typeof session.userId !== 'string') {
      errors.push('SESSION_USER_ID_INVALID');
    }
    if (session.workspaceId != null && typeof session.workspaceId !== 'string') {
      errors.push('SESSION_WORKSPACE_ID_INVALID');
    }
    if (session.conversationId != null && typeof session.conversationId !== 'string') {
      errors.push('SESSION_CONVERSATION_ID_INVALID');
    }
  }
  if (input.context != null && !isPlainObject(input.context)) {
    errors.push('CONTEXT_INVALID');
  }
  if (input.currentPipeline != null && !isPlainObject(input.currentPipeline)) {
    errors.push('CURRENT_PIPELINE_INVALID');
  }
  return { valid: errors.length === 0, errors };
}

// Converte o FinancialSnapshot do aplicativo (que contém Maps: accountsById,
// accountBalancesById, expensesByCategory) na projeção plana e serializável
// exigida pelo contrato do motor. Nunca clona em profundidade dados que o
// motor não usa.
export function projectFinancialSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return {
      hasData: false,
      totalBalance: null,
      referenceDate: null,
      accounts: [],
      categories: [],
      recentTransactions: [],
    };
  }
  const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
  const categories = Array.isArray(snapshot.categories) ? snapshot.categories : [];
  const recent = Array.isArray(snapshot.recentTransactions)
    ? snapshot.recentTransactions
    : [];
  return {
    hasData: Boolean(snapshot.hasData),
    totalBalance:
      typeof snapshot.totalBalance === 'number' ? snapshot.totalBalance : null,
    referenceDate:
      typeof snapshot.referenceDate === 'string' ? snapshot.referenceDate : null,
    accounts: accounts.slice(0, 50).map((account) => ({
      id: account?.id ?? null,
      name: account?.name ?? null,
      current_balance:
        typeof account?.current_balance === 'number' ? account.current_balance : null,
    })),
    categories: categories.slice(0, 50).map((category) => ({
      id: category?.id ?? null,
      name: category?.name ?? null,
    })),
    recentTransactions: recent.slice(0, 5).map((tx) => ({
      id: tx?.id ?? null,
      description: tx?.description ?? null,
      amount: typeof tx?.amount === 'number' ? tx.amount : null,
      transaction_type: tx?.transaction_type ?? null,
      account_id: tx?.account_id ?? null,
      category_id: tx?.category_id ?? null,
    })),
  };
}

export function createCorrelationId(prefix = 'ue') {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export function createEmptyUniEngineResult({ correlationId, engineVersion = UNI_ENGINE_VERSION }) {
  return {
    engineVersion,
    correlationId,
    normalizedMessage: null,
    classification: null,
    epistemicState: null,
    plan: null,
    validation: null,
    shadowComparison: null,
    // Fase 2 — seções novas; ausentes ou nulas nos caminhos de erro/skip.
    cognitiveContext: null,
    referenceResolution: null,
    suggestions: null,
    agreementMetrics: null,
    divergenceDiagnostics: [],
    operationalMemory: null,
    // Fase 3 — memória persistente recuperada/capturada SOMENTE para Shadow.
    // `appliedToDecision` permanece SEMPRE falso nesta fase.
    persistentMemory: null,
    // Fase 4 — Modelo Epistêmico completo SOMENTE para Shadow. Nenhuma
    // afirmação autoriza execução; `appliedToDecision` permanece SEMPRE
    // falso. Ausente ou nulo quando a flag epistêmica está desligada.
    epistemicModel: null,
    // Fase 5 — Camada de Decisão Cognitiva SOMENTE para Shadow. A decisão
    // recomendada nunca é aplicada (`shadow.appliedToDecision` = false).
    // Ausente ou nulo quando a flag de decisão está desligada.
    decisionLayer: null,
    // Fase 6 — plano multi-etapas estruturado e descartável. Nunca executado.
    planning: null,
    // Fase 7 — Goal Engine estruturado SOMENTE para Shadow. Objetivos são
    // representados e avaliados, nunca persistidos (`shadow.appliedToDecision`
    // permanece SEMPRE falso). Ausente ou nulo quando a flag está desligada.
    goals: null,
    // Fase 8 — Reflection & Learning Engine SOMENTE para Shadow. Revisa a
    // interação e gera candidatos de aprendizado que NUNCA são aplicados
    // (`shadow.applied/persisted/changedBehavior` permanecem SEMPRE falsos).
    // Ausente ou nulo quando a flag de reflexão está desligada.
    reflection: null,
    // Fase 9 — Activation Engine (ativação gradual). Avalia capacidades e
    // decide o que PODE influenciar o pipeline real de forma controlada,
    // reversível e limitada. Ausente ou nulo quando a flag de activation
    // está desligada. Nenhuma capacidade nasce ativa.
    activation: null,
    diagnostics: {
      rulesUsed: [],
      ambiguities: [],
      fallbackUsed: false,
      errorCode: null,
      divergenceCount: 0,
    },
  };
}
