import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  resolveUniInstantContext,
  UniInstantButton,
  UniInstantResultCard,
} from '../../features/uni-instant/index.js';
import { useVoiceManager } from '../../features/uni-audio/index.js';
import { useSession } from '../../app/SessionContext.jsx';

const CAPTURE_SAFETY_TIMEOUT_MS = 3500;

function UniCenterButtonSession({
  pathname,
  label,
  path,
  onNavigate,
  onVoiceCaptureStart,
  onVoiceCaptureEnd,
  onTranscriptReady,
  onResponseReady,
  onSpeakResponse,
}) {
  const navigate = useNavigate();
  const { user } = useSession();
  const voiceManager = useVoiceManager();
  const buttonRef = useRef(null);
  const timersRef = useRef([]);
  const captureActiveRef = useRef(false);
  const operationRef = useRef(0);
  const [waveState, setWaveState] = useState('idle');
  const [cardOpen, setCardOpen] = useState(false);
  const [cardState, setCardState] = useState('transcribing');
  const [cardMessage, setCardMessage] = useState('');
  const context = resolveUniInstantContext(pathname);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const after = useCallback((delay, callback) => {
    const timer = setTimeout(callback, delay);
    timersRef.current.push(timer);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const handleTap = useCallback(async () => {
    const playback = voiceManager.playContext('returning_user', {
      maxStartWaitMs: 700,
      userId: user?.id,
      userGesture: true,
    }).catch(() => false);
    await Promise.race([
      playback,
      new Promise((resolve) => setTimeout(resolve, 700)),
    ]);
    onNavigate?.({ label, path });
    navigate(path);
  }, [label, navigate, onNavigate, path, user?.id, voiceManager]);

  const handleCaptureEnd = useCallback(() => {
    if (!captureActiveRef.current) return;
    captureActiveRef.current = false;
    clearTimers();
    onVoiceCaptureEnd?.();
    try {
      onTranscriptReady?.(context.transcript);
    } catch {
      const operationId = `uni-instant-${operationRef.current}`;
      setWaveState('error');
      setCardMessage('Não consegui entender muito bem. Você pode tentar novamente.');
      setCardState('response');
      setCardOpen(true);
      voiceManager.playContext('error_understanding', { operationId }).catch(() => false);
      after(260, () => setWaveState('idle'));
      return;
    }
    setWaveState('completed');
    setCardState('transcribing');
    setCardOpen(true);
    const operationId = `uni-instant-${operationRef.current}`;
    after(260, () => setWaveState('idle'));
    after(700, () => {
      setCardState('processing');
      voiceManager.playContext('processing', {
        operationId,
        mockData: true,
      }).catch(() => false);
      after(900, () => {
        const finalState = context.type === 'financial_action' ? 'confirmation' : 'response';
        setCardMessage(context.response);
        setCardState(finalState);
        if (finalState === 'confirmation') {
          voiceManager.playContext('confirmation_sensitive', {
            operationId,
            sensitive: true,
            mockData: true,
          }).catch(() => false);
        } else if (context.type === 'error_understanding') {
          voiceManager.playContext('error_understanding', { operationId }).catch(() => false);
        }
        onResponseReady?.({ type: finalState, message: context.response });
        if (finalState === 'response') onSpeakResponse?.(context.response);
      });
    });
  }, [after, clearTimers, context, onResponseReady, onSpeakResponse, onTranscriptReady, onVoiceCaptureEnd, voiceManager]);

  const handleHoldStart = useCallback(() => {
    clearTimers();
    operationRef.current += 1;
    captureActiveRef.current = true;
    setCardOpen(false);
    setWaveState('listening');
    onVoiceCaptureStart?.();
    after(CAPTURE_SAFETY_TIMEOUT_MS, handleCaptureEnd);
  }, [after, clearTimers, handleCaptureEnd, onVoiceCaptureStart]);

  const handleHoldCancel = useCallback(() => {
    if (!captureActiveRef.current) return;
    captureActiveRef.current = false;
    clearTimers();
    setCardOpen(false);
    setWaveState('canceled');
    after(220, () => setWaveState('idle'));
  }, [after, clearTimers]);

  const handleClose = useCallback(() => {
    clearTimers();
    captureActiveRef.current = false;
    setCardOpen(false);
    setWaveState('idle');
  }, [clearTimers]);

  const handleOpenConversation = useCallback(() => {
    handleClose();
    onNavigate?.({ label, path });
    navigate(path);
  }, [handleClose, label, navigate, onNavigate, path]);

  const handleConfirm = useCallback(() => {
    setCardState('response');
    setCardMessage('Confirmação recebida. Nenhuma ação foi executada nesta simulação.');
  }, []);

  return (
    <>
      <UniInstantButton
        aria-label="Conversar com a Uni"
        label={label}
        active={pathname === path}
        voiceState={waveState}
        buttonRef={buttonRef}
        onTap={handleTap}
        onHoldStart={handleHoldStart}
        onHoldEnd={handleCaptureEnd}
        onHoldCancel={handleHoldCancel}
      />
      {cardOpen ? (
        <UniInstantResultCard
          state={cardState}
          transcript={context.transcript}
          message={cardMessage}
          confirmationRequired={context.type === 'financial_action'}
          onClose={handleClose}
          onConfirm={handleConfirm}
          onCorrect={handleOpenConversation}
          onOpenConversation={handleOpenConversation}
          returnFocusRef={buttonRef}
        />
      ) : null}
    </>
  );
}

function UniCenterButton({
  label = 'Uni',
  path = '/uni-ai',
  onNavigate,
  onVoiceCaptureStart,
  onVoiceCaptureEnd,
  onTranscriptReady,
  onResponseReady,
  onSpeakResponse,
}) {
  const { pathname } = useLocation();

  return (
    <UniCenterButtonSession
      key={pathname}
      pathname={pathname}
      label={label}
      path={path}
      onNavigate={onNavigate}
      onVoiceCaptureStart={onVoiceCaptureStart}
      onVoiceCaptureEnd={onVoiceCaptureEnd}
      onTranscriptReady={onTranscriptReady}
      onResponseReady={onResponseReady}
      onSpeakResponse={onSpeakResponse}
    />
  );
}

export default UniCenterButton;
