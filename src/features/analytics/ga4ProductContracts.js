export const GA4_PRODUCT_EVENT_NAMES = Object.freeze({
  LOGIN: 'login',
  SIGN_UP: 'sign_up',
  SIGN_UP_VIEWED: 'sign_up_viewed',
  VOICE_STARTED: 'voice_started',
  VOICE_COMPLETED: 'voice_completed',
  TRANSACTION_CREATED: 'transaction_created',
  CALENDAR_EVENT_CREATED: 'calendar_event_created',
  BEGIN_CHECKOUT: 'begin_checkout',
  PAYMENT_METHOD_SELECTED: 'payment_method_selected',
  PIX_GENERATED: 'pix_generated',
  CARD_CHECKOUT_CREATED: 'card_checkout_created',
  SUBSCRIPTION_ACTIVATED: 'subscription_activated',
});

export const GA4_AUTH_METHODS = Object.freeze({
  PASSWORD: 'password',
  GOOGLE: 'google',
});

export const GA4_VOICE_INTERACTION_MODES = Object.freeze({
  VOICE_BUTTON: 'voice_button',
});

export const GA4_VOICE_RESULTS = Object.freeze({
  SUCCESS: 'success',
  CANCELLED: 'cancelled',
  ERROR: 'error',
});

export const GA4_TRANSACTION_DIRECTIONS = Object.freeze({
  ENTRY: 'entry',
  EXIT: 'exit',
});

export const GA4_PRODUCT_ORIGINS = Object.freeze({
  MANUAL: 'manual',
  VOICE: 'voice',
});

export const GA4_SCHEDULE_KINDS = Object.freeze({
  ALL_DAY: 'all_day',
  TIMED: 'timed',
});

export const GA4_PAYMENT_TYPES = Object.freeze({
  PIX: 'pix',
  CARD: 'card',
});

const EVENT_CONTRACTS = Object.freeze({
  [GA4_PRODUCT_EVENT_NAMES.LOGIN]: Object.freeze({
    method: Object.freeze(Object.values(GA4_AUTH_METHODS)),
  }),
  [GA4_PRODUCT_EVENT_NAMES.SIGN_UP]: Object.freeze({
    method: Object.freeze([GA4_AUTH_METHODS.PASSWORD]),
  }),
  [GA4_PRODUCT_EVENT_NAMES.SIGN_UP_VIEWED]: Object.freeze({}),
  [GA4_PRODUCT_EVENT_NAMES.VOICE_STARTED]: Object.freeze({
    interaction_mode: Object.freeze(Object.values(GA4_VOICE_INTERACTION_MODES)),
  }),
  [GA4_PRODUCT_EVENT_NAMES.VOICE_COMPLETED]: Object.freeze({
    result: Object.freeze(Object.values(GA4_VOICE_RESULTS)),
    interaction_mode: Object.freeze(Object.values(GA4_VOICE_INTERACTION_MODES)),
  }),
  [GA4_PRODUCT_EVENT_NAMES.TRANSACTION_CREATED]: Object.freeze({
    direction: Object.freeze(Object.values(GA4_TRANSACTION_DIRECTIONS)),
    origin: Object.freeze(Object.values(GA4_PRODUCT_ORIGINS)),
  }),
  [GA4_PRODUCT_EVENT_NAMES.CALENDAR_EVENT_CREATED]: Object.freeze({
    origin: Object.freeze(Object.values(GA4_PRODUCT_ORIGINS)),
    schedule_kind: Object.freeze(Object.values(GA4_SCHEDULE_KINDS)),
  }),
  [GA4_PRODUCT_EVENT_NAMES.BEGIN_CHECKOUT]: Object.freeze({}),
  [GA4_PRODUCT_EVENT_NAMES.PAYMENT_METHOD_SELECTED]: Object.freeze({
    payment_type: Object.freeze(Object.values(GA4_PAYMENT_TYPES)),
  }),
  // Fase 4B Lite: os três eventos comerciais abaixo fecham o funil
  // (pix_generated / card_checkout_created / subscription_activated) e
  // aceitam ZERO parâmetros personalizados por desenho -- nenhum dado
  // financeiro/pessoal (QR, copia-e-cola, valor, IDs) pode entrar aqui.
  [GA4_PRODUCT_EVENT_NAMES.PIX_GENERATED]: Object.freeze({}),
  [GA4_PRODUCT_EVENT_NAMES.CARD_CHECKOUT_CREATED]: Object.freeze({}),
  [GA4_PRODUCT_EVENT_NAMES.SUBSCRIPTION_ACTIVATED]: Object.freeze({}),
});

export function buildGa4ProductEvent(eventName, params = {}) {
  const contract = EVENT_CONTRACTS[eventName];
  if (!contract || !params || typeof params !== 'object' || Array.isArray(params)) {
    return null;
  }

  const safeParams = {};
  for (const [parameterName, allowedValues] of Object.entries(contract)) {
    const value = params[parameterName];
    if (!allowedValues.includes(value)) return null;
    safeParams[parameterName] = value;
  }

  return Object.freeze({
    eventName,
    params: Object.freeze(safeParams),
  });
}

export function resolveGa4TransactionDirection(transactionType) {
  if (transactionType === 'income') return GA4_TRANSACTION_DIRECTIONS.ENTRY;
  if (transactionType === 'expense') return GA4_TRANSACTION_DIRECTIONS.EXIT;
  return null;
}

export function resolveGa4ScheduleKind(item = {}) {
  return item.is_all_day === true || item.has_explicit_time === false
    ? GA4_SCHEDULE_KINDS.ALL_DAY
    : GA4_SCHEDULE_KINDS.TIMED;
}

export function resolveGa4PaymentType(paymentMethod) {
  if (paymentMethod === 'pix') return GA4_PAYMENT_TYPES.PIX;
  if (paymentMethod === 'credit_card') return GA4_PAYMENT_TYPES.CARD;
  return null;
}
