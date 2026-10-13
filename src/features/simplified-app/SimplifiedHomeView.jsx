import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import OutlineButton from '../../components/ui/OutlineButton/index.js';
import UniCard from '../../components/ui/UniCard/index.js';
import ActionConfirmation from '../uni-chat/components/ActionConfirmation.jsx';
import ChatInput from '../uni-chat/components/ChatInput.jsx';
import QuickSuggestions from '../uni-chat/components/QuickSuggestions.jsx';
import { PwaInstallExperience, usePwaAutoUpdateBlock } from '../pwa-install/index.js';
import SimplifiedHomeAgenda from './SimplifiedHomeAgenda.jsx';
import SimplifiedHomeFinancialGraph from './SimplifiedHomeFinancialGraph.jsx';
import SimplifiedHomeMonthReading from './SimplifiedHomeMonthReading.jsx';
import {
  resolveSimplifiedUniState,
  SIMPLIFIED_UNI_STATES,
} from './simplifiedHomeState.js';
import { getPageLoadGreetingOpening, resolveSimplifiedGreeting } from './simplifiedGreeting.js';
import { useUniProcessingMessage } from '../uni-chat/useUniProcessingMessage.js';
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
import {
  REALTIME_SCREEN_ACTIONS,
  REALTIME_STATUS,
  useRealtimeUniConversation,
} from '../uni-voice-realtime/index.js';
import { buildRealtimeGreetingInstructions } from '../uni-voice-realtime/realtimeGreeting.js';
import styles from './simplifiedApp.module.css';

// Recusas da conversa em tempo real que mandam a pessoa para o texto:
// minutos do mês esgotados ou sem assinatura.
const REALTIME_TEXT_FALLBACK_CODES = new Set(['VOICE_QUOTA_EXHAUSTED', 'SUBSCRIPTION_INACTIVE']);

// Depois que a conversa termina, o orb e o botão central abrem outra.
const REALTIME_RESTART_HINT = 'Toque na Uni para começar uma nova conversa.';

// Hora do cabeçalho do card da Uni ("Uni · 21:40"), fixada na abertura da Home.
const CLOCK_FORMATTER = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

// FASE ESTADOS DE PROCESSAMENTO: estados que mostram a mensagem de
// processamento rotativa NO LUGAR da última resposta (em vez da resposta
// do turno anterior, que ficaria "presa" na tela enquanto um novo turno já
// está em andamento). waiting_confirmation fica de fora -- o próprio card
// de confirmação já comunica "aguardando você"; error/idle já têm sua
// própria UI.
const PROCESSING_DISPLAY_STATES = new Set([
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
  categoryChoices = [],
  onChooseCategory,
  interactionState,
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

  // Hooks SEMPRE chamados, nunca depois de um return condicional (ver
  // early return "sem lastUser/lastUni" logo abaixo) -- usam valores de
  // fallback seguros quando ainda não há nada para processar/revelar.
  const processingMessage = useUniProcessingMessage(interactionState, {
    actionKind: pendingConfirmationMessage?.confirmation?.actionKind ?? null,
    operationHint: interactionState === 'interpreting' ? interpretingOperationHint : null,
  });

  if (!lastUser && !lastUni) return null;

  const showProcessingIndicator = Boolean(
    processingMessage && PROCESSING_DISPLAY_STATES.has(interactionState),
  );
  // Fallback honesto para estados sem mensagem própria: nunca inventa uma
  // operação específica, reaproveita a mesma frase genérica já usada por
  // "interpreting" sem hint reconhecido.
  const displayedProcessingMessage = processingMessage ?? 'Entendendo seu pedido…';
  const showHomeReply = Boolean(homeReplyBaseline && lastUni && lastUni.id !== homeReplyBaseline.uniId);
  if (!isVoicePresentation && !showProcessingIndicator && !pendingConfirmationMessage && !showHomeReply) return null;

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
          <p className={styles.uniResponse}>{lastUni.text}</p>
          {/* Exclusão recente (#189): o botão fica enquanto o chat ainda
              consegue trazer o lançamento de volta. */}
          {lastUni.undo?.status === 'available' && typeof onUndoAction === 'function' ? (
            <OutlineButton variant="secondary" onClick={() => onUndoAction(lastUni.id)} disabled={isExecuting}>
              Desfazer
            </OutlineButton>
          ) : null}
          {/* Rascunho esperando a categoria (#80). Na tela de voz a pessoa
              diz o nome: o toque não chegaria à conversa falada. */}
          {!isVoicePresentation && categoryChoices.length > 0 && typeof onChooseCategory === 'function' ? (
            <QuickSuggestions
              items={categoryChoices}
              onSelect={onChooseCategory}
              variant="rail"
              label="Escolha a categoria"
            />
          ) : null}
        </>
      ) : null}
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
  messages,
  isTyping,
  isExecuting,
  executionError,
  aiStatus,
  interpretingOperationHint,
  onSendTranscript,
  onConfirmAction,
  onCancelAction,
  onUndoAction,
  editForm = null,
  onSaveEditAction,
  categoryChoices = [],
  onChooseCategory,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [clockLabel] = useState(() => CLOCK_FORMATTER.format(new Date()));
  // UNIUPD1: limit:1 -- a Home so precisa saber "existe novidade pendente?",
  // nunca carrega o historico inteiro (isso fica com Sobre a UniFlow AI).
  const { pendingUpdate: pendingUniUpdate } = useUniUpdates({ limit: 1 });
  // A saudação da Home é visual. A Uni fala primeiro quando a pessoa toca no
  // orb, com a voz da conversa em tempo real (buildRealtimeGreetingInstructions).
  const greeting = useMemo(
    () => resolveSimplifiedGreeting(profile, user, getPageLoadGreetingOpening()),
    [profile, user],
  );

  const pendingConfirmation = messages.some(
    (message) => message.confirmation?.status === 'pending',
  );
  const interactionState = resolveSimplifiedUniState({
    isTyping,
    isExecuting,
    hasPendingConfirmation: pendingConfirmation,
    hasError: Boolean(executionError) || aiStatus === 'error',
  });
  const isInteractionBusy = isTyping || isExecuting;

  // Um toque no orb abre a tela de voz e já começa a conversa em tempo real,
  // no MESMO gesto (o iOS só libera microfone e áudio dentro de uma ativação
  // do usuário).
  const [isVoiceModeOpen, setIsVoiceModeOpen] = useState(false);
  // Mensagens que já existiam quando a conversa por voz começou: a tela de
  // voz não as mostra (ver snapshotVoiceConversationStart).
  const [voiceConversationPreviousIds, setVoiceConversationPreviousIds] = useState(null);

  // Resposta da Uni na Home (#128): só a de um pedido feito daqui. Vale para
  // Confirmar, Editar e Cancelar no card da Home e para o pedido que ainda
  // estava em andamento quando a tela de voz fechou. Sem isso, "Lançamento
  // salvo" ou o erro da gravação sumiam com o card. Abrir a tela de voz
  // limpa. Ajustado durante a renderização, não em efeito.
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

  // Conversa em tempo real (épico #116): a Uni ouve e fala continuamente, e
  // o que envolve dinheiro passa pelo mesmo envio do texto.
  const { updateOwnProfile, workspace } = useSession();
  const saveNamePronunciation = useCallback(
    (pronunciation) => updateOwnProfile({ name_pronunciation: pronunciation }),
    [updateOwnProfile],
  );
  const realtime = useRealtimeUniConversation({
    messages,
    isBusy: isTyping || isExecuting,
    onSendTranscript,
    onSaveNamePronunciation: saveNamePronunciation,
  });
  const stopRealtime = realtime.stop;
  const isRealtimeActive = realtime.isActive;
  const realtimeStatus = realtime.state.status;

  // Tela 19: saldo de minutos de voz. O chip desconta a conversa em
  // andamento, e o saldo é relido depois que ela termina (useVoiceMinutes).
  const userId = user?.id ?? null;
  const { voiceMinutes, refresh: refreshVoiceMinutes } = useVoiceMinutes({
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
  // Recarregar o app para atualizar derrubaria a conversa por voz aberta.
  usePwaAutoUpdateBlock(isRealtimeLive || isInteractionBusy || pendingConfirmation);
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

  const openVoiceModeRef = useRef(null);
  const isRealtimeActiveRef = useRef(false);
  const stopRealtimeRef = useRef(null);
  useEffect(() => {
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
    setVoiceConversationPreviousIds(snapshotVoiceConversationStart(messages));
    void realtime.start({
      workspaceId: workspace?.id,
      greetingInstructions: buildRealtimeGreetingInstructions({
        suggestedGreeting: greeting.spokenGreeting,
        hasPendingDraft: pendingConfirmation,
      }),
    });
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
    openVoiceModeRef.current = handleOpenRealtimeVoiceMode;
  });

  // O orb da barra inferior chega aqui como /app/home?falar=1, de qualquer
  // aba. O parâmetro é consumido uma vez (replace, sem entrada nova no
  // histórico).
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
    openVoiceModeRef.current?.();
  }, [setSearchParams, voiceRequestKey, wantsVoiceMode]);

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
    setIsVoiceModeOpen(false);
    navigate(SIMPLIFIED_ROUTES.UNI);
  }

  function handleOpenPlanFromVoiceMode() {
    stopRealtime('user');
    setIsVoiceModeOpen(false);
    handleOpenVoicePlan();
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

  // Com a Uni ocupada o toque não vale: marcar a resposta antes esconderia a
  // pergunta e os chips sem nada novo a caminho.
  // Campo de lançamento rápido: vai pelo mesmo envio do chat e da voz, e a
  // resposta aparece no card da Home. O campo só limpa quando a Uni aceitou.
  const [quickText, setQuickText] = useState('');
  function handleQuickSend(text) {
    if (isTyping || isExecuting) return;
    markHomeReply();
    onSendTranscript(text);
    setQuickText('');
  }

  function handleChooseCategory(item) {
    if (isTyping || isExecuting || typeof onChooseCategory !== 'function') return;
    markHomeReply();
    onChooseCategory(item);
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
      interpretingOperationHint={interpretingOperationHint}
      presentation={isVoiceModeOpen ? 'voice' : 'home'}
      homeReplyBaseline={homeReplyBaseline}
      editForm={editForm}
      onSaveEditAction={onSaveEditAction ? handleCardSaveEdit : undefined}
      categoryChoices={categoryChoices}
      onChooseCategory={handleChooseCategory}
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
        ) : (
          // A saudação é visual: a Home diz como começar a conversa, e a Uni
          // fala quando a pessoa toca nela.
          <p className={styles.greetingMessage}>
            Toque na <strong>Uni</strong>, no centro da barra abaixo, para conversar por voz.
          </p>
        )}
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
      <div className={styles.homeQuickInput}>
        <ChatInput
          value={quickText}
          onChange={setQuickText}
          onSend={handleQuickSend}
          disabled={isInteractionBusy}
        />
      </div>
      <SimplifiedHomeMonthReading />

      <SimplifiedHomeAgenda />

      <SimplifiedVoiceMode
        open={isVoiceModeOpen}
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

      <SimplifiedHomeFinancialGraph />
    </div>
  );
}

export default SimplifiedHomeView;
