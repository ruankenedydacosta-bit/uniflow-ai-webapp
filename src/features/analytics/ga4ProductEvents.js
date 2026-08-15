import { emitGa4ProductEvent } from './ga4Client.js';
import { GA4_CONSENT_STATUS } from './ga4Contracts.js';
import {
  buildGa4ProductEvent,
  GA4_PRODUCT_EVENT_NAMES,
  GA4_VOICE_INTERACTION_MODES,
  resolveGa4PaymentType,
  resolveGa4ScheduleKind,
  resolveGa4TransactionDirection,
} from './ga4ProductContracts.js';

const invalidResult = (reason = 'invalid') => Object.freeze({ sent: false, reason });

export function createGa4ProductEventGateway({ emit = emitGa4ProductEvent } = {}) {
  function track(eventName, params) {
    const event = buildGa4ProductEvent(eventName, params);
    if (!event) return invalidResult();

    try {
      return emit(event.eventName, event.params) ?? invalidResult('failed');
    } catch {
      return invalidResult('failed');
    }
  }

  return Object.freeze({ track });
}

const productEventGateway = createGa4ProductEventGateway();

export function trackGa4ProductEvent(eventName, params) {
  return productEventGateway.track(eventName, params);
}

export function trackGa4Login(method) {
  return trackGa4ProductEvent(GA4_PRODUCT_EVENT_NAMES.LOGIN, { method });
}

export function trackGa4SignUp(method) {
  return trackGa4ProductEvent(GA4_PRODUCT_EVENT_NAMES.SIGN_UP, { method });
}

export function trackGa4SignUpViewed() {
  return trackGa4ProductEvent(GA4_PRODUCT_EVENT_NAMES.SIGN_UP_VIEWED, {});
}

export function trackGa4BeginCheckout() {
  return trackGa4ProductEvent(GA4_PRODUCT_EVENT_NAMES.BEGIN_CHECKOUT, {});
}

export function trackGa4PaymentMethodSelected(paymentType) {
  return trackGa4ProductEvent(GA4_PRODUCT_EVENT_NAMES.PAYMENT_METHOD_SELECTED, {
    payment_type: paymentType,
  });
}

export function trackGa4PixGenerated() {
  return trackGa4ProductEvent(GA4_PRODUCT_EVENT_NAMES.PIX_GENERATED, {});
}

export function trackGa4CardCheckoutCreated() {
  return trackGa4ProductEvent(GA4_PRODUCT_EVENT_NAMES.CARD_CHECKOUT_CREATED, {});
}

export function trackGa4SubscriptionActivated() {
  return trackGa4ProductEvent(GA4_PRODUCT_EVENT_NAMES.SUBSCRIPTION_ACTIVATED, {});
}

export function trackGa4VoiceStarted(interactionMode) {
  return trackGa4ProductEvent(GA4_PRODUCT_EVENT_NAMES.VOICE_STARTED, {
    interaction_mode: interactionMode,
  });
}

export function trackGa4VoiceCompleted({ result, interactionMode } = {}) {
  return trackGa4ProductEvent(GA4_PRODUCT_EVENT_NAMES.VOICE_COMPLETED, {
    result,
    interaction_mode: interactionMode,
  });
}

export function trackGa4TransactionCreated({ direction, origin } = {}) {
  return trackGa4ProductEvent(GA4_PRODUCT_EVENT_NAMES.TRANSACTION_CREATED, {
    direction,
    origin,
  });
}

export function trackGa4CalendarEventCreated({ origin, scheduleKind } = {}) {
  return trackGa4ProductEvent(GA4_PRODUCT_EVENT_NAMES.CALENDAR_EVENT_CREATED, {
    origin,
    schedule_kind: scheduleKind,
  });
}

export function trackGa4ConfirmedTransactionCreation({
  confirmed = false,
  idempotentReplay = false,
  transactionType,
  origin,
} = {}, track = trackGa4TransactionCreated) {
  if (!confirmed || idempotentReplay) return invalidResult('not_new');
  return track({
    direction: resolveGa4TransactionDirection(transactionType),
    origin,
  });
}

export function trackGa4ConfirmedCalendarCreation({
  confirmed = false,
  idempotentReplay = false,
  isAllDay = false,
  hasExplicitTime = true,
  origin,
} = {}, track = trackGa4CalendarEventCreated) {
  if (!confirmed || idempotentReplay) return invalidResult('not_new');
  return track({
    origin,
    scheduleKind: resolveGa4ScheduleKind({
      is_all_day: isAllDay,
      has_explicit_time: hasExplicitTime,
    }),
  });
}

export function createGa4VoiceEventLifecycle({
  trackStarted = trackGa4VoiceStarted,
  trackCompleted = trackGa4VoiceCompleted,
} = {}) {
  let activeSessionId = null;
  let interactionMode = GA4_VOICE_INTERACTION_MODES.VOICE_BUTTON;
  let started = false;
  let completed = false;

  function completeCurrent(result) {
    if (!started || completed) return invalidResult('duplicate');
    completed = true;
    return trackCompleted({ result, interactionMode });
  }

  return Object.freeze({
    begin(sessionId, nextInteractionMode = GA4_VOICE_INTERACTION_MODES.VOICE_BUTTON) {
      activeSessionId = sessionId;
      interactionMode = nextInteractionMode;
      started = false;
      completed = false;
    },
    markStarted(sessionId) {
      if (sessionId !== activeSessionId || started) return invalidResult('duplicate');
      started = true;
      return trackStarted(interactionMode);
    },
    complete(sessionId, result) {
      if (sessionId !== activeSessionId) return invalidResult('duplicate');
      return completeCurrent(result);
    },
    completeCurrent,
  });
}

export function createGa4SignUpViewedLifecycle({
  trackViewed = trackGa4SignUpViewed,
} = {}) {
  let visible = false;

  return Object.freeze({
    update(nextVisible, { consentReady = false, consentStatus } = {}) {
      if (!nextVisible) {
        visible = false;
        return invalidResult('not_visible');
      }

      // A montagem durante o bootstrap não consome a visualização. Assim, uma
      // decisão persistida pode ser restaurada antes de avaliarmos o evento.
      if (!consentReady) return invalidResult('consent_pending');
      if (visible) return invalidResult('duplicate');

      // Depois que o bootstrap resolveu, unknown/denied consomem somente esta
      // visualização. Um aceite posterior não produz replay retroativo.
      visible = true;
      if (consentStatus !== GA4_CONSENT_STATUS.GRANTED) {
        return invalidResult('consent_blocked');
      }
      return trackViewed();
    },
  });
}

export function createGa4CheckoutEventLifecycle({
  trackBegin = trackGa4BeginCheckout,
  trackPaymentMethod = trackGa4PaymentMethodSelected,
  trackPixGenerated = trackGa4PixGenerated,
  trackCardCheckoutCreated = trackGa4CardCheckoutCreated,
} = {}) {
  let active = false;
  let paymentMethodConfirmed = false;
  let pixGenerated = false;
  let cardCheckoutCreated = false;

  return Object.freeze({
    begin() {
      if (active) return invalidResult('duplicate');
      active = true;
      paymentMethodConfirmed = false;
      pixGenerated = false;
      cardCheckoutCreated = false;
      return trackBegin();
    },
    close() {
      active = false;
      paymentMethodConfirmed = false;
      pixGenerated = false;
      cardCheckoutCreated = false;
    },
    confirmPaymentMethod(paymentMethod) {
      if (!active || paymentMethodConfirmed) return invalidResult('duplicate');
      const paymentType = resolveGa4PaymentType(paymentMethod);
      if (!paymentType) return invalidResult();
      paymentMethodConfirmed = true;
      return trackPaymentMethod(paymentType);
    },
    // Fase 4B Lite: uma ocorrência por tentativa legítima ATUAL dentro desta
    // mesma sessão de checkout (active) -- fechar/reabrir o modal (close +
    // begin) libera uma nova tentativa; re-render/StrictMode nunca duplicam
    // porque o guard é por instância de lifecycle, não por render.
    markPixGenerated() {
      if (!active || pixGenerated) return invalidResult('duplicate');
      pixGenerated = true;
      return trackPixGenerated();
    },
    markCardCheckoutCreated() {
      if (!active || cardCheckoutCreated) return invalidResult('duplicate');
      cardCheckoutCreated = true;
      return trackCardCheckoutCreated();
    },
  });
}

// Fase 4B Lite: subscription_activated é uma métrica aproximada -- emite
// somente quando o PRÓPRIO frontend presencia uma transição real
// (estado_anterior != active -> active). Cada instância consome no máximo
// uma emissão (nunca replay, mesmo que o consentimento seja concedido
// depois); uma leitura inicial que já chega "active" (reload/already_active)
// nunca deve chamar markWitnessedActivation, então nunca conta aqui.
export function createGa4SubscriptionActivationLifecycle({
  trackActivated = trackGa4SubscriptionActivated,
} = {}) {
  let consumed = false;

  return Object.freeze({
    markWitnessedActivation() {
      if (consumed) return invalidResult('duplicate');
      consumed = true;
      return trackActivated();
    },
  });
}
