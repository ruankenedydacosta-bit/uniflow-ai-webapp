// Planejador cognitivo do Uni Engine (Fase 1).
//
// Transforma intenção + contexto em uma decisão conceitual (respond, ask,
// confirm, execute, cancel, defer, reject). O plano NUNCA é executado nesta
// fase — `theoreticalExecutor` é apenas uma etiqueta para comparação.
const REQUIRED_FIELDS = Object.freeze({
  register_income: ['amount', 'account', 'category', 'description'],
  register_expense: ['amount', 'account', 'category', 'description'],
  register_transfer: ['amount', 'account', 'destinationAccount', 'description'],
  set_balance: ['amount', 'account'],
  create_goal: ['amount', 'description'],
});

// Exportado para a Fase 2 (contexto cognitivo) mapear o campo que o pipeline
// perguntou para o texto da pergunta sem duplicar as frases oficiais.
export const NEXT_QUESTION_BY_FIELD = Object.freeze({
  amount: {
    field: 'amount',
    text: 'Qual é o valor?',
  },
  account: {
    field: 'account_id',
    text: 'Em qual conta você fez esse lançamento?',
  },
  destinationAccount: {
    field: 'destination_account_id',
    text: 'Para qual conta foi essa transferência?',
  },
  category: {
    field: 'category_id',
    text: 'Em qual categoria devo registrar?',
  },
  description: {
    field: 'description',
    text: 'Sobre o que é esse lançamento?',
  },
  date: {
    field: 'date',
    text: 'Para qual data devo registrar?',
  },
  intent: {
    field: 'intent',
    text: 'Isso é uma receita ou um ajuste de saldo?',
  },
});

function collectData(epistemic) {
  const collected = {};
  const push = (key, entry, transform) => {
    if (entry?.value != null && entry.status !== 'missing') {
      collected[key] = typeof transform === 'function' ? transform(entry.value) : entry.value;
    }
  };
  push('amount', epistemic.amount, Number);
  push('accountName', epistemic.account);
  push('destinationAccountName', epistemic.destinationAccount);
  push('categoryName', epistemic.category);
  push('description', epistemic.description);
  push('date', epistemic.date);
  return collected;
}

function findMissingFields(planType, epistemic) {
  const required = REQUIRED_FIELDS[planType] ?? [];
  return required.filter((field) => {
    const entry = epistemic[field];
    if (field === 'destinationAccount') {
      return !epistemic.destinationAccount?.value || epistemic.destinationAccount.status === 'missing';
    }
    if (field === 'amount') {
      return entry?.value == null || Number(entry.value) <= 0 || entry.status === 'missing';
    }
    return !entry?.value || entry.status === 'missing' || entry.status === 'conflicting';
  });
}

function resolvePlanType(classification, analyzed, pendingIntent) {
  const intent = classification.primaryIntent;
  if (intent === 'confirm_pending') return 'confirm_pending_action';
  if (intent === 'cancel_pending') return 'cancel_pending';
  if (intent === 'safety_blocked') return 'safety_blocked';
  if (intent === 'small_talk') return 'small_talk';
  if (classification.messageType === 'continuation'
    || classification.messageType === 'clarification'
    || classification.messageType === 'correction') {
    return pendingIntent ?? 'unknown_pending';
  }
  if (classification.messageType === 'action') {
    if (intent === 'unclassified_financial_statement') return 'financial_statement';
    return intent ?? 'unknown_action';
  }
  if (classification.messageType === 'query') return 'financial_query';
  return 'unsupported';
}

export function createCognitivePlan(input, options = {}) {
  const classification = options.classification ?? null;
  const epistemic = options.epistemic ?? null;
  const analyzed = options.analyzed ?? null;
  const pendingIntent =
    analyzed?.compatibility?.pendingIntent
    ?? analyzed?.pending?.intent
    ?? null;

  if (!classification || !epistemic) {
    return {
      decision: 'defer',
      planType: 'unknown',
      collectedData: {},
      missingFields: [],
      requiresConfirmation: false,
      nextQuestion: null,
      theoreticalExecutor: null,
      risks: [],
      blockers: ['MISSING_CLASSIFICATION'],
    };
  }

  const messageType = classification.messageType;
  const planType = resolvePlanType(classification, analyzed, pendingIntent);
  const risks = [];
  const blockers = [];

  // Cancelamento.
  if (messageType === 'cancellation') {
    return {
      decision: 'cancel',
      planType,
      collectedData: {},
      missingFields: [],
      requiresConfirmation: false,
      nextQuestion: null,
      theoreticalExecutor: null,
      risks: [],
      blockers: [],
    };
  }

  // Segurança.
  if (classification.safetyBlocked) {
    return {
      decision: 'reject',
      planType,
      collectedData: {},
      missingFields: [],
      requiresConfirmation: false,
      nextQuestion: null,
      theoreticalExecutor: null,
      risks: ['safety_blocked_action'],
      blockers: ['SAFETY_BLOCKED'],
    };
  }

  // Confirmação explícita de pendência.
  if (messageType === 'confirmation') {
    return {
      decision: 'confirm',
      planType,
      collectedData: {},
      missingFields: [],
      requiresConfirmation: true,
      nextQuestion: null,
      theoreticalExecutor: 'execute_confirmed_financial_action',
      risks: [],
      blockers: pendingIntent ? [] : ['NO_PENDING_ACTION'],
    };
  }

  // Consulta.
  if (messageType === 'query') {
    return {
      decision: 'respond',
      planType: 'financial_query',
      collectedData: {},
      missingFields: [],
      requiresConfirmation: false,
      nextQuestion: null,
      theoreticalExecutor: 'FinancialQueryEngine',
      risks: [],
      blockers: [],
    };
  }

  // Small talk / resposta direta.
  if (messageType === 'small_talk') {
    return {
      decision: 'respond',
      planType: 'small_talk',
      collectedData: {},
      missingFields: [],
      requiresConfirmation: false,
      nextQuestion: null,
      theoreticalExecutor: 'createAssistantResponse',
      risks: [],
      blockers: [],
    };
  }

  // Não suportado.
  if (messageType === 'unsupported') {
    return {
      decision: 'reject',
      planType,
      collectedData: {},
      missingFields: [],
      requiresConfirmation: false,
      nextQuestion: null,
      theoreticalExecutor: null,
      risks: [],
      blockers: ['UNSUPPORTED_MESSAGE'],
    };
  }

  // Ação financeira (nova, continuação, esclarecimento ou correção).
  const collectedData = collectData(epistemic);
  const missingFields = findMissingFields(planType, epistemic);

  // Correção/continuação sem pendência não tem alvo — o pipeline atual
  // também não sabe o que corrigir; nada a confirmar nem a perguntar.
  if (
    (messageType === 'correction' || messageType === 'continuation' || messageType === 'clarification')
    && !pendingIntent
  ) {
    return {
      decision: 'defer',
      planType,
      collectedData,
      missingFields,
      requiresConfirmation: false,
      nextQuestion: null,
      theoreticalExecutor: null,
      risks: ['pending_context_required'],
      blockers: ['NO_PENDING_CONTEXT'],
    };
  }

  if (
    classification.ambiguity
    || (classification.messageType === 'action'
      && classification.primaryIntent === 'ambiguous_balance_or_income')
  ) {
    return {
      decision: 'ask',
      planType: 'ambiguous_balance_or_income',
      collectedData,
      missingFields: ['intent'],
      requiresConfirmation: false,
      nextQuestion: NEXT_QUESTION_BY_FIELD.intent,
      theoreticalExecutor: 'execute_confirmed_financial_action',
      risks: ['ambiguous_balance_or_income'],
      blockers: [],
    };
  }

  if (missingFields.length > 0) {
    const firstMissing = missingFields[0];
    return {
      decision: 'ask',
      planType,
      collectedData,
      missingFields,
      requiresConfirmation: false,
      nextQuestion: NEXT_QUESTION_BY_FIELD[firstMissing] ?? null,
      theoreticalExecutor: 'execute_confirmed_financial_action',
      risks: [],
      blockers: [],
    };
  }

  if (epistemic.account?.status === 'ambiguous') {
    return {
      decision: 'ask',
      planType,
      collectedData,
      missingFields: ['account'],
      requiresConfirmation: false,
      nextQuestion: NEXT_QUESTION_BY_FIELD.account,
      theoreticalExecutor: 'execute_confirmed_financial_action',
      risks: ['ambiguous_account'],
      blockers: [],
    };
  }

  return {
    decision: 'confirm',
    planType,
    collectedData,
    missingFields: [],
    requiresConfirmation: true,
    nextQuestion: null,
    theoreticalExecutor: 'execute_confirmed_financial_action',
    risks,
    blockers,
  };
}
