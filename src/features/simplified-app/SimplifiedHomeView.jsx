import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ActionConfirmation from '../uni-chat/components/ActionConfirmation.jsx';
import {
  isAppleWebKitRuntime,
  recordVoicePipelineDiagnostic,
  VOICE_CAPTURE_STATES,
  useSharedUniVoiceInput,
  useStableVoiceInputHandlers,
  useVoiceIntensity,
} from '../uni-voice/index.js';
import { VOICE_TTS_ERROR_CODES, VOICE_TTS_STATUS } from '../uni-voice-tts/index.js';
import { PwaInstallExperience, PwaUpdateCard } from '../pwa-install/index.js';
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
import {
  buildRadialVoiceBars,
  normalizeRadialVoiceLevel,
  smoothRadialVoiceLevel,
} from './radialVoiceWaveform.js';
import styles from './simplifiedApp.module.css';

const SPEAKING_VOICE_STATUSES = new Set([VOICE_TTS_STATUS.LOADING, VOICE_TTS_STATUS.PLAYING]);
const RADIAL_VOICE_BARS = buildRadialVoiceBars().map((bar) => (
  <span
    key={bar.index}
    className={styles.radialVoiceBar}
    data-tone={bar.tone}
    style={{
      '--bar-angle': `${bar.angle}deg`,
      '--bar-factor': bar.factor,
      '--bar-tone-mix': bar.toneMix,
      '--bar-delay': `${bar.delay}s`,
    }}
  />
));

function RadialVoiceWaveform({ active, getStream, getSessionId }) {
  const waveformRef = useRef(null);
  const targetLevelRef = useRef(0);
  const smoothedLevelRef = useRef(0);
  const { level } = useVoiceIntensity({ getStream, active, getSessionId });

  useEffect(() => {
    targetLevelRef.current = active ? normalizeRadialVoiceLevel(level) : 0;
  }, [active, level]);

  useEffect(() => {
    const waveform = waveformRef.current;
    if (!active || !waveform) {
      smoothedLevelRef.current = 0;
      waveform?.style.setProperty('--radial-voice-level', '0');
      return undefined;
    }

    let animationFrameId = 0;
    let previousTime = null;

    const renderFrame = (time) => {
      const deltaMs = previousTime === null ? 1000 / 60 : time - previousTime;
      previousTime = time;
      const nextLevel = smoothRadialVoiceLevel(
        smoothedLevelRef.current,
        targetLevelRef.current,
        deltaMs,
      );
      smoothedLevelRef.current = nextLevel;
      waveform.style.setProperty('--radial-voice-level', String(nextLevel));
      animationFrameId = window.requestAnimationFrame(renderFrame);
    };

    animationFrameId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [active]);

  return (
    <span
      ref={waveformRef}
      className={styles.radialVoiceWaveform}
      data-active={active}
      aria-hidden="true"
    >
      {RADIAL_VOICE_BARS}
    </span>
  );
}

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
  // BLOCO PUSH-TO-TALK: pressionar e segurar grava, soltar encerra e envia
  // -- nunca navega para /app/uni (Home e Uni compartilham o mesmo
  // UniChatPage por trás; "ficar na Home" é simplesmente NUNCA chamar
  // navigate aqui). Um único gesto rastreado por vez (pressedGestureRef)
  // evita disparo duplo entre pointerdown/keydown concorrentes.
  //
  // Estados do gesto (pressedGestureRef/gestureRef.current):
  //   null            -- IDLE: nenhum gesto em andamento.
  //   { captureStarted: false } -- ARMANDO: pointerdown já aconteceu,
  //     beginVoiceCapture() já foi chamado (roda IMEDIATO, sem atraso
  //     artificial -- ver HOTFIX 2 abaixo), mas ainda não confirmamos
  //     sucesso; um movimento além do threshold aqui é tratado como
  //     scroll/drag e cancela (nunca envia nada à Uni).
  //   { captureStarted: true } + voiceInput.status ainda não LISTENING --
  //     pedindo permissão/inicializando o microfone; o botão continua
  //     habilitado e a captura pode ainda ser cancelada por movimento.
  //   { captureStarted: true } + voiceInput.isListening === true --
  //     OUVINDO de verdade; movimento nunca mais cancela aqui (só
  //     pointerup/pointercancel/lostpointercapture/rede de segurança).
  //   pointerup -> finishVoiceInteraction('released') -- FINALIZA (stop(),
  //     nunca cancel()) e envia para o pipeline de transcrição/Uni.
  //   qualquer outro motivo -> finishVoiceInteraction(reason) -- CANCELA
  //     (cancel(), descarta o que foi capturado). Nunca a mesma operação
  //     que "released" -- soltar o dedo depois de falar é SEMPRE submit,
  //     nunca descarte.
  //
  // HISTÓRICO DE BUGS REAIS EM DISPOSITIVO FÍSICO (3 rodadas):
  //
  // 1) Rolar a Home tocando primeiro neste botão deixava a Uni presa em
  //    "Ouvindo..." para sempre -- não existia handler de pointermove
  //    (nada olhava para onde o dedo ia depois do toque) nem rede de
  //    segurança fora do próprio elemento. Corrigido com o threshold de
  //    movimento (item 1 abaixo) + rede de segurança em window (item 2).
  //
  // 2) HOTFIX revertido: a correção do bug 1 tentou também um atraso de
  //    ativação de 160ms + touch-action `pan-y` (para a rolagem nativa
  //    funcionar a partir do próprio botão). Resultado real: um hold
  //    NORMAL (sem scroll) passou a ficar preso em "Ouvindo..." -- `pan-y`
  //    reintroduziu a mesma classe de bug de WebKit/Chrome mobile que
  //    `touch-action: none` já existia para evitar (o navegador pode
  //    "roubar" o ponteiro de um elemento com setPointerCapture ativo de
  //    forma inconsistente). Revertido para `none` (mesmo valor do botão
  //    compacto da barra inferior, que funciona) e beginVoiceCapture()
  //    voltou a rodar imediato no pointerdown, sem timer. Trade-off aceito:
  //    rolar a partir do círculo exato do botão continua bloqueado; fora
  //    dele continua livre.
  //
  // 3) HOTFIX CRÍTICO (causa raiz real de "solta sozinho" / "Ouvindo mas a
  //    fala não chega"), duas causas simultâneas:
  //    a) O threshold de movimento do item 1 estava sendo aplicado durante
  //       o hold INTEIRO (distância medida a partir do pointerdown, nunca
  //       reseta) -- um hold de vários segundos acumula deriva natural do
  //       dedo/mão e ultrapassa o threshold sozinho, cancelando (nunca
  //       finalizando) uma gravação legítima em andamento. Corrigido:
  //       handleVoicePointerMove só cancela por movimento enquanto
  //       `!voiceInput.isListening` -- uma vez confirmado que o microfone
  //       está de verdade ouvindo, pequenos movimentos nunca mais cancelam.
  //    b) O `disabled` do botão (na JSX) incluía isInteractionBusy, que
  //       inclui REQUESTING_PERMISSION -- e REQUESTING_PERMISSION passa a
  //       valer true no MESMO pointerdown que inicia a captura. Desabilitar
  //       um <button> que TEM setPointerCapture ativo faz o navegador
  //       liberar a captura na hora (spec), disparando lostpointercapture
  //       com o dedo ainda fisicamente pressionado -- ou seja, TODO hold
  //       desabilitava o próprio botão que o estava capturando. Corrigido
  //       com `pressedGestureRef.current === null` na condição de disabled
  //       (nunca desabilita o botão que É o gesto ativo).
  //    Também removido: um timeout de watchdog POR GESTO de 10s que
  //    cancelava incondicionalmente após esse tempo, sem checar se o dedo
  //    ainda estava pressionado -- exatamente o "watchdog agressivo" que
  //    devia ser evitado (a captura já tem um limite físico real e mais
  //    generoso, 15s, em mediaRecorderAdapter.js).
  //
  // Arquitetura atual (mesma base de usePressAndHold.js, o botão compacto):
  // 1. Threshold de movimento (VOICE_MOVE_CANCEL_PX) -- só antes de
  //    voiceInput.isListening ser true (ver bug 3a acima).
  // 2. Rede de segurança em `window` (pointerup/pointercancel, fase de
  //    captura), independente de qual elemento o navegador realmente
  //    notifica.
  // 3. Watchdog de ESTADO (useEffect mais abaixo): só age quando
  //    voiceInput.isActive mas pressedGestureRef já é null (nenhum gesto
  //    sendo rastreado) -- nunca por tempo decorrido sozinho, nunca conclui
  //    "não encontrei o pointer" com o dedo ainda potencialmente pressionado.
  //
  // Todo caminho de término passa por UMA única rotina idempotente:
  // finishVoiceInteraction(reason). Chamar mais de uma vez para o mesmo
  // gesto nunca quebra nada (a segunda chamada não encontra gesto rastreado
  // e não faz nada).
  const VOICE_MOVE_CANCEL_PX = 10;

  const pressedGestureRef = useRef(null);
  const gestureRef = useRef(null);
  const buttonRef = useRef(null);
  const finishVoiceInteractionRef = useRef(null);
  // Espelho reativo de `pressedGestureRef.current !== null` -- só existe
  // porque a JSX (disabled=, ver abaixo) precisa dessa informação DURANTE O
  // RENDER, e ler `ref.current` no render é proibido (react-hooks/refs).
  // setPressedGesture() é o ÚNICO ponto que escreve em pressedGestureRef,
  // sempre mantendo os dois em sincronia.
  const [hasActiveVoiceGesture, setHasActiveVoiceGesture] = useState(false);

  function setPressedGesture(value) {
    pressedGestureRef.current = value;
    setHasActiveVoiceGesture(value !== null);
  }

  // Ref (nunca recriada por render) para que addEventListener/
  // removeEventListener em `window` sempre recebam a MESMA referência de
  // função -- só assim removeEventListener realmente remove o listener.
  const handleWindowVoicePointerEndRef = useRef((event) => {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const reason = event.type === 'pointerup'
      ? 'released'
      : event.type === 'pointercancel' ? 'pointercancel' : 'window-safety-net';
    finishVoiceInteractionRef.current?.(reason);
  });

  // HOTFIX CRÍTICO: havia também um timeout de watchdog POR GESTO (10s)
  // que cancelava incondicionalmente após esse tempo -- exatamente o
  // "watchdog agressivo" que a especificação pede para evitar: ele não
  // verifica se o dedo ainda está pressionado, só conclui que "já passou
  // tempo demais" e cancela, mesmo com o usuário genuinamente segurando
  // (ex.: teste de 8s ficava perigosamente perto do limite de 10s; um
  // hold real um pouco mais longo cancelava sozinho). Removido -- a
  // captura já tem um limite físico real e bem mais generoso
  // (VOICE_AUDIO_MAX_DURATION_MS = 15s em mediaRecorderAdapter.js, que
  // para a gravação e devolve erro tratado, não um cancelamento mudo), e
  // o watchdog de ESTADO abaixo (só age quando pressedGestureRef já está
  // null, nunca por tempo decorrido sozinho) continua como última
  // barreira real contra um estado preso de verdade.
  const detachVoiceGestureSafetyNet = useCallback(() => {
    window.removeEventListener('pointerup', handleWindowVoicePointerEndRef.current, true);
    window.removeEventListener('pointercancel', handleWindowVoicePointerEndRef.current, true);
  }, []);

  // O navegador móvel pode suspender a página sem entregar pointerup ou
  // lostpointercapture. Libera o gesto local quando a captura termina ou a
  // página sai de primeiro plano para que o próximo toque nunca exija reload.
  // Só limpa o ref (não passa por setPressedGesture/setState) -- é um
  // fallback defensivo para quando voiceInput já ficou inativo por um
  // caminho externo (nunca o pointerup/finishVoiceInteraction normal, que
  // já limpam os dois em sincronia); chamar setState direto no corpo de um
  // effect nesse caminho é desnecessário aqui e o lint não permite.
  useEffect(() => {
    if (!voiceInput.isActive) pressedGestureRef.current = null;
  }, [voiceInput.isActive]);

  // Watchdog de segurança (última barreira, item 5 acima): nunca deveria
  // disparar na prática -- a rede de segurança em window e o timeout
  // específico de `stop/onstop` cobrem os casos reais -- mas garante que
  // nenhuma combinação de bugs futuros deixe a Uni presa em "Ouvindo...".
  // Nunca recarrega a página; só finaliza o ciclo normalmente. Depende só
  // Só intervém no estado impossível: gesto ausente + recorder fora de
  // `recording` + UI ainda em LISTENING. Um hold legítimo continua sem
  // limite artificial por tempo decorrido.
  useEffect(() => {
    if (!voiceInput.isActive) return undefined;
    const interval = setInterval(() => {
      const recorderState = voiceInput.getRecorderState?.() ?? 'inactive';
      if (
        pressedGestureRef.current === null
        && recorderState !== 'recording'
        && voiceInput.isListening
      ) voiceInput.cancel();
    }, 1500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceInput.isActive, voiceInput.cancel]);

  useEffect(() => {
    const releasePressedGesture = () => {
      setPressedGesture(null);
      finishVoiceInteractionRef.current?.('lifecycle');
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') releasePressedGesture();
    };

    window.addEventListener('pagehide', releasePressedGesture);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', releasePressedGesture);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
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
      if (import.meta.env.DEV) console.debug('[voice] voice_capture_started');
    }
    return true;
  }

  // Rotina ÚNICA e idempotente de término -- todo caminho (soltar, cancelar,
  // scroll detectado, pointercancel, lostpointercapture, rede de segurança
  // em window, background) passa por aqui. `reason` só afeta se o
  // resultado é "enviar" (reason === 'released', e só se de fato havia
  // gravação em andamento) ou "descartar" (qualquer outro motivo). Chamar
  // sem nenhum gesto rastreado (gestureRef.current null) é um no-op seguro
  // -- é o que garante rodar mais de uma vez sem quebrar nada.
  //
  // Diagnóstico (DEV apenas, nunca em Production): reason codes claros para
  // saber por que uma interação terminou, sem log sensível nenhum (só o
  // motivo, nunca texto/áudio do usuário).
  const VOICE_FINISH_REASON_CODES = Object.freeze({
    released: 'voice_finish_pointerup',
    scroll: 'voice_cancel_scroll',
    pointercancel: 'voice_cancel_pointercancel',
    lostpointercapture: 'voice_cancel_lostcapture',
    'window-safety-net': 'voice_cancel_window_safety_net',
    lifecycle: 'voice_cancel_lifecycle',
    'activation-failed': 'voice_cancel_activation_failed',
  });

  function finishVoiceInteraction(reason) {
    const gesture = gestureRef.current;
    if (!gesture) return;
    if (import.meta.env.DEV) {
      console.debug(`[voice] ${VOICE_FINISH_REASON_CODES[reason] ?? reason}`);
    }
    detachVoiceGestureSafetyNet();
    const { pointerId, captureStarted } = gesture;
    gestureRef.current = null;
    setPressedGesture(null);

    if (buttonRef.current?.hasPointerCapture?.(pointerId)) {
      buttonRef.current.releasePointerCapture(pointerId);
    }

    // beginVoiceCapture() pode recusar o gesto (plan.proceed === false,
    // ex.: já ocupado processando outra coisa) -- nesse caso captureStarted
    // nunca chega a ser true e não há nada para parar/cancelar aqui.
    if (!captureStarted) return;

    if (reason === 'released') {
      voiceInput.stop();
    } else {
      voiceInput.cancel();
    }
    recordVoicePipelineDiagnostic(
      reason === 'released' ? 'CAPTURE_RELEASED' : 'CAPTURE_CANCELLED',
      { finishReason: reason },
    );
    if (import.meta.env.DEV) console.debug('[voice] voice_cleanup_complete');
  }

  useEffect(() => {
    finishVoiceInteractionRef.current = finishVoiceInteraction;
  });

  function handleVoicePointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (pressedGestureRef.current !== null) return;

    setPressedGesture(event.pointerId);
    gestureRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      captureStarted: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);

    window.addEventListener('pointerup', handleWindowVoicePointerEndRef.current, true);
    window.addEventListener('pointercancel', handleWindowVoicePointerEndRef.current, true);

    if (import.meta.env.DEV) console.debug('[voice] voice_gesture_armed');

    // beginVoiceCapture roda IMEDIATO, igual ao comportamento original --
    // ver HOTFIX acima sobre por que o atraso de ativação foi revertido.
    if (!beginVoiceCapture()) {
      finishVoiceInteraction('activation-failed');
      return;
    }
    gestureRef.current.captureStarted = true;
  }

  // Scroll/drag não é comando de voz: ANTES do microfone estar realmente
  // ativo (voiceInput.isListening), qualquer movimento além do threshold,
  // em QUALQUER direção, cancela o gesto -- é exatamente esta checagem que
  // resolveu o bug físico de scroll sobre o botão, preservada aqui.
  //
  // HOTFIX CRÍTICO: esse mesmo threshold estava sendo aplicado durante o
  // hold INTEIRO, não só na janela de ativação -- distância é medida a
  // partir do ponto do pointerdown e NUNCA reseta, então um hold de
  // vários segundos (ex.: 3-8s) eventualmente acumula deriva natural do
  // dedo/mão (segurar um botão grande com o polegar enquanto fala não é
  // fisicamente perfeito) e ultrapassa 10px sozinho -- cancelando (não
  // finalizando) uma gravação legítima em andamento, descartando o áudio
  // já capturado. Uma vez confirmado que o microfone está de verdade
  // ouvindo, um pequeno movimento nunca mais é motivo de cancelamento
  // aqui -- só pointerup/pointercancel/lostpointercapture decidem o fim.
  function handleVoicePointerMove(event) {
    const gesture = gestureRef.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (voiceInput.isListening) return;
    const distance = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
    if (distance > VOICE_MOVE_CANCEL_PX) {
      finishVoiceInteraction('scroll');
    }
  }

  function handleVoicePointerUp(event) {
    if (pressedGestureRef.current !== event.pointerId) return;
    finishVoiceInteraction('released');
  }

  function handleVoicePointerCancel(event) {
    if (pressedGestureRef.current !== event.pointerId) return;
    finishVoiceInteraction('pointercancel');
  }

  function handleVoiceLostPointerCapture(event) {
    if (pressedGestureRef.current !== event.pointerId) return;
    finishVoiceInteraction('lostpointercapture');
  }

  function handleVoiceKeyDown(event) {
    if (!['Enter', ' '].includes(event.key) || event.repeat || pressedGestureRef.current !== null) return;
    event.preventDefault();
    if (beginVoiceCapture()) setPressedGesture('keyboard');
  }

  function handleVoiceKeyUp(event) {
    if (!['Enter', ' '].includes(event.key) || pressedGestureRef.current !== 'keyboard') return;
    event.preventDefault();
    setPressedGesture(null);
    if (voiceInput.isListening) {
      voiceInput.stop();
    } else {
      voiceInput.cancel();
    }
  }

  // HOTFIX FINAL (deadlock "OUVINDO..." travado): o botão "Cancelar escuta"
  // é um segundo ponto de saída da captura, independente do gesto de
  // pressionar/soltar. Passa por finishVoiceInteraction quando há um gesto
  // de pointer rastreado (libera pointer capture, timers e rede de
  // segurança também); e sempre chama voiceInput.cancel() por cima --
  // cobre o caso de captura iniciada por teclado (sem gestureRef) e é
  // idempotente (chamar cancel() sem nada ativo é um no-op seguro).
  function handleCancelVoiceButtonClick() {
    setPressedGesture(null);
    finishVoiceInteraction('cancel-button');
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

      <PwaInstallExperience />
      <PwaUpdateCard
        blocked={voiceInput.isActive || isInteractionBusy || pendingConfirmation || voiceActivationPending}
      />
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
          ref={buttonRef}
          type="button"
          className={styles.uniButton}
          data-state={interactionState}
          aria-label={isListening ? 'Solte para enviar o áudio' : 'Pressione e segure para falar com a Uni'}
          aria-pressed={isListening}
          disabled={
            voiceActivationRequired
            || voiceActivationPending
            // HOTFIX CRÍTICO (causa raiz real do "solta sozinho"/"Ouvindo
            // mas a fala não chega"): desabilitar um <button> que TEM
            // setPointerCapture ativo faz o navegador liberar a captura na
            // hora (spec: um controle disabled não pode ser alvo de
            // pointer events) -- dispara lostpointercapture com o dedo
            // ainda fisicamente pressionado. isInteractionBusy inclui
            // REQUESTING_PERMISSION, que passa a valer true no MESMO
            // pointerdown que inicia a captura (beginVoiceCapture ->
            // voiceInput.start() -> dispatch REQUEST_PERMISSION) -- ou
            // seja, TODO hold desabilitava o próprio botão que o estava
            // capturando, matando a gravação por conta própria antes de
            // qualquer soltura real. `!hasActiveVoiceGesture` (espelho
            // reativo de pressedGestureRef.current === null -- ler o ref
            // direto aqui não é permitido durante o render) garante que
            // nunca desabilitamos o botão que É o gesto ativo -- continua
            // desabilitando por outros motivos (digitando, executando)
            // quando não há nenhum hold em andamento.
            || (isInteractionBusy && !isListening && !hasActiveVoiceGesture)
          }
          onPointerDown={handleVoicePointerDown}
          onPointerMove={handleVoicePointerMove}
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
          />
          <RadialVoiceWaveform
            active={isListening}
            getStream={voiceInput.getActiveStream}
            getSessionId={voiceInput.getActiveSessionId}
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
