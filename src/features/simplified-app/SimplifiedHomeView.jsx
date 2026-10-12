import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import OutlineButton from '../../components/ui/OutlineButton/index.js';
import UniCard from '../../components/ui/UniCard/index.js';
import ActionConfirmation from '../uni-chat/components/ActionConfirmation.jsx';
import {
  isAppleWebKitRuntime,
  recordVoicePipelineDiagnostic,
  VOICE_CAPTURE_STATES,
  useSharedUniVoiceInput,
  useStableVoiceInputHandlers,
} from '../uni-voice/index.js';
import { VOICE_TTS_ERROR_CODES, VOICE_TTS_STATUS } from '../uni-voice-tts/index.js';
import { PwaInstallExperience, usePwaAutoUpdateBlock } from '../pwa-install/index.js';
import SimplifiedHomeAgenda from './SimplifiedHomeAgenda.jsx';
import SimplifiedHomeFinancialGraph from './SimplifiedHomeFinancialGraph.jsx';
import SimplifiedHomeMonthReading from './SimplifiedHomeMonthReading.jsx';
import {
  isVoiceErrorState,
  resolveBargeInPlan,
  resolveSimplifiedUniState,
  SIMPLIFIED_UNI_STATES,
} from './simplifiedHomeState.js';
import { getPageLoadGreetingOpening, resolveSimplifiedGreeting } from './simplifiedGreeting.js';
import { useUniProcessingMessage } from '../uni-chat/useUniProcessingMessage.js';
import { useTextAudioSync } from '../uni-chat/useTextAudioSync.js';
import {
  buildWelcomeSessionKey,
  claimWelcomeVoice,
  clearWelcomeVoiceBlocked,
  getWelcomeVoiceBlocked,
  isWelcomeVoiceActivated,
  markWelcomeVoiceBlocked,
  markWelcomeVoiceActivated,
  releaseWelcomeVoice,
} from './welcomeVoiceSession.js';
import { SIMPLIFIED_ROUTES, VOICE_MODE_SEARCH_PARAM } from './simplifiedRoutes.js';
import { buildNovidadeUrl } from './uniUpdatesData.js';
import { useUniUpdates } from './useUniUpdates.js';
import SimplifiedVoiceMode from './SimplifiedVoiceMode.jsx';
import SimplifiedVoiceMinutesNotice from './SimplifiedVoiceMinutesNotice.jsx';
import { ACCOUNT_SUBROUTE_IDS, ACCOUNT_SUBROUTES } from './simplifiedAccountRoutes.js';
import { useVoiceMinutes } from './useVoiceMinutes.js';
import {
  describeVoiceMinutesNotice,
  readDismissedVoiceMinutesNotice,
  writeDismissedVoiceMinutesNotice,
} from './voiceMinutesPresentation.js';
import {
  canMuteRealtimeConversation,
  resolveRealtimeVoiceModeView,
  selectVoiceConversationMessages,
  snapshotVoiceConversationStart,
  VOICE_MODE_ACTIONS,
} from './voiceModeState.js';
import { SIMPLIFIED_FEATURE_FLAGS } from './simplifiedFeatureFlags.js';
import {
  REALTIME_SCREEN_ACTIONS,
  REALTIME_STATUS,
  useRealtimeUniConversation,
} from '../uni-voice-realtime/index.js';
import { buildRealtimeGreetingInstructions } from '../uni-voice-realtime/realtimeGreeting.js';
import styles from './simplifiedApp.module.css';

// LOADING significa apenas que a voz está sendo preparada. O rótulo
// "TOQUE PARA PARAR" só pode aparecer quando existe reprodução real
// (PLAYING), mas o carregamento continua interrompível pelo mesmo gesto de
// barge-in para nunca iniciar por cima de uma nova captura.
// Recusas da conversa em tempo real que mandam a pessoa para o texto:
// minutos do mês esgotados ou sem assinatura.
const REALTIME_TEXT_FALLBACK_CODES = new Set(['VOICE_QUOTA_EXHAUSTED', 'SUBSCRIPTION_INACTIVE']);

// Depois que a conversa termina, o orb e o botão central abrem outra.
const REALTIME_RESTART_HINT = 'Toque na Uni para começar uma nova conversa.';

const INTERRUPTIBLE_VOICE_STATUSES = new Set([
  VOICE_TTS_STATUS.LOADING,
  VOICE_TTS_STATUS.PLAYING,
]);

function getVoiceActivationError(errorCode) {
  if (errorCode === 'permission_denied') {
    return 'Permita o acesso ao microfone nos ajustes do Safari e tente novamente.';
  }
  if (errorCode === 'microphone_not_found') {
    return 'Nenhum microfone foi encontrado neste dispositivo.';
  }
  return 'Não consegui ativar o microfone. Tente novamente.';
}

// Hora do cabeçalho do card da Uni ("Uni · 21:40"), fixada na abertura da Home.
const CLOCK_FORMATTER = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

// FASE ESTADOS DE PROCESSAMENTO: estados que mostram a mensagem de
// processamento rotativa NO LUGAR da última resposta (em vez da resposta
// do turno anterior, que ficaria "presa" na tela enquanto um novo turno já
// está em andamento). waiting_confirmation fica de fora -- o próprio card
// de confirmação já comunica "aguardando você"; speaking/success/error/idle
// já têm sua própria UI (texto final, já revelado ou já visível).
const PROCESSING_DISPLAY_STATES = new Set([
  SIMPLIFIED_UNI_STATES.LISTENING,
  SIMPLIFIED_UNI_STATES.TRANSCRIBING,
  SIMPLIFIED_UNI_STATES.INTERPRETING,
  SIMPLIFIED_UNI_STATES.EXECUTING,
]);

function CompactResponse({
  messages,
  isExecuting,
  executionError,
  onConfirmAction,
  onEditAction,
  onCancelAction,
  onUndoAction,
  editForm = null,
  onSaveEditAction,
  interactionState,
  voiceStatus,
  voiceCaptureStatus,
  voiceMessageId,
  turnStartToken,
  interpretingOperationHint,
  // "voice": dentro da tela de voz (redesign, épico #91). O pedido da pessoa
  // já aparece sob o orb, então sai daqui; a resposta fica centralizada e o
  // card vai em vidro.
  // "home": na Home, só o que pede ação (o pedido em andamento e o rascunho
  // pendente) e a resposta a um pedido feito na própria Home. A última troca
  // com a Uni fica no chat.
  presentation = 'home',
  // Na Home: {uniId} da última resposta da Uni no instante do pedido feito
  // ali. A resposta seguinte aparece no card. null: nenhuma resposta aparece.
  homeReplyBaseline = null,
}) {
  const isVoicePresentation = presentation === 'voice';
  const lastUser = [...messages].reverse().find((message) => message.from === 'user');
  const lastUni = [...messages].reverse().find((message) => message.from === 'uni');
  const pendingConfirmationMessage = [...messages].reverse()
    .find((message) => message.confirmation?.status === 'pending') ?? null;

  // HOTFIX P0 (2ª investigação) -- CAUSA RAIZ REAL: antes, `activeMessage`
  // apontava para `lastUni` INCONDICIONALMENTE, então TODA montagem (ex.:
  // reload da Home) via `useTextAudioSync` nascer em fase 'pending' para a
  // ÚLTIMA resposta JÁ CONCLUÍDA e persistida -- tratando-a como se
  // estivesse prestes a tocar (mostrando "Entendendo seu pedido..." e,
  // depois, revelando-a do zero). `voiceMessageId` é a MESMA fonte de
  // verdade que o chat completo já usa (UniChatPage.jsx, setVoiceMessageId
  // em handleSpeakMessage) para saber qual mensagem a voz está REALMENTE
  // visando -- nasce null a cada mount e só é setado no instante exato de
  // um speak() real (autoplay de uma resposta nova OU clique manual em
  // "Ouvir resposta"), nunca por hidratação/reload. Ao gatear
  // `activeMessage` por essa identidade (em vez de "a última mensagem
  // qualquer"), uma resposta concluída e persistida nunca mais é tratada
  // como candidata a reveal/processing só por existir -- ela só entra
  // nesse fluxo quando ALGUÉM (autoplay do turno vivo ou o próprio
  // usuário) pede explicitamente para ouvi-la.
  const isVoiceTargetingLastUni = Boolean(voiceMessageId) && lastUni?.id === voiceMessageId;
  const textAudioSync = useTextAudioSync({
    activeMessage: isVoiceTargetingLastUni ? { id: lastUni.id, text: lastUni.text } : null,
    ttsStatus: voiceStatus,
  });

  // HOTFIX P0.1 (identidade de turno -- resposta antiga reaparecendo):
  // `turnStartToken` muda toda vez que um NOVO turno de verdade começa
  // (ver beginVoiceCapture em SimplifiedHomeView). Ao mudar, guarda qual
  // era o ÚLTIMO id de mensagem da Uni NESSE instante (baseline) -- até
  // que um id REALMENTE NOVO apareça em `lastUni`, o turno é considerado
  // "aguardando resposta nova" independente de qualquer nuance de
  // interactionState/voiceInput.status (não depende de enumerar estados
  // "de processamento" -- é uma comparação de IDENTIDADE, robusta a
  // qualquer race entre captura, TTS e publicação). Ajustado durante a
  // renderização (nunca em efeito), mesmo padrão de reset-por-key já
  // usado no projeto.
  const currentLastUniId = lastUni?.id ?? null;
  const [turnState, setTurnState] = useState(() => ({
    token: turnStartToken,
    baselineUniId: currentLastUniId,
    awaitingFreshResponse: false,
  }));
  // Rede de segurança (evita P0.4 -- fluxo travado): se a captura for
  // cancelada/falhar sem NUNCA produzir uma mensagem nova (ex.: usuário
  // solta fora do botão sem falar, cancela explicitamente, ou permissão
  // negada), o turno precisa de uma saída sem que `currentLastUniId` jamais
  // mude -- senão `awaitingFreshResponse` ficaria travado em true para
  // sempre, escondendo a última resposta real indefinidamente.
  //
  // HOTFIX FINAL (causa raiz real da "resposta fantasma" intermitente,
  // confirmada por rastreamento do pipeline em UniChatPage.jsx): `interactionState
  // === IDLE` sozinho é uma FALSA saída. `sendText` zera `isTyping` (via
  // setTimeout, UNI_THINK_MIN_MS) ANTES de o pipeline de resposta
  // (determinístico -> semântico/LLM -> handleUnresolvedMessage) sequer
  // começar a trabalhar de verdade -- `handleUnresolvedMessage` só volta a
  // marcar `isTyping=true` bem mais tarde, já dentro do await da chamada ao
  // LLM. Nesse intervalo (que pode durar segundos, com round-trip de LLM),
  // se o reset automático de `voiceInput` (1600ms após COMPLETED, ver
  // efeito abaixo) já tiver zerado `voiceInput.status` para IDLE,
  // `resolveSimplifiedUniState` cai no `return IDLE` final -- mesmo com o
  // pipeline de resposta genuinamente ainda em andamento. Essa era
  // exatamente a janela em que a resposta ANTERIOR reaparecia: "Entendendo
  // seu pedido..." -> IDLE espúrio (abandona o turno por engano) ->
  // `lastUni` antigo reaparece -> `handleUnresolvedMessage` marca
  // isTyping=true de novo -> "Entendendo seu pedido..." reaparece -> só
  // então a resposta nova chega. `interactionState === ERROR` já cobre
  // TODO abandono real por falha (permissão negada/sem fala/não suportado
  // -- ver isVoiceErrorState, todos mapeados para ERROR, nunca IDLE); o
  // único abandono real que caía em IDLE é cancelamento explícito da
  // captura (`voiceInput.cancel()`), coberto agora por
  // `voiceCaptureStatus === CANCELED` diretamente -- identidade real do
  // estado de captura, não inferência por enumeração de um estado agregado
  // que também é o valor de repouso "nada está acontecendo".
  const isTurnAbandoned = (
    interactionState === SIMPLIFIED_UNI_STATES.ERROR
    || voiceCaptureStatus === VOICE_CAPTURE_STATES.CANCELED
  );
  if (turnStartToken !== turnState.token) {
    setTurnState({ token: turnStartToken, baselineUniId: currentLastUniId, awaitingFreshResponse: true });
  } else if (turnState.awaitingFreshResponse
    && (currentLastUniId !== turnState.baselineUniId || isTurnAbandoned)) {
    setTurnState((prev) => ({ ...prev, awaitingFreshResponse: false }));
  }
  const isTurnAwaitingFreshResponse = turnState.awaitingFreshResponse;

  // HOTFIX (bug 2 -- resposta nova aparecia completa e "voltava" para
  // parcial): enquanto a mensagem ativa de voz ainda está em fase
  // 'pending' (publicada, mas o áudio real ainda não começou a tocar),
  // nunca mostra o texto -- nem o antigo, nem uma prévia do novo.
  const isVoicePendingPlayback = Boolean(
    lastUni
    && textAudioSync.activeMessageId === lastUni.id
    && textAudioSync.phase === 'pending',
  );
  // HOTFIX P1.1: nunca expõe o detalhe técnico "preparando o áudio" --
  // enquanto o áudio ainda não começou a tocar de verdade, continua
  // mostrando um estado natural já existente do produto (a mesma família
  // de mensagens do "interpreting"), nunca um estágio novo.
  const processingState = isVoicePendingPlayback ? 'interpreting' : interactionState;

  // Hooks SEMPRE chamados, nunca depois de um return condicional (ver
  // early return "sem lastUser/lastUni" logo abaixo) -- usam valores de
  // fallback seguros quando ainda não há nada para processar/revelar.
  const processingMessage = useUniProcessingMessage(processingState, {
    actionKind: pendingConfirmationMessage?.confirmation?.actionKind ?? null,
    operationHint: processingState === 'interpreting' ? interpretingOperationHint : null,
  });

  if (!lastUser && !lastUni) return null;

  // HOTFIX P0 (2ª investigação): `isAwaitingNewResponse` (baseado em "a
  // última mensagem do array é do usuário") foi REMOVIDO -- além de já
  // redundante frente a `isTurnAwaitingFreshResponse` (que cobre o MESMO
  // intervalo com identidade de turno real, nunca apenas inferindo pelo
  // remetente da última mensagem), ele era PERIGOSO no reload: se a
  // conversa persistida terminar com uma mensagem do usuário sem resposta
  // (ex.: aba fechada no meio de um turno), essa condição ficava
  // permanentemente true numa montagem nova (nada nunca faria isTyping
  // virar true de novo), prendendo o indicador de processamento para
  // sempre. `isTurnAwaitingFreshResponse` nasce SEMPRE false no mount.
  //
  // HOTFIX P0 (4ª investigação) -- CAUSA RAIZ REAL do "resposta antiga
  // reaparece no meio do turno": `showProcessingIndicator` exigia
  // `processingMessage` truthy, mas `processingMessage` deriva de
  // `interactionState`, que passa por sub-estados SEM mensagem própria no
  // meio de um turno real -- ex.: `resolveSimplifiedUniState` devolve
  // 'success' assim que `voiceInput.status` vira COMPLETED, um instante
  // ANTES de `isTyping` virar true (sendText/setIsTyping roda depois, no
  // callback onFinalTranscript). Nesse render intermediário,
  // `isTurnAwaitingFreshResponse` já está corretamente true (nenhuma
  // resposta nova chegou ainda) mas `getProcessingMessageSequence('success')`
  // devolve [] -- `processingMessage` vira null, `showProcessingIndicator`
  // vira false, e o código caía no fallback `lastUni?.text`, reexibindo a
  // resposta do turno ANTERIOR por um instante. A identidade de turno
  // (`isTurnAwaitingFreshResponse`) já era a fonte de verdade correta; o bug
  // era deixar a DECISÃO de esconder `lastUni` também depender de existir
  // um texto de processamento bonito para o sub-estado exato. Agora a
  // decisão é só: turno aguardando resposta fresca -> NUNCA mostra
  // `lastUni`, mesmo sem um label específico (usa o fallback genérico
  // abaixo, nunca deixa a tela em branco nem volta ao texto antigo).
  const showProcessingIndicator = Boolean(
    isTurnAwaitingFreshResponse
    || isVoicePendingPlayback
    || (processingMessage && PROCESSING_DISPLAY_STATES.has(interactionState)),
  );
  // Fallback honesto para sub-estados de turno ativo sem mensagem própria
  // (ex.: a janela 'success' descrita acima) -- nunca inventa uma operação
  // específica, reaproveita a mesma frase genérica já usada por
  // "interpreting" sem hint reconhecido.
  const displayedProcessingMessage = processingMessage ?? 'Entendendo seu pedido…';
  const showHomeReply = Boolean(homeReplyBaseline && lastUni && lastUni.id !== homeReplyBaseline.uniId);
  if (!isVoicePresentation && !showProcessingIndicator && !pendingConfirmationMessage && !showHomeReply) return null;
  // HOTFIX (abandono da revelação progressiva): a resposta nunca aparece
  // parcialmente -- ou está oculta (pending, cai no indicador de
  // processamento acima) ou está 100% visível de uma vez, junto com a voz.
  const uniDisplayText = lastUni && textAudioSync.activeMessageId === lastUni.id
    ? textAudioSync.displayText
    : lastUni?.text;

  return (
    <section
      className={styles.compactResponse}
      data-presentation={presentation}
      aria-label="Resposta da Uni"
      aria-live="polite"
    >
      {showProcessingIndicator ? (
        <p className={styles.uniProcessing} role="status">
          <span className={styles.uniProcessingDot} aria-hidden="true" />
          {displayedProcessingMessage}
        </p>
      ) : (isVoicePresentation || showHomeReply) && lastUni?.text ? (
        <>
          <p className={styles.uniResponse}>{uniDisplayText}</p>
          {/* Exclusão recente (#189): o botão fica enquanto o chat ainda
              consegue trazer o lançamento de volta. */}
          {lastUni.undo?.status === 'available' && typeof onUndoAction === 'function' ? (
            <OutlineButton variant="secondary" onClick={() => onUndoAction(lastUni.id)} disabled={isExecuting}>
              Desfazer
            </OutlineButton>
          ) : null}
        </>
      ) : null}
      {/* HOTFIX P1.4: "Ouvir resposta" removido do card compacto da Home --
          o fluxo principal aqui é sempre automático (autoplay). O botão
          continua existindo no chat completo (MessageBubble.jsx), que
          preserva a experiência de replay manual já aprovada. */}
      {/* O rascunho continua na tela enquanto espera confirmação, mesmo
          depois de outra resposta da Uni: é ele que "Confirma" grava. */}
      {pendingConfirmationMessage ? (
        <ActionConfirmation
          key={pendingConfirmationMessage.id}
          data={pendingConfirmationMessage.confirmation}
          onConfirm={() => onConfirmAction(pendingConfirmationMessage.id)}
          onEdit={onEditAction}
          onCancel={() => onCancelAction(pendingConfirmationMessage.id)}
          editForm={editForm}
          onSaveEdit={onSaveEditAction ? (overrides) => onSaveEditAction(pendingConfirmationMessage.id, overrides) : undefined}
          isExecuting={isExecuting}
          executionError={executionError}
          processingLabel={processingMessage ?? undefined}
          appearance={isVoicePresentation ? 'glass' : 'default'}
        />
      ) : null}
    </section>
  );
}

function SimplifiedHomeView({
  profile,
  user,
  session,
  messages,
  isTyping,
  isExecuting,
  executionError,
  aiStatus,
  voiceEnabled: voicePreferenceEnabled,
  voiceController,
  voiceMessageId,
  interpretingOperationHint,
  onSendTranscript,
  onBeforeVoiceStart,
  onConfirmAction,
  onCancelAction,
  onUndoAction,
  editForm = null,
  onSaveEditAction,
  onWelcomeVoiceSettled,
  onRealtimeVoiceActiveChange,
  realtimeVoiceEnabled = SIMPLIFIED_FEATURE_FLAGS.realtimeVoiceEnabled,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const voiceInput = useSharedUniVoiceInput();
  const [clockLabel] = useState(() => CLOCK_FORMATTER.format(new Date()));
  // Saudação falada ao abrir o app. Com a conversa em tempo real (épico
  // #116), a Home não fala sozinha: a saudação é visual, e a Uni fala
  // primeiro quando a pessoa toca no orb, com a mesma voz da conversa. Sem
  // saudação falada, também não há o botão "Ativar voz e microfone": o
  // microfone é pedido no toque que abre a conversa.
  const voiceEnabled = voicePreferenceEnabled && !realtimeVoiceEnabled;
  // UNIUPD1: limit:1 -- a Home so precisa saber "existe novidade pendente?",
  // nunca carrega o historico inteiro (isso fica com Sobre a UniFlow AI).
  const { pendingUpdate: pendingUniUpdate } = useUniUpdates({ limit: 1 });
  const greeting = useMemo(
    () => resolveSimplifiedGreeting(profile, user, getPageLoadGreetingOpening()),
    [profile, user],
  );
  const sessionKey = buildWelcomeSessionKey(user, session);
  const isAppleVoiceRuntime = useMemo(
    () => typeof window !== 'undefined' && isAppleWebKitRuntime(window),
    [],
  );
  const welcomeAttemptInFlightRef = useRef(false);
  const retryWelcomeOnGestureRef = useRef(false);
  const welcomeWasBackgroundedRef = useRef(false);
  const [voiceActivationRequired, setVoiceActivationRequired] = useState(
    () => Boolean(
      voiceEnabled
      && sessionKey
      && isAppleVoiceRuntime
      && !isWelcomeVoiceActivated(sessionKey)
    ),
  );
  const [voiceActivationPending, setVoiceActivationPending] = useState(false);
  const [voiceActivationError, setVoiceActivationError] = useState(null);

  const requestWelcomeVoice = useCallback(
    (requestMetadata = {}) => voiceController.speak(greeting.spokenGreeting, {
      messageId: 'welcome',
      source: 'greeting',
      ...requestMetadata,
    }),
    [greeting.spokenGreeting, voiceController],
  );
  const attemptWelcomeVoice = useCallback(async ({ userInitiated = false, ...requestMetadata } = {}) => {
    if (!voiceEnabled || !sessionKey || welcomeAttemptInFlightRef.current) return null;

    welcomeAttemptInFlightRef.current = true;
    try {
      const result = await requestWelcomeVoice({ userInitiated, ...requestMetadata });
      const error = result?.error ?? null;
      const autoplayBlocked = error?.code === VOICE_TTS_ERROR_CODES.AUTOPLAY_BLOCKED;
      retryWelcomeOnGestureRef.current = autoplayBlocked;

      if (autoplayBlocked) markWelcomeVoiceBlocked(sessionKey, error);
      else if (!error) clearWelcomeVoiceBlocked(sessionKey);

      return result;
    } finally {
      welcomeAttemptInFlightRef.current = false;
      onWelcomeVoiceSettled?.();
    }
  }, [onWelcomeVoiceSettled, requestWelcomeVoice, sessionKey, voiceEnabled]);

  const voiceInputHandlers = useMemo(() => ({
    onBeforeStart: onBeforeVoiceStart,
    onFinalTranscript: (transcript) => {
      const cleanTranscript = String(transcript ?? '').trim();
      if (cleanTranscript) onSendTranscript(cleanTranscript, { source: 'voice' });
    },
  }), [onBeforeVoiceStart, onSendTranscript]);
  useStableVoiceInputHandlers(voiceInput.registerHandlers, voiceInputHandlers);

  useEffect(() => {
    if (!voiceEnabled) return;
    if (!claimWelcomeVoice(sessionKey)) return;

    if (isAppleVoiceRuntime) return;

    // BLOCO VOZ HIDRATAÇÃO: a saudação tem prioridade exclusiva -- o
    // autoplay de mensagens (UniChatPage) só é armado quando a fala da
    // saudação TERMINA ou FALHA (finally), nunca antes (preparando/
    // carregando/tocando ficam bloqueando). Sucesso e falha liberam igual.
    void attemptWelcomeVoice();
  }, [
    attemptWelcomeVoice,
    isAppleVoiceRuntime,
    sessionKey,
    voiceEnabled,
  ]);

  useEffect(() => {
    if (isAppleVoiceRuntime) return undefined;
    retryWelcomeOnGestureRef.current = getWelcomeVoiceBlocked(sessionKey)?.code
      === VOICE_TTS_ERROR_CODES.AUTOPLAY_BLOCKED;
    // A saudação só toca na primeira visita à Home da carga. Quem sai sem
    // ouvir (autoplay bloqueado e nenhum toque na Home) não a ouve ao voltar.
    return () => clearWelcomeVoiceBlocked(sessionKey);
  }, [isAppleVoiceRuntime, sessionKey]);

  useEffect(() => {
    if (
      !voiceEnabled
      || isAppleVoiceRuntime
      || typeof window === 'undefined'
      || typeof document === 'undefined'
    ) {
      return undefined;
    }

    const retryAfterUserGesture = (event) => {
      if (!retryWelcomeOnGestureRef.current || document.visibilityState === 'hidden') return;
      // Toque que sai da Home (aba da barra, link) não inicia a saudação.
      if (event.target instanceof Element && event.target.closest('[data-uni-voice-control], a[href]')) return;
      retryWelcomeOnGestureRef.current = false;
      void attemptWelcomeVoice({ userInitiated: true });
    };

    window.addEventListener('pointerdown', retryAfterUserGesture, true);
    window.addEventListener('keydown', retryAfterUserGesture, true);
    return () => {
      window.removeEventListener('pointerdown', retryAfterUserGesture, true);
      window.removeEventListener('keydown', retryAfterUserGesture, true);
    };
  }, [attemptWelcomeVoice, isAppleVoiceRuntime, voiceEnabled]);

  useEffect(() => {
    if (!voiceEnabled || !sessionKey || typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    const markBackgrounded = () => {
      welcomeWasBackgroundedRef.current = true;
    };
    const greetAfterForegroundReturn = () => {
      if (!welcomeWasBackgroundedRef.current || document.visibilityState === 'hidden') return;
      welcomeWasBackgroundedRef.current = false;
      releaseWelcomeVoice(sessionKey);
      if (!claimWelcomeVoice(sessionKey)) return;
      if (isAppleVoiceRuntime) {
        setVoiceActivationError(null);
        setVoiceActivationRequired(true);
        return;
      }
      void attemptWelcomeVoice();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') markBackgrounded();
      else greetAfterForegroundReturn();
    };

    window.addEventListener('pagehide', markBackgrounded);
    window.addEventListener('pageshow', greetAfterForegroundReturn);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', markBackgrounded);
      window.removeEventListener('pageshow', greetAfterForegroundReturn);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [attemptWelcomeVoice, isAppleVoiceRuntime, sessionKey, voiceEnabled]);

  const handleActivateVoice = useCallback(async () => {
    if (voiceActivationPending || !sessionKey) return;

    setVoiceActivationPending(true);
    setVoiceActivationError(null);
    claimWelcomeVoice(sessionKey);

    try {
      const playbackPreparation = voiceController.preparePlayback?.() ?? Promise.resolve(false);
      const microphonePreparation = voiceInput.prepareMicrophone();
      const [, microphoneResult] = await Promise.all([
        playbackPreparation,
        microphonePreparation,
      ]);

      if (!microphoneResult?.granted) {
        setVoiceActivationError(getVoiceActivationError(microphoneResult?.errorCode));
        return;
      }

      markWelcomeVoiceActivated(sessionKey);
      setVoiceActivationRequired(false);
      setVoiceActivationPending(false);
      void attemptWelcomeVoice({
        userInitiated: true,
        playbackPreparationAttempted: true,
      });
    } catch {
      setVoiceActivationError('Não consegui concluir a ativação. Tente novamente.');
    } finally {
      setVoiceActivationPending(false);
    }
  }, [
    attemptWelcomeVoice,
    sessionKey,
    voiceActivationPending,
    voiceController,
    voiceInput,
  ]);

  useEffect(() => {
    if (
      voiceInput.status !== VOICE_CAPTURE_STATES.COMPLETED
      && !isVoiceErrorState(voiceInput.status)
    ) {
      return undefined;
    }
    const timeoutId = window.setTimeout(
      () => voiceInput.reset(),
      voiceInput.status === VOICE_CAPTURE_STATES.COMPLETED ? 1600 : 3200,
    );
    return () => window.clearTimeout(timeoutId);
  }, [voiceInput]);

  const pendingConfirmation = messages.some(
    (message) => message.confirmation?.status === 'pending',
  );
  // Estado visual e estado cancelável são deliberadamente diferentes:
  // LOADING ainda não é fala audível, então não pode mostrar "TOQUE PARA
  // PARAR"; porém precisa continuar cancelável antes de abrir o microfone.
  const isSpeaking = voiceController.status === VOICE_TTS_STATUS.PLAYING;
  const isVoicePlaybackInterruptible = INTERRUPTIBLE_VOICE_STATUSES.has(
    voiceController.status,
  );
  const interactionState = resolveSimplifiedUniState({
    voiceStatus: voiceInput.status,
    isTyping,
    isExecuting,
    hasPendingConfirmation: pendingConfirmation,
    hasError: Boolean(executionError) || aiStatus === 'error',
    isSpeaking,
  });
  const isListening = voiceInput.status === VOICE_CAPTURE_STATES.LISTENING;
  const isCaptureBusy = [
    VOICE_CAPTURE_STATES.REQUESTING_PERMISSION,
    VOICE_CAPTURE_STATES.PROCESSING,
  ].includes(voiceInput.status);
  const isInteractionBusy = isTyping || isExecuting || isCaptureBusy;
  usePwaAutoUpdateBlock(
    voiceInput.isActive || isInteractionBusy || pendingConfirmation || voiceActivationPending,
  );
  const voiceErrorMessage = isVoiceErrorState(voiceInput.status) ? voiceInput.message : null;

  // TAP-TO-TALK (épico #99): um toque no orb abre a tela de voz e começa a
  // ouvir no MESMO gesto (o iOS só libera microfone e áudio dentro de uma
  // ativação do usuário). Enviar encerra e manda para a transcrição; fechar
  // a tela ou sair do app descarta. Sem pointer capture: o toque é um click
  // comum, então os bugs de "solta sozinho" do segurar para falar não se
  // aplicam aqui.
  const [isVoiceModeOpen, setIsVoiceModeOpen] = useState(false);
  // Mensagens que já existiam quando a conversa por voz começou: a tela de
  // voz não as mostra (ver snapshotVoiceConversationStart).
  const [voiceConversationPreviousIds, setVoiceConversationPreviousIds] = useState(null);

  // Resposta da Uni na Home (#128): só a de um pedido feito daqui. Vale para
  // Confirmar, Editar e Cancelar no card da Home e para o pedido que ainda
  // estava em andamento quando a tela de voz fechou. Sem isso, "Lançamento
  // salvo" ou o erro da gravação sumiam com o card. Abrir a tela de voz
  // limpa. Ajustado durante a renderização, como o turnState do card.
  const lastUniMessageId = [...messages].reverse().find((message) => message.from === 'uni')?.id ?? null;
  const [homeReplyBaseline, setHomeReplyBaseline] = useState(null);
  const [wasVoiceModeOpen, setWasVoiceModeOpen] = useState(isVoiceModeOpen);
  if (wasVoiceModeOpen !== isVoiceModeOpen) {
    setWasVoiceModeOpen(isVoiceModeOpen);
    setHomeReplyBaseline(!isVoiceModeOpen && isInteractionBusy ? { uniId: lastUniMessageId } : null);
  }
  function markHomeReply() {
    if (!isVoiceModeOpen) setHomeReplyBaseline({ uniId: lastUniMessageId });
  }

  // Watchdog de ESTADO (última barreira): a UI diz "ouvindo", mas o gravador
  // já parou por fora (track encerrada, permissão revogada). Nunca age por
  // tempo decorrido sozinho.
  useEffect(() => {
    if (!voiceInput.isActive) return undefined;
    const interval = setInterval(() => {
      const recorderState = voiceInput.getRecorderState?.() ?? 'inactive';
      if (recorderState !== 'recording' && voiceInput.isListening) voiceInput.cancel();
    }, 1500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceInput.isActive, voiceInput.cancel]);

  // Conversa em tempo real (épico #116): a Uni ouve e fala continuamente, e
  // o que envolve dinheiro passa pelo mesmo envio do texto.
  const { updateOwnProfile } = useSession();
  const saveNamePronunciation = useCallback(
    (pronunciation) => updateOwnProfile({ name_pronunciation: pronunciation }),
    [updateOwnProfile],
  );
  const realtime = useRealtimeUniConversation({
    messages,
    isBusy: isTyping || isExecuting,
    onSendTranscript,
    onActiveChange: onRealtimeVoiceActiveChange,
    onSaveNamePronunciation: saveNamePronunciation,
  });
  const stopRealtime = realtime.stop;
  const isRealtimeActive = realtime.isActive;
  const realtimeStatus = realtime.state.status;

  // Tela 19: saldo de minutos de voz. O chip desconta a conversa em
  // andamento, e o saldo é relido depois que ela termina (useVoiceMinutes).
  const userId = user?.id ?? null;
  const { voiceMinutes, refresh: refreshVoiceMinutes } = useVoiceMinutes({
    enabled: realtimeVoiceEnabled,
    userId,
    sessionStartedAt: realtime.state.startedAt,
    sessionEndedAt: realtime.state.endedAt,
  });
  // Recusa antes de conectar (ex.: minutos esgotados) não abre reserva: o
  // saldo pode ser relido na hora.
  const failedBeforeConnecting = realtimeStatus === REALTIME_STATUS.ERROR && realtime.state.startedAt === null;
  useEffect(() => {
    if (failedBeforeConnecting) refreshVoiceMinutes();
  }, [failedBeforeConnecting, refreshVoiceMinutes]);
  // Com a conversa aberta ou conectando, a tela nunca troca para "sem
  // minutos": ela perderia o botão de encerrar.
  const isRealtimeLive = isRealtimeActive || realtimeStatus === REALTIME_STATUS.CONNECTING;
  const isVoiceMinutesOut = voiceMinutes?.isOut === true && !isRealtimeLive;
  const voiceMinutesNotice = describeVoiceMinutesNotice(voiceMinutes);
  const voiceMinutesNoticeKey = voiceMinutesNotice?.key ?? null;
  const [dismissedVoiceNoticeKey, setDismissedVoiceNoticeKey] = useState(null);
  const storedDismissedVoiceNoticeKey = useMemo(
    () => (voiceMinutesNoticeKey ? readDismissedVoiceMinutesNotice(userId) : null),
    [userId, voiceMinutesNoticeKey],
  );
  const showVoiceMinutesNotice = Boolean(voiceMinutesNoticeKey)
    && voiceMinutesNoticeKey !== dismissedVoiceNoticeKey
    && voiceMinutesNoticeKey !== storedDismissedVoiceNoticeKey;

  function handleDismissVoiceMinutesNotice() {
    setDismissedVoiceNoticeKey(voiceMinutesNotice.key);
    writeDismissedVoiceMinutesNotice(userId, voiceMinutesNotice.key);
  }

  function handleOpenVoicePlan() {
    navigate(ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PLAN].path);
  }

  const cancelVoiceCaptureRef = useRef(null);
  const openVoiceModeRef = useRef(null);
  const isRealtimeActiveRef = useRef(false);
  const stopRealtimeRef = useRef(null);
  useEffect(() => {
    const cancelOnBackground = () => cancelVoiceCaptureRef.current?.('lifecycle');
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') cancelOnBackground();
    };

    window.addEventListener('pagehide', cancelOnBackground);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', cancelOnBackground);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // HOTFIX P0.1: token monotônico que identifica um NOVO turno de voz --
  // incrementado só quando uma captura de verdade começa (plan.proceed &&
  // plan.startCapture), nunca num toque recusado. CompactResponse usa a
  // MUDANÇA deste valor para saber com certeza que uma resposta antiga não
  // pode mais representar o turno atual, até que uma mensagem da Uni
  // REALMENTE NOVA (id diferente) apareça.
  const [turnStartToken, setTurnStartToken] = useState(0);

  function beginVoiceCapture() {
    // HOTFIX (barge-in): tocar enquanto a Uni fala INTERROMPE a fala E
    // inicia a captura no MESMO toque. voiceController.stop() é síncrono e
    // já limpa o <audio>/AbortController antes de retornar, então nenhum
    // callback tardio da fala interrompida mexe na gravação que começa.
    const plan = resolveBargeInPlan({
      isInteractionBusy,
      isSpeaking: isVoicePlaybackInterruptible,
      isVoiceError: isVoiceErrorState(voiceInput.status),
    });
    if (!plan.proceed) return false;
    if (plan.interruptSpeech) voiceController.stop();
    if (plan.resetError) voiceInput.reset();
    if (plan.startCapture) {
      // HOTFIX P0 (3ª investigação): `onBeforeVoiceStart` (que zera
      // voiceMessageId em UniChatPage.jsx) é chamado aqui, DIRETO e
      // incondicional, porque voiceInput.start() tem early-returns que podem
      // pular o onBeforeStart registrado. Sem isso, a resposta anterior
      // continuava "ativa" e reaparecia com o STOPPED do stop() acima.
      // Idempotente.
      onBeforeVoiceStart?.();
      setTurnStartToken((token) => token + 1);
      void voiceInput.start();
      if (import.meta.env.DEV) console.debug('[voice] voice_capture_started');
    }
    return true;
  }

  function finishVoiceCapture() {
    if (!voiceInput.isActive) return;
    voiceInput.stop();
    recordVoicePipelineDiagnostic('CAPTURE_RELEASED', { finishReason: 'send-button' });
  }

  function cancelVoiceCapture(reason) {
    if (!voiceInput.isActive) return;
    voiceInput.cancel();
    recordVoicePipelineDiagnostic('CAPTURE_CANCELLED', { finishReason: reason });
  }

  useEffect(() => {
    cancelVoiceCaptureRef.current = cancelVoiceCapture;
    isRealtimeActiveRef.current = isRealtimeActive;
    stopRealtimeRef.current = stopRealtime;
  });

  // Só fechar ou sair da página encerra a conversa. Trocar de aba ou de app
  // mantém a chamada; o limite de silêncio (REALTIME_IDLE_LIMIT_MS) e a
  // reserva de minutos já impedem que ela fique aberta gastando à toa.
  useEffect(() => {
    const endOnPageExit = () => {
      if (isRealtimeActiveRef.current) stopRealtimeRef.current?.('lifecycle');
    };
    window.addEventListener('pagehide', endOnPageExit);
    return () => window.removeEventListener('pagehide', endOnPageExit);
  }, []);

  // Chamado dentro do toque: o iOS só libera microfone e áudio ali.
  function beginRealtimeConversation() {
    if (isVoicePlaybackInterruptible) voiceController.stop();
    onBeforeVoiceStart?.();
    setVoiceConversationPreviousIds(snapshotVoiceConversationStart(messages));
    void realtime.start({
      greetingInstructions: buildRealtimeGreetingInstructions({
        suggestedGreeting: greeting.spokenGreeting,
        hasPendingDraft: pendingConfirmation,
      }),
    });
  }

  function handleOpenVoiceMode() {
    setVoiceConversationPreviousIds(snapshotVoiceConversationStart(messages));
    setIsVoiceModeOpen(true);
    beginVoiceCapture();
  }

  // Sem minutos, a tela abre no estado de saldo zerado e não tenta conectar.
  // O saldo é relido: se o plano mudou, a tela volta ao orb para conversar.
  // Com saldo, não se relê aqui: a reserva da conversa que começa entraria
  // no saldo como gasta.
  function handleOpenRealtimeVoiceMode() {
    setIsVoiceModeOpen(true);
    if (isVoiceMinutesOut) refreshVoiceMinutes();
    else beginRealtimeConversation();
  }

  // Declarado antes do efeito que lê a ref: efeitos rodam na ordem do código.
  useEffect(() => {
    openVoiceModeRef.current = handleOpenVoiceMode;
    if (realtimeVoiceEnabled) openVoiceModeRef.current = handleOpenRealtimeVoiceMode;
  });

  // O orb da barra inferior chega aqui como /app/home?falar=1, de qualquer
  // aba. O parâmetro é consumido uma vez (replace, sem entrada nova no
  // histórico). No Safari antes do "Ativar voz e microfone", a tela não abre:
  // a Home mostra o botão de ativação.
  // Cada toque no orb é uma navegação com key própria: a ref garante uma
  // abertura por toque, mesmo com o efeito rodando duas vezes no StrictMode.
  const wantsVoiceMode = searchParams.has(VOICE_MODE_SEARCH_PARAM);
  const voiceRequestKey = location.key;
  const handledVoiceRequestKeyRef = useRef(null);
  useEffect(() => {
    if (!wantsVoiceMode || handledVoiceRequestKeyRef.current === voiceRequestKey) return;
    handledVoiceRequestKeyRef.current = voiceRequestKey;
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.delete(VOICE_MODE_SEARCH_PARAM);
      return next;
    }, { replace: true });
    if (!voiceActivationRequired && !voiceActivationPending) openVoiceModeRef.current?.();
  }, [setSearchParams, voiceActivationPending, voiceActivationRequired, voiceRequestKey, wantsVoiceMode]);

  function handleRealtimeVoiceModeAction(action) {
    if (action === VOICE_MODE_ACTIONS.START) beginRealtimeConversation();
    else if (action === VOICE_MODE_ACTIONS.END_CONVERSATION) stopRealtime('user');
  }

  function handleCloseRealtimeVoiceMode() {
    stopRealtime('user');
    setIsVoiceModeOpen(false);
  }

  function handleLeaveRealtimeVoiceModeToChat() {
    stopRealtime('user');
    handleLeaveVoiceModeToChat();
  }

  function handleOpenPlanFromVoiceMode() {
    stopRealtime('user');
    setIsVoiceModeOpen(false);
    handleOpenVoicePlan();
  }

  function handleVoiceModeAction(action) {
    if (action === VOICE_MODE_ACTIONS.START) beginVoiceCapture();
    else if (action === VOICE_MODE_ACTIONS.STOP_LISTENING) finishVoiceCapture();
    else if (action === VOICE_MODE_ACTIONS.STOP_SPEAKING) voiceController.stop();
  }

  function handleCloseVoiceMode() {
    cancelVoiceCapture('close-button');
    if (isVoicePlaybackInterruptible) voiceController.stop();
    setIsVoiceModeOpen(false);
  }

  function handleLeaveVoiceModeToChat() {
    cancelVoiceCapture('open-chat');
    setIsVoiceModeOpen(false);
    navigate(SIMPLIFIED_ROUTES.UNI);
  }

  // Toques no card: com a conversa por voz aberta, a Uni fala a resposta.
  function handleCardConfirm(id) {
    realtime.announceScreenAction(REALTIME_SCREEN_ACTIONS.CONFIRM);
    markHomeReply();
    onConfirmAction(id);
  }

  function handleCardCancel(id) {
    realtime.announceScreenAction(REALTIME_SCREEN_ACTIONS.CANCEL);
    markHomeReply();
    onCancelAction(id);
  }

  function handleCardUndo(id) {
    realtime.announceScreenAction(REALTIME_SCREEN_ACTIONS.UNDO);
    markHomeReply();
    onUndoAction(id);
  }

  function handleCardSaveEdit(id, overrides) {
    realtime.announceScreenAction(REALTIME_SCREEN_ACTIONS.EDIT);
    markHomeReply();
    onSaveEditAction(id, overrides);
  }

  const compactResponseMessages = isVoiceModeOpen
    ? selectVoiceConversationMessages(messages, voiceConversationPreviousIds)
    : messages;
  const compactResponse = (
    <CompactResponse
      messages={compactResponseMessages}
      isExecuting={isExecuting}
      executionError={executionError}
      onConfirmAction={handleCardConfirm}
      onEditAction={() => navigate(SIMPLIFIED_ROUTES.UNI)}
      onCancelAction={handleCardCancel}
      onUndoAction={handleCardUndo}
      interactionState={interactionState}
      voiceStatus={voiceController.status}
      voiceCaptureStatus={voiceInput.status}
      voiceMessageId={voiceMessageId}
      turnStartToken={turnStartToken}
      interpretingOperationHint={interpretingOperationHint}
      presentation={isVoiceModeOpen ? 'voice' : 'home'}
      homeReplyBaseline={homeReplyBaseline}
      editForm={editForm}
      onSaveEditAction={onSaveEditAction ? handleCardSaveEdit : undefined}
    />
  );

  // Tela de voz (redesign, épico #91): o que a pessoa disse vai grande sob o
  // orb e o status passa a "Rascunho pronto" quando há card esperando.
  const voiceHasReply = isVoiceModeOpen
    && compactResponseMessages.some((message) => message.from === 'uni' && Boolean(message.text));
  const voiceHasPendingDraft = isVoiceModeOpen
    && compactResponseMessages.some((message) => message.confirmation?.status === 'pending');
  const voiceLastUserText = isVoiceModeOpen
    ? ([...compactResponseMessages].reverse().find((message) => message.from === 'user')?.text ?? '')
    : '';
  // Na captura antiga, enquanto grava e transcreve, o pedido novo ainda não
  // está na conversa: a última mensagem seria a do turno anterior.
  const isLegacyVoiceTurnPending = isListening
    || interactionState === SIMPLIFIED_UNI_STATES.TRANSCRIBING
    || interactionState === SIMPLIFIED_UNI_STATES.SUCCESS;
  const isRealtimeUserSpeaking = realtime.state.status === REALTIME_STATUS.USER_SPEAKING;
  // Antes da primeira fala da conversa, a tela mostra o pedido do rascunho
  // que ficou pendente. Depois, só o que a pessoa disse nesta conversa.
  const realtimeHeardUser = isRealtimeUserSpeaking
    || Boolean(realtime.state.liveUserText)
    || realtime.state.transcript.some((entry) => entry.role === 'user');
  const realtimeTranscript = realtimeHeardUser ? realtime.state.liveUserText : voiceLastUserText;

  const realtimeHint = (() => {
    const { status, error, errorCode } = realtime.state;
    if (status === REALTIME_STATUS.ERROR) {
      return REALTIME_TEXT_FALLBACK_CODES.has(errorCode)
        ? `${error} Toque em Escrever.`
        : `${error} Toque na Uni para tentar de novo.`;
    }
    if (status === REALTIME_STATUS.CONNECTING) return 'Se o navegador pedir, permita o uso do microfone.';
    // Com a fala da pessoa já na tela, a dica genérica sai para não disputar
    // espaço com ela.
    if (isRealtimeActive && realtime.isMuted) {
      return 'Toque em Desmutar para voltar a falar. Sem fala por um minuto, a conversa é encerrada.';
    }
    if (isRealtimeActive) {
      return realtimeTranscript ? null : 'Fale normalmente. Você pode interromper a Uni a qualquer momento.';
    }
    if (status === REALTIME_STATUS.ENDED && realtime.state.endReason === 'idle') {
      return `A conversa foi encerrada porque ninguém falou por um minuto. ${REALTIME_RESTART_HINT}`;
    }
    if (status === REALTIME_STATUS.ENDED && realtime.state.endReason === 'quota') {
      return 'Seus minutos de conversa por voz deste mês acabaram. Continue pelo texto. Toque em Escrever.';
    }
    if (status === REALTIME_STATUS.ENDED) return REALTIME_RESTART_HINT;
    return null;
  })();

  const voiceModeHint = (() => {
    if (voiceErrorMessage) return voiceErrorMessage;
    if (voiceInput.status === VOICE_CAPTURE_STATES.REQUESTING_PERMISSION) {
      return 'Se o navegador pedir, permita o uso do microfone.';
    }
    if (isListening) return 'Fale com calma. Toque em Enviar quando terminar.';
    return null;
  })();

  return (
    <div className={styles.home} data-simplified-home>
      <h1 id="simplified-home-title" className={styles.srOnly}>Hoje</h1>
      {/* Card da Uni (redesign, #89): a saudação vira o título e a frase de
          apoio vira o corpo. A abertura e o nome continuam vindo de
          resolveSimplifiedGreeting, a mesma fonte da saudação falada. */}
      <UniCard
        as="section"
        className={styles.homeCard}
        aria-labelledby="simplified-home-uni-title"
        time={clockLabel}
        title={(
          <span id="simplified-home-uni-title">
            {greeting.visualGreeting.eyebrow} {greeting.displayName}.
          </span>
        )}
        actions={voiceActivationRequired ? (
          <OutlineButton
            className={styles.voiceActivationButton}
            onClick={handleActivateVoice}
            disabled={voiceActivationPending}
          >
            {voiceActivationPending ? 'ATIVANDO...' : 'ATIVAR VOZ E MICROFONE'}
          </OutlineButton>
        ) : null}
      >
        {pendingUniUpdate ? (
          <div className={styles.uniUpdateBanner}>
            <p className={styles.greetingMessage}>
              🚀 <strong>A Uni evoluiu</strong>
            </p>
            <OutlineButton
              variant="ghost"
              className={styles.uniUpdateBannerButton}
              onClick={() => navigate(buildNovidadeUrl(pendingUniUpdate.id))}
            >
              Ver novidades
            </OutlineButton>
          </div>
        ) : realtimeVoiceEnabled ? (
          // A saudação é visual: a Home diz como começar a conversa, e a Uni
          // fala quando a pessoa toca nela.
          <p className={styles.greetingMessage}>
            Toque na <strong>Uni</strong>, no centro da barra abaixo, para conversar por voz.
          </p>
        ) : (
          <p className={styles.greetingMessage}>
            Estou aqui para ajudar você a tomar as <strong>melhores decisões</strong> financeiras.
          </p>
        )}
        {voiceActivationRequired ? (
          <div className={styles.voiceActivation}>
            <small>
              Toque uma vez para permitir o microfone e ouvir a saudação da Uni.
            </small>
            {voiceActivationError ? <p role="alert">{voiceActivationError}</p> : null}
          </div>
        ) : null}
      </UniCard>

      {showVoiceMinutesNotice ? (
        <SimplifiedVoiceMinutesNotice
          notice={voiceMinutesNotice}
          onOpenPlan={handleOpenVoicePlan}
          onDismiss={handleDismissVoiceMinutesNotice}
        />
      ) : null}

      <PwaInstallExperience />
      {/* Fora da tela de voz, o rascunho pendente continua aqui: sem ele não
          há como confirmar ou cancelar, e a atualização do app fica parada
          esperando (usePwaAutoUpdateBlock). */}
      {isVoiceModeOpen ? null : compactResponse}
      <SimplifiedHomeMonthReading />

      <SimplifiedHomeAgenda />


      {realtimeVoiceEnabled ? (
        <SimplifiedVoiceMode
          open={isVoiceModeOpen}
          interactionState={interactionState}
          view={resolveRealtimeVoiceModeView(realtime.state.status, {
            hasPendingDraft: voiceHasPendingDraft,
            isMuted: realtime.isMuted,
          })}
          hint={realtimeHint}
          response={isVoiceModeOpen ? compactResponse : null}
          transcript={realtimeTranscript}
          isUserSpeaking={isRealtimeUserSpeaking}
          hasReply={voiceHasReply}
          getVoiceStream={realtime.getLocalStream}
          microphone={canMuteRealtimeConversation(realtime.state.status)
            ? { isMuted: realtime.isMuted, onToggle: () => realtime.setMuted(!realtime.isMuted) }
            : null}
          voiceMinutes={voiceMinutes}
          isVoiceMinutesOut={isVoiceMinutesOut}
          onAction={handleRealtimeVoiceModeAction}
          onClose={handleCloseRealtimeVoiceMode}
          onWrite={handleLeaveRealtimeVoiceModeToChat}
          onOpenConversation={handleLeaveRealtimeVoiceModeToChat}
          onOpenPlan={handleOpenPlanFromVoiceMode}
        />
      ) : (
        <SimplifiedVoiceMode
          open={isVoiceModeOpen}
          interactionState={interactionState}
          hint={voiceModeHint}
          response={isVoiceModeOpen ? compactResponse : null}
          transcript={isLegacyVoiceTurnPending ? '' : voiceLastUserText}
          isUserSpeaking={isListening}
          hasReply={voiceHasReply}
          getVoiceStream={voiceInput.getActiveStream}
          getVoiceSessionId={voiceInput.getActiveSessionId}
          onAction={handleVoiceModeAction}
          onClose={handleCloseVoiceMode}
          onWrite={handleLeaveVoiceModeToChat}
          onOpenConversation={handleLeaveVoiceModeToChat}
        />
      )}

      <SimplifiedHomeFinancialGraph />
    </div>
  );
}

export default SimplifiedHomeView;
