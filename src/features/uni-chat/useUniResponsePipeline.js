// Pipeline oficial de resposta da Uni (texto + voz).
//
// ÚNICO ponto oficial de saída de resposta da Uni no chat. Qualquer fluxo
// que queira responder pelo chat (FinancialQueryEngine, LLM, Pending
// Actions, Confirmações, Planos Financeiros, avisos, erros e fluxos
// intermediários) DEVE passar por createAssistantResponse — nenhum módulo
// chama uniVoice.speak/buildSpeechText/autoplay diretamente.
//
// Ordem garantida de execução:
//   1. criar a mensagem (buildMessage);
//   2. persistência (persistMessage, quando aplicável — fire-and-forget,
//      nunca bloqueia a renderização);
//   3. render da mensagem (pushMessage);
//   4. autoplay: decide se narra AGORA com os MESMOS gates do efeito de
//      autoplay (experiência simplificada + voz habilitada + hidratação
//      concluída + saudação terminada/falhou). Quando os gates fecham neste
//      instante (ex.: saudação ainda tocando), a mensagem NÃO é marcada e o
//      efeito de autoplay a narra assim que eles abrirem — nunca há
//      mensagem órfã nem duplicação;
//   5. fala: marca como narrada ANTES de chamar speakMessage (mesmo padrão
//      do efeito: marcar primeiro garante que o efeito que roda depois no
//      mesmo commit nunca fale a mesma mensagem de novo) e delega para o
//      único ponto de fala (speakMessage → buildSpeechText → uniVoice.speak).
//
// Deduplicação: hasSpoken/markSpoken usam o mesmo registro por sessão
// (spokenMessageSession.js) que o efeito de autoplay — o pipeline marca a
// mensagem no momento de falar, então o efeito que observar a mesma
// mensagem depois simplesmente a ignora.
//
// Deduplicação por CONTEÚDO (narratedTextSession.js): além do id, o
// pipeline também registra o TEXTO narrado — duas mensagens diferentes com
// o mesmo texto (ex.: o mesmo input de voz entregue duas vezes gerando
// duas respostas idênticas) só narram a primeira. A mensagem repetida
// continua sendo criada/persistida/renderizada e é marcada como falada por
// id (o efeito de autoplay nunca a narra depois) — apenas a narração é
// silenciada. A ordem de operação do pipeline não muda.
import { useCallback } from 'react';

export function runAssistantResponsePipeline({
  text,
  options = {},
  buildMessage,
  pushMessage,
  persistMessage,
  shouldAutoSpeak,
  hasSpoken,
  markSpoken,
  speakMessage,
  userId,
  hasNarratedText,
  markNarratedText,
}) {
  const { persist = true, autoplay = true, ...messageOptions } = options;
  const msg = buildMessage(text, messageOptions);
  if (!msg) return null;

  if (persist && persistMessage) persistMessage(msg);
  pushMessage(msg);

  if (
    autoplay
    && shouldAutoSpeak()
    && !hasSpoken(userId, msg.id)
  ) {
    // Marca por id ANTES de falar (mesmo padrão do efeito: marcar primeiro
    // garante que o efeito que roda depois no mesmo commit nunca fale a
    // mesma mensagem de novo) -- inclusive quando a narração é silenciada
    // pelo dedup de conteúdo, para a mensagem nunca virar órfã do efeito.
    markSpoken(userId, msg.id);
    const textAlreadyNarrated = hasNarratedText
      ? hasNarratedText(userId, text)
      : false;
    if (!textAlreadyNarrated) {
      if (markNarratedText) markNarratedText(userId, text);
      speakMessage(msg);
    }
  }

  return msg;
}

export function useUniResponsePipeline({
  buildMessage,
  pushMessage,
  persistMessage,
  shouldAutoSpeak,
  hasSpoken,
  markSpoken,
  speakMessage,
  userId,
  hasNarratedText,
  markNarratedText,
}) {
  const createAssistantResponse = useCallback(
    (text, options = {}) => runAssistantResponsePipeline({
      text,
      options,
      buildMessage,
      pushMessage,
      persistMessage,
      shouldAutoSpeak,
      hasSpoken,
      markSpoken,
      speakMessage,
      userId,
      hasNarratedText,
      markNarratedText,
    }),
    [
      buildMessage,
      pushMessage,
      persistMessage,
      shouldAutoSpeak,
      hasSpoken,
      markSpoken,
      speakMessage,
      userId,
      hasNarratedText,
      markNarratedText,
    ],
  );

  return { createAssistantResponse };
}
