import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ActionConfirmation from '../uni-chat/components/ActionConfirmation.jsx';
import {
  isAppleWebKitRuntime,
  VOICE_CAPTURE_STATES,
  useSharedUniVoiceInput,
  useStableVoiceInputHandlers,
  useVoiceIntensity,
} from '../uni-voice/index.js';
import { VOICE_TTS_ERROR_CODES, VOICE_TTS_STATUS } from '../uni-voice-tts/index.js';
import { UniMark } from './SimplifiedIcons.jsx';
import {
  isVoiceErrorState,
  resolveBargeInPlan,
  resolveSimplifiedUniState,
  SIMPLIFIED_UNI_STATES,
} from './simplifiedHomeState.js';
import { resolveSimplifiedGreeting } from './simplifiedGreeting.js';
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
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import styles from './simplifiedApp.module.css';

const SPEAKING_VOICE_STATUSES = new Set([VOICE_TTS_STATUS.LOADING, VOICE_TTS_STATUS.PLAYING]);

function getVoiceActivationError(errorCode) {
  if (errorCode === 'permission_denied') {
    return 'Permita o acesso ao microfone nos ajustes do Safari e tente novamente.';
  }
  if (errorCode === 'microphone_not_found') {
    return 'Nenhum microfone foi encontrado neste dispositivo.';
  }
  return 'Não consegui ativar o microfone. Tente novamente.';
}

const STATE_COPY = Object.freeze({
  [SIMPLIFIED_UNI_STATES.IDLE]: Object.freeze({
    button: 'FALAR COM A UNI',
    title: 'A Uni está pronta para ajudar.',
    description: 'Pressione e segure o botão para falar.',
  }),
  [SIMPLIFIED_UNI_STATES.LISTENING]: Object.freeze({
    // HOTFIX FINAL: texto obrigatório durante captura ativa (ver
    // resolveSimplifiedUniState/isCapturingVoice) -- precisa aparecer no
    // MESMO gesto que inicia a gravação, inclusive por cima de qualquer
    // texto anterior como "CONFIRME A AÇÃO".
    button: 'OUVINDO…',
    title: 'A Uni está ouvindo você.',
    description: 'Solte o botão para encerrar e enviar.',
  }),
  [SIMPLIFIED_UNI_STATES.TRANSCRIBING]: Object.freeze({
    button: 'TRANSCREVENDO...',
    title: 'Estou transformando sua voz em texto.',
    description: 'Aguarde só um instante.',
  }),
  [SIMPLIFIED_UNI_STATES.INTERPRETING]: Object.freeze({
    button: 'ENTENDENDO...',
    title: 'Estou entendendo seu pedido.',
    description: 'Vou responder com clareza.',
  }),
  [SIMPLIFIED_UNI_STATES.WAITING_CONFIRMATION]: Object.freeze({
    button: 'CONFIRME A AÇÃO',
    title: 'Revise e confirme antes de continuar.',
    description: 'Nada será executado sem a sua confirmação.',
  }),
  [SIMPLIFIED_UNI_STATES.EXECUTING]: Object.freeze({
    button: 'ORGANIZANDO...',
    title: 'Estou organizando sua solicitação.',
    description: 'Aguarde a confirmação final.',
  }),
  [SIMPLIFIED_UNI_STATES.SPEAKING]: Object.freeze({
    button: 'TOQUE PARA PARAR',
    title: 'A Uni está respondendo por voz.',
    description: 'Toque no botão para interromper.',
  }),
  [SIMPLIFIED_UNI_STATES.SUCCESS]: Object.freeze({
    button: 'PRONTO',
    title: 'Tudo pronto.',
    description: 'Sua solicitação foi encaminhada.',
  }),
  [SIMPLIFIED_UNI_STATES.ERROR]: Object.freeze({
    button: 'TENTE NOVAMENTE',
    title: 'Não consegui concluir. Tente novamente.',
    description: 'Você também pode abrir os detalhes da conversa.',
  }),
});

function LightWave() {
  const gradientId = useId().replace(/:/g, '');
  const glowId = useId().replace(/:/g, '');

  return (
    <div className={styles.lightWave} aria-hidden="true">
      <svg viewBox="0 0 900 210" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop stopColor="#7c3aed" />
            <stop offset=".46" stopColor="#2563eb" />
            <stop offset=".54" stopColor="#22d3ee" />
            <stop offset="1" stopColor="#10b981" />
          </linearGradient>
          <filter id={glowId} x="-10%" y="-50%" width="120%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {[0, 1, 2, 3, 4].map((line) => (
          <path
            key={line}
            d={`M-20 ${92 + line * 8}C150 ${18 + line * 7} 270 ${176 - line * 5} 450 103S735 ${22 + line * 9} 920 ${86 + line * 8}`}
            stroke={`url(#${gradientId})`}
            strokeOpacity={String(.2 + line * .14)}
          />
        ))}
        <path
          className={styles.waveCore}
          d="M-20 124C160 30 285 174 450 103S735 24 920 118"
          stroke={`url(#${gradientId})`}
          filter={`url(#${glowId})`}
        />
        <circle cx="450" cy="103" r="5" fill="#ecfeff" filter={`url(#${glowId})`} />
      </svg>
    </div>
  );
}

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
  interactionState,
  voiceStatus,
  voiceCaptureStatus,
  voiceMessageId,
  turnStartToken,
  interpretingOperationHint,
}) {
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
  // HOTFIX (abandono da revelação progressiva): a resposta nunca aparece
  // parcialmente -- ou está oculta (pending, cai no indicador de
  // processamento acima) ou está 100% visível de uma vez, junto com a voz.
  const uniDisplayText = lastUni && textAudioSync.activeMessageId === lastUni.id
    ? textAudioSync.displayText
    : lastUni?.text;

  return (
    <section className={styles.compactResponse} aria-label="Resposta da Uni" aria-live="polite">
      {lastUser?.text ? (
        <p className={styles.transcript}><span>Você</span>{lastUser.text}</p>
      ) : null}
      {showProcessingIndicator ? (
        <p className={styles.uniProcessing} role="status">
          <span className={styles.uniProcessingDot} aria-hidden="true" />
          {displayedProcessingMessage}
        </p>
      ) : lastUni?.text ? (
        <p className={styles.uniResponse}>
          <span>Uni</span>
          {uniDisplayText}
        </p>
      ) : null}
      {/* HOTFIX P1.4: "Ouvir resposta" removido do card compacto da Home --
          o fluxo principal aqui é sempre automático (autoplay). O botão
          continua existindo no chat completo (MessageBubble.jsx), que
          preserva a experiência de replay manual já aprovada. */}
      {lastUni?.confirmation?.status === 'pending' ? (
        <ActionConfirmation
          data={lastUni.confirmation}
          onConfirm={() => onConfirmAction(lastUni.id)}
          onEdit={onEditAction}
          onCancel={() => onCancelAction(lastUni.id)}
          isExecuting={isExecuting}
          executionError={executionError}
          processingLabel={processingMessage ?? undefined}
        />
      ) : null}
      <Link className={styles.detailsLink} to={SIMPLIFIED_ROUTES.UNI}>Ver conversa completa</Link>
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
  voiceEnabled,
  voiceController,
  voiceMessageId,
  interpretingOperationHint,
  onSendTranscript,
  onBeforeVoiceStart,
  onConfirmAction,
  onCancelAction,
  onWelcomeVoiceSettled,
}) {
  const navigate = useNavigate();
  const voiceInput = useSharedUniVoiceInput();
  const greeting = useMemo(
    () => resolveSimplifiedGreeting(profile, user),
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
    return undefined;
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
      if (event.target instanceof Element && event.target.closest('[data-uni-voice-control]')) return;
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
  // BLOCO UNI 2: reflete a SAÍDA de voz (TTS), nunca a captura -- usado
  // para mostrar o estado "falando" e, em beginVoiceCapture, para decidir
  // se o gesto precisa primeiro interromper (barge-in) antes de gravar.
  const isSpeaking = SPEAKING_VOICE_STATUSES.has(voiceController.status);
  const interactionState = resolveSimplifiedUniState({
    voiceStatus: voiceInput.status,
    isTyping,
    isExecuting,
    hasPendingConfirmation: pendingConfirmation,
    hasError: Boolean(executionError) || aiStatus === 'error',
    isSpeaking,
  });
  const stateCopy = STATE_COPY[interactionState];
  const isListening = voiceInput.status === VOICE_CAPTURE_STATES.LISTENING;
  const isCaptureBusy = [
    VOICE_CAPTURE_STATES.REQUESTING_PERMISSION,
    VOICE_CAPTURE_STATES.PROCESSING,
  ].includes(voiceInput.status);
  const isInteractionBusy = isTyping || isExecuting || isCaptureBusy;
  const voiceErrorMessage = isVoiceErrorState(voiceInput.status) ? voiceInput.message : null;

  // BUG 3: intensidade real do microfone enquanto ouve -- reaproveita o
  // MESMO stream de áudio já aberto pelo motor de voz
  // (voiceInput.getActiveStream()), sem pedir acesso ao microfone de novo.
  // Puramente visual: nunca afeta a captura/transcrição, nunca bloqueia o
  // push-to-talk.
  const { level: voiceLevel } = useVoiceIntensity({
    getStream: voiceInput.getActiveStream,
    active: isListening,
  });

  // BLOCO PUSH-TO-TALK: pressionar inicia a captura, soltar encerra e envia
  // -- nunca navega para /app/uni (Home e Uni compartilham o mesmo
  // UniChatPage por trás; "ficar na Home" é simplesmente NUNCA chamar
  // navigate aqui). Um único gesto rastreado por vez (pressedGestureRef)
  // evita disparo duplo entre pointerdown/keydown concorrentes.
  const pressedGestureRef = useRef(null);
  // HOTFIX P0.1: token monotônico que identifica um NOVO turno de voz --
  // incrementado só quando uma captura de verdade começa (plan.proceed &&
  // plan.startCapture), nunca num gesto rejeitado. CompactResponse usa a
  // MUDANÇA deste valor para saber com certeza que uma resposta antiga não
  // pode mais representar o turno atual, até que uma mensagem da Uni
  // REALMENTE NOVA (id diferente) apareça.
  const [turnStartToken, setTurnStartToken] = useState(0);

  function beginVoiceCapture() {
    // HOTFIX (barge-in): pressionar enquanto a Uni fala INTERROMPE a fala
    // E inicia a captura no MESMO gesto -- nunca exige soltar e apertar de
    // novo. voiceController.stop() é síncrono e já limpa o <audio>/
    // AbortController ANTES de retornar (onplay/onended/onerror são
    // desligados antes do pause() -- ver elevenLabsTtsProvider.stop()/
    // releaseAudio()), então nenhum callback tardio da fala interrompida
    // pode chegar depois e mexer no estado da gravação que começa a seguir.
    const plan = resolveBargeInPlan({
      isInteractionBusy,
      isSpeaking,
      isVoiceError: isVoiceErrorState(voiceInput.status),
    });
    if (!plan.proceed) return false;
    if (plan.interruptSpeech) voiceController.stop();
    if (plan.resetError) voiceInput.reset();
    if (plan.startCapture) {
      // HOTFIX P0 (3ª investigação): `onBeforeVoiceStart` (que zera
      // voiceMessageId em UniChatPage.jsx) antes só era disparado
      // INDIRETAMENTE via voiceInput.registerHandlers({onBeforeStart}),
      // chamado de DENTRO de voiceInput.start() -- mas start() tem
      // early-returns próprios (adapterRef.current/isVoiceCaptureActive/
      // !workspaceId/!adapter.supported) que podem pular esse callback
      // ANTES de chegar nele. Nesses casos, turnStartToken já tinha
      // incrementado (abaixo) mas voiceMessageId continuava apontando
      // para a mensagem antiga -- textAudioSync mantinha a resposta
      // anterior como "ativa" e um STOPPED chegando logo em seguida
      // (do voiceController.stop() acima) a revelava por completo,
      // fazendo-a reaparecer. Chamar aqui, DIRETO e incondicional, tira
      // essa garantia crítica de dentro de um fluxo com early-returns.
      // Idempotente (stop()/setVoiceMessageId(null) num estado já
      // limpo são no-ops) -- seguro mesmo chamado de novo por dentro de
      // voiceInput.start() quando ele prossegue normalmente.
      onBeforeVoiceStart?.();
      setTurnStartToken((token) => token + 1);
      void voiceInput.start();
    }
    return true;
  }

  function endVoiceCapture({ canceled }) {
    if (canceled) {
      voiceInput.cancel();
      return;
    }
    if (voiceInput.isListening) {
      voiceInput.stop();
      return;
    }
    // Solto antes de a gravação realmente começar (ex.: ainda aguardando
    // permissão) -- cancela em vez de deixar uma captura "órfã" seguir e
    // ser enviada mais tarde sem o usuário ainda estar segurando o botão.
    voiceInput.cancel();
  }

  // BUG REAL EM DISPOSITIVO FÍSICO: com o dedo parado (ou quase parado) sobre
  // o botão, a gravação às vezes encerrava sozinha. Duas causas reais:
  //
  // 1. `onPointerLeave` cancelava a captura assim que o ponteiro saía dos
  //    limites visuais do botão -- mas um botão grande pressionado pelo
  //    polegar tem jitter normal (o dedo nunca fica 100% parado), e o próprio
  //    PROPÓSITO de `setPointerCapture` (chamado no pointerdown abaixo) é
  //    justamente redirecionar pointermove/pointerup para este elemento
  //    MESMO que o ponteiro saia visualmente da área -- ou seja, soltar o
  //    dedo fora do botão ainda dispara pointerup aqui normalmente. Cancelar
  //    no pointerleave desfazia essa garantia e encerrava a gravação com o
  //    dedo ainda pressionado. Removido -- só pointerup/pointercancel/
  //    lostpointercapture (nunca a posição do ponteiro) decidem o fim do gesto.
  // 2. Sem `touch-action: none` no CSS (ver simplifiedApp.module.css), o
  //    navegador mobile pode competir pelo mesmo toque como um possível
  //    gesto nativo de rolagem/pan e, depois de alguns instantes, decidir
  //    que é rolagem e cancelar o ponteiro (pointercancel) mesmo com
  //    setPointerCapture já ativo -- setPointerCapture não sobrepõe
  //    touch-action. Corrigido no CSS.
  //
  // `onLostPointerCapture` é a rede de segurança real para quando a captura é
  // perdida sem um pointercancel/pointerup correspondente (ex.: navegador
  // redireciona a captura por conta própria) -- sem ela, a gravação podia
  // ficar "presa" ouvindo para sempre com o dedo já solto em outro lugar.
  function handleVoicePointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (pressedGestureRef.current !== null) return;
    if (!beginVoiceCapture()) return;
    pressedGestureRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleVoicePointerUp(event) {
    if (pressedGestureRef.current !== event.pointerId) return;
    pressedGestureRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    endVoiceCapture({ canceled: false });
  }

  function handleVoicePointerCancel(event) {
    if (pressedGestureRef.current !== event.pointerId) return;
    pressedGestureRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    endVoiceCapture({ canceled: true });
  }

  function handleVoiceLostPointerCapture(event) {
    if (pressedGestureRef.current !== event.pointerId) return;
    pressedGestureRef.current = null;
    endVoiceCapture({ canceled: true });
  }

  function handleVoiceKeyDown(event) {
    if (!['Enter', ' '].includes(event.key) || event.repeat || pressedGestureRef.current !== null) return;
    event.preventDefault();
    if (beginVoiceCapture()) pressedGestureRef.current = 'keyboard';
  }

  function handleVoiceKeyUp(event) {
    if (!['Enter', ' '].includes(event.key) || pressedGestureRef.current !== 'keyboard') return;
    event.preventDefault();
    pressedGestureRef.current = null;
    endVoiceCapture({ canceled: false });
  }

  // HOTFIX FINAL (deadlock "OUVINDO..." travado): o botão "Cancelar escuta"
  // é um segundo ponto de saída da captura, independente do gesto de
  // pressionar/soltar -- mas chamava `voiceInput.cancel` DIRETO, nunca
  // passando por `pressedGestureRef`. Se o usuário ainda estava com o
  // ponteiro pressionado no botão principal (pointerdown já disparado,
  // pointerup nunca chega a acontecer porque o usuário usa este botão em
  // vez de soltar) e clicava aqui, a captura era cancelada corretamente,
  // mas `pressedGestureRef.current` ficava PRESO no pointerId antigo para
  // sempre -- `handleVoicePointerDown` (`if (pressedGestureRef.current !==
  // null) return;`) passava a IGNORAR silenciosamente todo pointerdown
  // seguinte no botão principal, exigindo reload/troca de rota para
  // destravar. Cancelar por aqui agora sempre libera o gesto rastreado
  // também (idempotente -- se não havia gesto ativo, é um no-op).
  function handleCancelVoiceButtonClick() {
    pressedGestureRef.current = null;
    voiceInput.cancel();
  }

  return (
    <div className={styles.home} data-simplified-home>
      <section className={styles.greeting} aria-labelledby="simplified-home-title">
        <p>{greeting.visualGreeting.eyebrow}</p>
        <h1 id="simplified-home-title">{greeting.displayName}</h1>
        <p className={styles.greetingMessage}>
          Estou aqui para ajudar você a tomar as <strong>melhores decisões</strong> financeiras.
        </p>
        {voiceActivationRequired ? (
          <div className={styles.voiceActivation}>
            <button
              type="button"
              className={styles.voiceActivationButton}
              onClick={handleActivateVoice}
              disabled={voiceActivationPending}
            >
              {voiceActivationPending ? 'ATIVANDO...' : 'ATIVAR VOZ E MICROFONE'}
            </button>
            <small>
              Toque uma vez para permitir o microfone e ouvir a saudação da Uni.
            </small>
            {voiceActivationError ? <p role="alert">{voiceActivationError}</p> : null}
          </div>
        ) : null}
      </section>

      <CompactResponse
        messages={messages}
        isExecuting={isExecuting}
        executionError={executionError}
        onConfirmAction={onConfirmAction}
        onEditAction={() => navigate(SIMPLIFIED_ROUTES.UNI)}
        onCancelAction={onCancelAction}
        interactionState={interactionState}
        voiceStatus={voiceController.status}
        voiceCaptureStatus={voiceInput.status}
        voiceMessageId={voiceMessageId}
        turnStartToken={turnStartToken}
        interpretingOperationHint={interpretingOperationHint}
      />
      <LightWave />

      <section className={styles.uniAction} aria-label="Conversar com a Uni">
        <button
          type="button"
          className={styles.uniButton}
          data-state={interactionState}
          aria-label={isListening ? 'Solte para enviar o áudio' : 'Pressione e segure para falar com a Uni'}
          aria-pressed={isListening}
          disabled={voiceActivationRequired || voiceActivationPending || (isInteractionBusy && !isListening)}
          onPointerDown={handleVoicePointerDown}
          onPointerUp={handleVoicePointerUp}
          onPointerCancel={handleVoicePointerCancel}
          onLostPointerCapture={handleVoiceLostPointerCapture}
          onKeyDown={handleVoiceKeyDown}
          onKeyUp={handleVoiceKeyUp}
          onContextMenu={(event) => event.preventDefault()}
          data-uni-voice-control
        >
          <span className={styles.uniButtonRing} aria-hidden="true" />
          <span
            className={styles.uniVoiceLevelRing}
            aria-hidden="true"
            style={isListening ? { '--voice-level': voiceLevel } : undefined}
          />
          <span className={styles.uniMark}><UniMark /></span>
          <span className={styles.uniButtonLabel}>{stateCopy.button}</span>
        </button>
        {voiceInput.isActive ? (
          <button type="button" className={styles.cancelVoice} onClick={handleCancelVoiceButtonClick}>
            Cancelar escuta
          </button>
        ) : null}
      </section>

      <div className={styles.availabilityCard} role="status" aria-live="polite">
        <span className={styles.availabilityDot} aria-hidden="true" />
        <span>
          <strong>{stateCopy.title}</strong>
          <small>{voiceErrorMessage || stateCopy.description}</small>
        </span>
      </div>
    </div>
  );
}

export default SimplifiedHomeView;
