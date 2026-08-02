// Classificação do resultado de uma interação (Fase 8).
//
// classifica o desfecho observado em um enum fechado. Regra central: NUNCA
// marcar sucesso definitivo sem evidência. Prioridade de decisão:
//   1. erro de sistema;
//   2. erro de provider/unavailable/timeout;
//   3. cancelamento explícito;
//   4. correção explícita;
//   5. rejeição explícita;
//   6. sucesso confirmado (evidência explícita);
//   7. sucesso inferido (execução sem erro + resultado emitido);
//   8. sucesso parcial (pendência avançou mas não concluiu);
//   9. ambíguo (hipóteses concorrentes);
//   10. não resolvido (repetição, mudança de assunto sem progresso);
//   11. abandonado (mudança de assunto);
//   12. desconhecido.
import { isValidReflectionOutcome } from './reflectionTypes.js';

function any(...values) {
  return values.some(Boolean);
}

export function classifyInteractionOutcome(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const {
    systemError,
    providerError,
    providerUnavailable,
    timeout,
    userCancelled,
    userCorrected,
    userRejected,
    responseEmitted,
    actionConfirmed,
    actionExecuted,
    actionCancelled,
    successExplicit,
    pendingAdvanced,
    pendingStillActive,
    ambiguous,
    userRepeated,
    topicChanged,
  } = safe;

  // 1. Erros internos e externos têm prioridade máxima.
  if (systemError) return 'SYSTEM_ERROR';
  if (any(providerError, providerUnavailable, timeout)) return 'PROVIDER_ERROR';

  // 2. Desfechos explícitos do usuário.
  if (actionCancelled || userCancelled) return 'USER_CANCELLED';
  if (userCorrected) return 'USER_CORRECTED';
  if (userRejected) return 'USER_REJECTED';

  // 3. Sucesso confirmado exige evidência explícita (confirmação do usuário
  //    ou confirmação do pipeline de execução).
  if (actionConfirmed && any(successExplicit, actionExecuted)) {
    return 'SUCCESS_CONFIRMED';
  }

  // 4. Sucesso inferido: resposta emitida + ação executada sem erro. Ainda
  //    assim não é "confirmado" — apenas inferido.
  if (actionExecuted && responseEmitted) return 'SUCCESS_INFERRED';

  // 5. Sucesso parcial: pendência avançou, mas ainda ativa.
  if (pendingAdvanced && pendingStillActive) return 'PARTIAL_SUCCESS';

  // 6. Resultado ambíguo.
  if (ambiguous) return 'AMBIGUOUS_RESULT';

  // 7. Usuário repetiu a mensagem sem progresso → não resolvido.
  if (userRepeated) return 'UNRESOLVED';

  // 8. Mudança de assunto sem retomar a pendência → abandonado.
  if (topicChanged) return 'ABANDONED';

  // 9. Sem evidência definitiva.
  return 'UNKNOWN';
}

export function isFinalOutcome(outcome) {
  return isValidReflectionOutcome(outcome)
    && outcome !== 'UNKNOWN'
    && outcome !== 'UNRESOLVED'
    && outcome !== 'PARTIAL_SUCCESS';
}
