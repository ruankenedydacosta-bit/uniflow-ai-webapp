// OPENAI1: vocabulario formal dos estados de interface da camada de IA --
// fundacao para uma futura integracao visual (ex.: OPENAI2), sem alterar
// UniChatPage.jsx nem a personalidade definitiva da Uni nesta fase.
//
// O provider atual (Edge Function uni-chat-llm) responde de uma vez so, sem
// streaming -- por isso LOADING cobre hoje toda a espera pela resposta.
// RESPONDING fica reservado para quando o provedor passar a transmitir a
// resposta em partes (streaming); ate la, nenhum consumidor deve produzir
// esse estado.

export const AI_STATUS = Object.freeze({
  UNAVAILABLE: 'unavailable',
  LOADING: 'loading',
  RESPONDING: 'responding',
  ERROR: 'error',
  SUCCESS: 'success',
});

/**
 * Deriva o estado atual a partir de sinais ja existentes (enabled do
 * useUniLlm(), loading/error/result controlados pelo chamador) -- funcao
 * pura, sem estado proprio, para nao duplicar o controle de loading que o
 * componente consumidor ja faz (ex.: isTyping em UniChatPage.jsx).
 */
export function deriveAiStatus({
  enabled = false,
  isLoading = false,
  isResponding = false,
  error = null,
  hasResult = false,
} = {}) {
  if (!enabled) return AI_STATUS.UNAVAILABLE;
  if (isResponding) return AI_STATUS.RESPONDING;
  if (isLoading) return AI_STATUS.LOADING;
  if (error) return AI_STATUS.ERROR;
  if (hasResult) return AI_STATUS.SUCCESS;
  return AI_STATUS.UNAVAILABLE;
}
