// Escolha da Próxima Decisão (Fase 5 — Shadow Mode).
//
// chooseNextDecision() seleciona UMA decisão entre:
//   ANSWER, ASK, CONFIRM, WAIT, CONSULT_MEMORY, CONSULT_DATABASE,
//   REJECT, CANCEL, DEFER, UNKNOWN.
//
// A escolha é 100% determinística (política + contexto + confiança + risco)
// e NUNCA executa: a decisão é apenas a recomendação da camada.
import {
  DECISION_POLICY,
  whenAnswerPolicy,
  whenAskPolicy,
  whenConfirmPolicy,
  whenRejectPolicy,
  whenWaitPolicy,
} from './decisionPolicy.js';
import { isValidDecisionType } from './decisionTypes.js';

const THRESHOLDS = DECISION_POLICY.thresholds;

export function chooseNextDecision({ context = {}, confidence = 0, risk = null, messageType = null, safetyBlocked = false } = {}) {
  const safeRisk = risk ?? { level: 'NONE' };
  const pending = context.pending ?? null;
  const evidence = context.evidence ?? {};

  // 1. Bloqueio de segurança: rejeitar é a única decisão segura.
  if (safetyBlocked === true) return 'REJECT';

  // 2. Risco crítico: nunca recomendar ação — rejeitar.
  if (safeRisk.level === 'CRITICAL') return 'REJECT';

  // 3. Cancelamento explícito do usuário.
  if (messageType === 'cancellation') {
    return pending ? 'CANCEL' : 'ANSWER';
  }

  // 4. Pipeline em execução: esperar.
  if (whenWaitPolicy({ pending, conversationSwitched: evidence.conversationSwitched })) {
    if (!pending || pending.status === 'executing') return 'WAIT';
  }

  // 5. Pendência pronta para confirmação (nunca executa — apenas confirma).
  if (whenConfirmPolicy({
    confidence,
    risk: safeRisk,
    pending,
  })) {
    return 'CONFIRM';
  }

  // 6. Pendência interrompida por troca de assunto: adiar sem descartá-la.
  if (pending && !pending.ready && evidence.conversationSwitched) {
    return 'DEFER';
  }

  // 7. Pendência em clarificação: perguntar.
  if (pending && pending.status === 'needs_clarification') {
    return 'ASK';
  }

  // 8. Consulta que exige banco: consultar banco é a decisão recomendada.
  if (context.needDatabase && !evidence.snapshotAvailable) {
    return 'CONSULT_DATABASE';
  }

  // 9. Referência episódica não resolvida: consultar memória.
  if (context.needMemory && evidence.referenceAmbiguous) {
    return 'CONSULT_MEMORY';
  }

  // 10. Contexto insuficiente: perguntar.
  if (context.sufficiency === 'INSUFFICIENT' && (context.missingFields?.length ?? 0) > 0) {
    return 'ASK';
  }

  // 11. Informação faltante recuperável: perguntar antes de rejeitar.
  if (whenAskPolicy({
    context,
    confidence,
    missingFields: context.missingFields,
    pending,
  })) {
    return 'ASK';
  }

  // 12. Risco alto sem confiança e sem clarificação possível: rejeitar.
  if (whenRejectPolicy({ confidence, risk: safeRisk, safetyBlocked })) {
    return 'REJECT';
  }

  // 13. Contexto suficiente + confiança alta: responder.
  if (whenAnswerPolicy({
    context,
    confidence,
    risk: safeRisk,
    pending,
  })) {
    return 'ANSWER';
  }

  // 14. Confiança muito baixa e contexto parcial: rejeitar não é útil —
  // perguntar é o caminho seguro para recuperar informação.
  if (confidence <= THRESHOLDS.rejectMaxConfidence && context.sufficiency === 'PARTIAL') {
    return 'ASK';
  }

  // 15. Sem contexto suficiente para decidir.
  return 'UNKNOWN';
}

export function isValidDecision(value) {
  return isValidDecisionType(value);
}
