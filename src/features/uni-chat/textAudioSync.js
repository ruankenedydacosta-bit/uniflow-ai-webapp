// FASE ESTADOS DE PROCESSAMENTO: sincronização real texto<->voz, parte
// PURA (sem React, sem timers, sem DOM) -- testável integralmente com
// node:test.
//
// HOTFIX (abandono da revelação progressiva): a resposta NUNCA aparece
// parcialmente. Enquanto o áudio real ainda não está tocando, o texto
// permanece oculto (o chamador mostra o indicador de processamento); assim
// que o player emite PLAYING de verdade, o texto completo aparece de uma
// vez, junto com a voz. Isso elimina qualquer necessidade de estimar
// duração/ritmo de fala ou de sincronizar caractere a caractere -- o
// contrato passa a ser puramente binário por mensagem: 'pending' (nada
// visível) -> 'done' (texto completo visível).

/**
 * Fases possíveis do estado de sincronização de UMA mensagem ativa:
 * - 'idle': nenhuma mensagem ativa (activeId nulo).
 * - 'pending': mensagem ativa, mas o áudio ainda não começou a tocar de
 *   verdade (LOADING/IDLE/PAUSED). NUNCA revela texto nesta fase -- quem
 *   decide o que mostrar enquanto pending é o CHAMADOR (ex.: Home mostra o
 *   indicador de processamento; o chat completo cai no fallback
 *   texto-completo do próprio MessageBubble quando displayText é vazio).
 * - 'done': texto completo visível -- porque o áudio real começou a tocar
 *   (PLAYING), porque encerrou/falhou (STOPPED/ERROR, força o texto
 *   completo), ou porque essa mensagem já tinha sido revelada antes e está
 *   apenas repetindo (nunca esconde de novo numa repetição).
 */
export const TEXT_AUDIO_SYNC_PHASES = Object.freeze({
  IDLE: 'idle',
  PENDING: 'pending',
  DONE: 'done',
});

/**
 * Reducer PURO de transição de FASE. Só reage a mudanças de id/status reais
 * (chamado pelo hook somente quando a chave id+status muda). Nunca esconde
 * de novo uma mensagem que já está em `phase: 'done'` para o mesmo id
 * (repetição de áudio) -- essa é a garantia central de "impedir sequência
 * completo -> escondido -> completo".
 */
export function reduceTextAudioSyncState(prevState, {
  activeId, ttsStatus, playingStatus, stoppedStatus, errorStatus,
}) {
  if (!activeId) {
    return { id: null, phase: TEXT_AUDIO_SYNC_PHASES.IDLE };
  }

  const isSameId = prevState.id === activeId;
  const alreadyDone = isSameId && prevState.phase === TEXT_AUDIO_SYNC_PHASES.DONE;

  if (alreadyDone) {
    return { id: activeId, phase: TEXT_AUDIO_SYNC_PHASES.DONE };
  }

  if (ttsStatus === playingStatus || ttsStatus === stoppedStatus || ttsStatus === errorStatus) {
    return { id: activeId, phase: TEXT_AUDIO_SYNC_PHASES.DONE };
  }

  // LOADING/IDLE/PAUSED/UNAVAILABLE: ainda não começou a tocar de verdade
  // -- nunca revela texto aqui. Se já era um id novo, entra em 'pending';
  // se é o mesmo id (ex.: PAUSED), preserva o estado anterior.
  if (isSameId) return prevState;
  return { id: activeId, phase: TEXT_AUDIO_SYNC_PHASES.PENDING };
}
