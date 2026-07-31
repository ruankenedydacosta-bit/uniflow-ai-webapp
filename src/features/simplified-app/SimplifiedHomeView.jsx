import { useEffect, useId, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ActionConfirmation from '../uni-chat/components/ActionConfirmation.jsx';
import { VOICE_CAPTURE_STATES, useSharedUniVoiceInput, useVoiceIntensity } from '../uni-voice/index.js';
import { AUTO_SPEAK_MAX_LENGTH, VOICE_TTS_STATUS } from '../uni-voice-tts/index.js';
import { UniMark } from './SimplifiedIcons.jsx';
import {
  isVoiceErrorState,
  resolveSimplifiedUniState,
  SIMPLIFIED_UNI_STATES,
} from './simplifiedHomeState.js';
import { resolveSimplifiedGreeting } from './simplifiedGreeting.js';
import { buildWelcomeSessionKey, claimWelcomeVoice } from './welcomeVoiceSession.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import styles from './simplifiedApp.module.css';

const SPEAKING_VOICE_STATUSES = new Set([VOICE_TTS_STATUS.LOADING, VOICE_TTS_STATUS.PLAYING]);

const STATE_COPY = Object.freeze({
  [SIMPLIFIED_UNI_STATES.IDLE]: Object.freeze({
    button: 'FALAR COM A UNI',
    title: 'A Uni está pronta para ajudar.',
    description: 'Pressione e segure o botão para falar.',
  }),
  [SIMPLIFIED_UNI_STATES.LISTENING]: Object.freeze({
    button: 'SOLTE PARA ENVIAR',
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

function CompactResponse({
  messages,
  isExecuting,
  executionError,
  onConfirmAction,
  onEditAction,
  onCancelAction,
  voiceEnabled,
  onSpeakMessage,
}) {
  const lastUser = [...messages].reverse().find((message) => message.from === 'user');
  const lastUni = [...messages].reverse().find((message) => message.from === 'uni');

  if (!lastUser && !lastUni) return null;

  // BLOCO UNI 2: mensagens longas demais para autoplay (ver
  // AUTO_SPEAK_MAX_LENGTH) continuam completas na tela -- só ganham este
  // botão manual, já que a Home (ao contrário do chat completo) não tem
  // um "Ouvir" por mensagem.
  const showManualSpeak = Boolean(
    voiceEnabled
    && lastUni?.text
    && lastUni.text.length > AUTO_SPEAK_MAX_LENGTH
    && typeof onSpeakMessage === 'function',
  );

  return (
    <section className={styles.compactResponse} aria-label="Resposta da Uni" aria-live="polite">
      {lastUser?.text ? (
        <p className={styles.transcript}><span>Você</span>{lastUser.text}</p>
      ) : null}
      {lastUni?.text ? (
        <p className={styles.uniResponse}><span>Uni</span>{lastUni.text}</p>
      ) : null}
      {showManualSpeak ? (
        <button type="button" className={styles.manualSpeak} onClick={() => onSpeakMessage(lastUni)}>
          Ouvir resposta
        </button>
      ) : null}
      {lastUni?.confirmation?.status === 'pending' ? (
        <ActionConfirmation
          data={lastUni.confirmation}
          onConfirm={() => onConfirmAction(lastUni.id)}
          onEdit={onEditAction}
          onCancel={() => onCancelAction(lastUni.id)}
          isExecuting={isExecuting}
          executionError={executionError}
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
  onSendTranscript,
  onBeforeVoiceStart,
  onConfirmAction,
  onCancelAction,
  onSpeakMessage,
  onWelcomeVoiceSettled,
}) {
  const navigate = useNavigate();
  const voiceInput = useSharedUniVoiceInput();
  const greeting = useMemo(
    () => resolveSimplifiedGreeting(profile, user),
    [profile, user],
  );
  const sessionKey = buildWelcomeSessionKey(user, session);

  useEffect(() => voiceInput.registerHandlers({
    onBeforeStart: onBeforeVoiceStart,
    onFinalTranscript: (transcript) => {
      const cleanTranscript = String(transcript ?? '').trim();
      if (cleanTranscript) onSendTranscript(cleanTranscript);
    },
  }), [onBeforeVoiceStart, onSendTranscript, voiceInput]);

  useEffect(() => {
    if (!voiceEnabled) return;
    if (!claimWelcomeVoice(sessionKey)) return;

    // BLOCO VOZ HIDRATAÇÃO: a saudação tem prioridade exclusiva -- o
    // autoplay de mensagens (UniChatPage) só é armado quando a fala da
    // saudação TERMINA ou FALHA (finally), nunca antes (preparando/
    // carregando/tocando ficam bloqueando). Sucesso e falha liberam igual.
    void voiceController.speak(greeting.voiceText)
      .catch(() => {
        // A saudação visual continua disponível mesmo quando o navegador
        // bloqueia áudio; a tentativa permanece limitada a uma vez por sessão.
      })
      .finally(() => {
        onWelcomeVoiceSettled?.();
      });
  }, [greeting.voiceText, sessionKey, voiceController, voiceEnabled, onWelcomeVoiceSettled]);

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
  // para mostrar o estado "falando" e para impedir que um toque no botão
  // inicie uma gravação nova enquanto a Uni ainda está respondendo (só
  // interrompe a fala nesse caso, ver beginVoiceCapture).
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

  function beginVoiceCapture() {
    if (isInteractionBusy) return false;
    // BLOCO UNI 2: pressionar enquanto a Uni fala INTERROMPE a fala (dá ao
    // usuário uma forma real de cortar uma resposta) mas NUNCA inicia a
    // gravação no mesmo gesto -- evita capturar o instante do "corte" como
    // parte do áudio e mantém a regra de nunca gravar por cima da fala.
    if (isSpeaking) {
      voiceController.stop();
      return false;
    }
    if (isVoiceErrorState(voiceInput.status)) voiceInput.reset();
    void voiceInput.start();
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

  return (
    <div className={styles.home} data-simplified-home>
      <section className={styles.greeting} aria-labelledby="simplified-home-title">
        <p>Seja bem-vindo,</p>
        <h1 id="simplified-home-title">{greeting.heading}</h1>
        <p className={styles.greetingMessage}>
          Estou aqui para ajudar você a tomar as <strong>melhores decisões</strong> financeiras.
        </p>
      </section>

      <CompactResponse
        messages={messages}
        isExecuting={isExecuting}
        executionError={executionError}
        onConfirmAction={onConfirmAction}
        onEditAction={() => navigate(SIMPLIFIED_ROUTES.UNI)}
        onCancelAction={onCancelAction}
        voiceEnabled={voiceEnabled}
        onSpeakMessage={onSpeakMessage}
      />
      <LightWave />

      <section className={styles.uniAction} aria-label="Conversar com a Uni">
        <button
          type="button"
          className={styles.uniButton}
          data-state={interactionState}
          aria-label={isListening ? 'Solte para enviar o áudio' : 'Pressione e segure para falar com a Uni'}
          aria-pressed={isListening}
          disabled={isInteractionBusy && !isListening}
          onPointerDown={handleVoicePointerDown}
          onPointerUp={handleVoicePointerUp}
          onPointerCancel={handleVoicePointerCancel}
          onLostPointerCapture={handleVoiceLostPointerCapture}
          onKeyDown={handleVoiceKeyDown}
          onKeyUp={handleVoiceKeyUp}
          onContextMenu={(event) => event.preventDefault()}
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
          <button type="button" className={styles.cancelVoice} onClick={voiceInput.cancel}>
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
