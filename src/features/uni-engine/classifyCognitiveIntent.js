// Classificador cognitivo do Uni Engine (Fase 1).
//
// NÃO substitui o intentClassifier do pipeline atual — reutiliza o
// classificador determinístico (classifyIntent) e o interpretador de
// consultas (classifyFinancialQuery) COMO EVIDÊNCIA e produz uma hipótese
// estruturada: messageType + primaryIntent + alternativas + confiança +
// ambiguidade.
//
// Prioridade de decisão (documento UNI_ENGINE_FASE_1_MVP §9):
//   1. segurança
//   2. confirmação/cancelamento explícito
//   3. ação nova explícita
//   4. continuação compatível
//   5. correção
//   6. consulta
//   7. esclarecimento (resposta a pendência)
//   8. small talk
//   9. fallback (unsupported)
import { classifyIntent } from '../uni-intents/intentClassifier.js';
import { classifyFinancialQuery } from '../uni-chat/financialQueryInterpreter.js';

const ACTION_INTENT_SET = new Set([
  'register_income',
  'register_expense',
  'register_transfer',
  'set_balance',
  'ambiguous_balance_or_income',
  'create_goal',
]);

const QUERY_INTENT_SET = new Set(['check_balance', 'forecast']);

const LOW_CONFIDENCE_THRESHOLD = 0.6;

function computeConfidence(messageType, evidence) {
  switch (messageType) {
    case 'confirmation':
    case 'cancellation':
      return 0.92;
    case 'action':
      return evidence.confidence > 0 ? evidence.confidence : 0.85;
    case 'query':
      return evidence.confidence > 0 ? Math.max(evidence.confidence, 0.78) : 0.78;
    case 'continuation':
      return Math.max(evidence.confidence, 0.88);
    case 'correction':
      return 0.8;
    case 'clarification':
      return 0.72;
    case 'small_talk':
      return 0.65;
    case 'unsupported':
      return 0.4;
    default:
      return 0.3;
  }
}

function buildAlternatives({ messageType, evidence, analyzed, text }) {
  const alternatives = [];
  const seen = new Set([evidence.intent]);

  const push = (intent, confidence) => {
    if (seen.has(intent)) return;
    seen.add(intent);
    alternatives.push({ intent, confidence });
  };

  if (evidence.intent === 'ambiguous_balance_or_income') {
    push('register_income', 0.5);
    push('set_balance', 0.5);
  }

  if (messageType === 'action' && analyzed.pending.exists) {
    push(analyzed.pending.intent, 0.4);
  }

  if (messageType === 'action' && evidence.intent === 'register_expense') {
    push('register_income', 0.08);
  }

  if (text.includes('?') && evidence.intent === 'question') {
    push('check_balance', 0.3);
  }

  return alternatives;
}

export function classifyCognitiveIntent(input, options = {}) {
  const safeInput = input && typeof input === 'object' ? input : {};
  const message = safeInput.message ?? {};
  const normalized = options.normalized ?? null;
  const analyzed = options.analyzed ?? null;
  const text = typeof message.text === 'string' ? message.text : '';

  const evidence = normalized?.classificationEvidence
    ?? (() => {
      const declaration = classifyIntent(text);
      return {
        intent: declaration.intent,
        confidence: declaration.confidence,
        signals: declaration.signals ?? [],
        confirmationReply: null,
      };
    })();

  const signals = normalized?.linguisticSignals ?? {};
  const hints = normalized?.extractedHints ?? {};
  const compatibility = analyzed?.compatibility ?? {};

  let messageType;
  let primaryIntent;
  let safetyBlocked;
  let fallbackUsed;
  const rulesUsed = [];
  const ambiguities = [];

  // 1. Segurança — ações destrutivas explícitas nunca são classificadas
  // como ação legítima.
  if (signals.isSafetyBlocked) {
    messageType = 'unsupported';
    primaryIntent = 'safety_blocked';
    safetyBlocked = true;
    rulesUsed.push('safety_block');
    fallbackUsed = true;
    return {
      messageType,
      primaryIntent,
      alternatives: [],
      confidence: 0.99,
      signals: evidence.signals,
      ambiguity: false,
      ambiguities,
      safetyBlocked,
      fallbackUsed,
      rulesUsed,
    };
  }

  const pendingExists = Boolean(compatibility.pendingIntent || analyzed?.pending?.exists);

  // 2. Confirmação / cancelamento explícito (allowlist fechada do pipeline).
  if (signals.isCancellation) {
    messageType = pendingExists ? 'cancellation' : 'small_talk';
    primaryIntent = pendingExists ? 'cancel_pending' : 'small_talk';
    rulesUsed.push(pendingExists ? 'explicit_cancellation' : 'cancellation_without_pending');
    return {
      messageType,
      primaryIntent,
      alternatives: [],
      confidence: computeConfidence(messageType, evidence),
      signals: evidence.signals,
      ambiguity: false,
      ambiguities,
      safetyBlocked: false,
      fallbackUsed: false,
      rulesUsed,
    };
  }

  if (signals.isConfirmation) {
    if (!pendingExists) {
      messageType = 'small_talk';
      primaryIntent = 'small_talk';
      rulesUsed.push('confirmation_without_pending');
    } else {
      messageType = 'confirmation';
      primaryIntent = 'confirm_pending';
      rulesUsed.push('explicit_confirmation');
    }
    return {
      messageType,
      primaryIntent,
      alternatives: [],
      confidence: computeConfidence(messageType, evidence),
      signals: evidence.signals,
      ambiguity: false,
      ambiguities,
      safetyBlocked: false,
      fallbackUsed: false,
      rulesUsed,
    };
  }

  // 3. Ação nova explícita — vence pendência incompatível (regra essencial).
  if (ACTION_INTENT_SET.has(evidence.intent) && signals.isFinancialStatement) {
    messageType = 'action';
    primaryIntent = evidence.intent;
    rulesUsed.push('explicit_action');
    if (evidence.intent === 'ambiguous_balance_or_income') {
      ambiguities.push('balance_or_income');
    }
    const alternatives = buildAlternatives({
      messageType,
      evidence,
      analyzed,
      text,
    });
    const confidence = computeConfidence(messageType, evidence);
    return {
      messageType,
      primaryIntent,
      alternatives,
      confidence,
      signals: evidence.signals,
      ambiguity: ambiguities.length > 0,
      ambiguities,
      safetyBlocked: false,
      fallbackUsed: false,
      rulesUsed,
    };
  }

  // 4. Continuação compatível (herda a intenção da pendência).
  if (signals.isContinuation && pendingExists) {
    messageType = 'continuation';
    primaryIntent = compatibility.pendingIntent ?? evidence.intent;
    rulesUsed.push('continuation');
    return {
      messageType,
      primaryIntent,
      alternatives: [],
      confidence: computeConfidence(messageType, evidence),
      signals: evidence.signals,
      ambiguity: false,
      ambiguities,
      safetyBlocked: false,
      fallbackUsed: false,
      rulesUsed,
    };
  }

  // 5. Correção.
  if (signals.isCorrection) {
    messageType = 'correction';
    primaryIntent = compatibility.pendingIntent ?? evidence.intent;
    rulesUsed.push('correction');
    return {
      messageType,
      primaryIntent,
      alternatives: [],
      confidence: computeConfidence(messageType, evidence),
      signals: evidence.signals,
      ambiguity: false,
      ambiguities,
      safetyBlocked: false,
      fallbackUsed: false,
      rulesUsed,
    };
  }

  // 6. Consulta — evidência do interpretador de consultas do pipeline.
  const queryType = classifyFinancialQuery(text);
  if (
    queryType
    && queryType.type !== 'transaction_reference'
    && (QUERY_INTENT_SET.has(evidence.intent) || signals.isQuestion)
  ) {
    messageType = 'query';
    primaryIntent = evidence.intent;
    rulesUsed.push('financial_query');
    const alternatives = buildAlternatives({
      messageType,
      evidence,
      analyzed,
      text,
    });
    return {
      messageType,
      primaryIntent,
      alternatives,
      confidence: computeConfidence(messageType, evidence),
      signals: evidence.signals,
      ambiguity: false,
      ambiguities,
      safetyBlocked: false,
      fallbackUsed: false,
      rulesUsed,
    };
  }

  // 6b. Pergunta genérica ("quanto gastei no mercado?", "qual é a
  // capital do brasil?", "quanto tenho no Nubank?") — o pipeline atual
  // responde pelo FinancialQueryEngine/chat geral; o motor classifica
  // como consulta sem executar nada.
  if (signals.isQuestion && (evidence.intent === 'question' || QUERY_INTENT_SET.has(evidence.intent))) {
    messageType = 'query';
    primaryIntent = evidence.intent;
    rulesUsed.push('generic_question');
    return {
      messageType,
      primaryIntent,
      alternatives: [],
      confidence: 0.7,
      signals: evidence.signals,
      ambiguity: false,
      ambiguities,
      safetyBlocked: false,
      fallbackUsed: false,
      rulesUsed,
    };
  }

  // 6b. Declaração financeira não classificada com valor real (barreira
  // determinística espelhando o pipeline atual).
  if (
    signals.isFinancialStatement
    && (hints.hasExplicitAmount || signals.financialVerb)
  ) {
    messageType = 'action';
    primaryIntent = evidence.intent;
    rulesUsed.push('unclassified_financial_statement');
    fallbackUsed = true;
    return {
      messageType,
      primaryIntent,
      alternatives: [],
      confidence: 0.72,
      signals: evidence.signals,
      ambiguity: false,
      ambiguities,
      safetyBlocked: false,
      fallbackUsed,
      rulesUsed,
    };
  }

  // 7. Esclarecimento — resposta plausível a uma pendência.
  if (pendingExists && compatibility.isCompatible) {
    messageType = 'clarification';
    primaryIntent = compatibility.pendingIntent;
    rulesUsed.push('pending_answer');
    return {
      messageType,
      primaryIntent,
      alternatives: [],
      confidence: computeConfidence(messageType, evidence),
      signals: evidence.signals,
      ambiguity: false,
      ambiguities,
      safetyBlocked: false,
      fallbackUsed: false,
      rulesUsed,
    };
  }

  // 8. Small talk.
  if (signals.isSmallTalk) {
    messageType = 'small_talk';
    primaryIntent = 'small_talk';
    rulesUsed.push('small_talk');
    return {
      messageType,
      primaryIntent,
      alternatives: [],
      confidence: computeConfidence(messageType, evidence),
      signals: evidence.signals,
      ambiguity: false,
      ambiguities,
      safetyBlocked: false,
      fallbackUsed: false,
      rulesUsed,
    };
  }

  // 9. Fallback.
  messageType = 'unsupported';
  primaryIntent = evidence.intent;
  fallbackUsed = true;
  rulesUsed.push('fallback');

  const confidence = computeConfidence(messageType, evidence);
  const isAmbiguous = confidence < LOW_CONFIDENCE_THRESHOLD;
  if (isAmbiguous) ambiguities.push('low_confidence');

  return {
    messageType,
    primaryIntent,
    alternatives: [],
    confidence,
    signals: evidence.signals,
    ambiguity: isAmbiguous,
    ambiguities,
    safetyBlocked: false,
    fallbackUsed,
    rulesUsed,
  };
}
