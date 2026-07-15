import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  resolveUniInstantContext,
  UniInstantButton,
  UniInstantResultCard,
} from '../../features/uni-instant/index.js';

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
  const buttonRef = useRef(null);
  const timersRef = useRef([]);
  const captureActiveRef = useRef(false);
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

  const handleTap = useCallback(() => {
    onNavigate?.({ label, path });
    navigate(path);
  }, [label, navigate, onNavigate, path]);

  const handleCaptureEnd = useCallback(() => {
    if (!captureActiveRef.current) return;
    captureActiveRef.current = false;
    clearTimers();
    onVoiceCaptureEnd?.();
    onTranscriptReady?.(context.transcript);
    setWaveState('completed');
    setCardState('transcribing');
    setCardOpen(true);
    after(260, () => setWaveState('idle'));
    after(700, () => {
      setCardState('processing');
      after(900, () => {
        const finalState = context.type === 'financial_action' ? 'confirmation' : 'response';
        setCardMessage(context.response);
        setCardState(finalState);
        onResponseReady?.({ type: finalState, message: context.response });
        if (finalState === 'response') onSpeakResponse?.(context.response);
      });
    });
  }, [after, clearTimers, context, onResponseReady, onSpeakResponse, onTranscriptReady, onVoiceCaptureEnd]);

  const handleHoldStart = useCallback(() => {
    clearTimers();
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
