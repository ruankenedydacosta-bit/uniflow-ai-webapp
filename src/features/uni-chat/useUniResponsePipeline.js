// Pipeline oficial de resposta da Uni.
//
// ÚNICO ponto oficial de saída de resposta da Uni no chat. Qualquer fluxo
// que queira responder pelo chat (FinancialQueryEngine, LLM, Pending
// Actions, Confirmações, Planos Financeiros, avisos, erros e fluxos
// intermediários) DEVE passar por createAssistantResponse.
//
// Ordem garantida de execução:
//   1. criar a mensagem (buildMessage);
//   2. persistência (persistMessage, quando aplicável — fire-and-forget,
//      nunca bloqueia a renderização);
//   3. render da mensagem (pushMessage).
//
// O chat não fala as respostas: a voz da Uni é só a conversa em tempo real.
import { useCallback } from 'react';

export function runAssistantResponsePipeline({
  text,
  options = {},
  buildMessage,
  pushMessage,
  persistMessage,
}) {
  const { persist = true, ...messageOptions } = options;
  // `autoplay` e `deduplicateNarration` eram da narração das respostas, que
  // saiu do chat. Ficam fora da mensagem enquanto algum chamador ainda as
  // passar.
  delete messageOptions.autoplay;
  delete messageOptions.deduplicateNarration;
  const msg = buildMessage(text, messageOptions);
  if (!msg) return null;

  if (persist && persistMessage) persistMessage(msg);
  pushMessage(msg);

  return msg;
}

export function useUniResponsePipeline({
  buildMessage,
  pushMessage,
  persistMessage,
}) {
  const createAssistantResponse = useCallback(
    (text, options = {}) => runAssistantResponsePipeline({
      text,
      options,
      buildMessage,
      pushMessage,
      persistMessage,
    }),
    [buildMessage, pushMessage, persistMessage],
  );

  return { createAssistantResponse };
}
