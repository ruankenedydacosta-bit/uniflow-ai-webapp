import { useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UniInstantButton } from '../../features/uni-instant/index.js';
import { useVoiceManager } from '../../features/uni-audio/index.js';
import { useSharedUniVoiceInput, VOICE_CAPTURE_STATES } from '../../features/uni-voice/index.js';
import { useSession } from '../../app/SessionContext.jsx';

function UniCenterButtonSession({
  pathname,
  label,
  path,
  onNavigate,
  onVoiceCaptureStart,
}) {
  const navigate = useNavigate();
  const { user } = useSession();
  const voiceManager = useVoiceManager();
  const voiceInput = useSharedUniVoiceInput();
  const buttonRef = useRef(null);

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

  const handleHoldStart = useCallback(() => {
    onVoiceCaptureStart?.();
    onNavigate?.({ label, path });
    void voiceInput.start();
    navigate(path);
  }, [label, navigate, onNavigate, onVoiceCaptureStart, path, voiceInput]);

  const handleHoldEnd = useCallback(() => {
    if (voiceInput.status === VOICE_CAPTURE_STATES.LISTENING) {
      voiceInput.stop();
      return;
    }
    voiceInput.cancel();
  }, [voiceInput]);

  const handleHoldCancel = useCallback(() => {
    voiceInput.cancel();
  }, [voiceInput]);

  return (
    <UniInstantButton
      aria-label="Conversar com a Uni"
      label={label}
      active={pathname === path}
      voiceState={voiceInput.status}
      buttonRef={buttonRef}
      onTap={handleTap}
      onHoldStart={handleHoldStart}
      onHoldEnd={handleHoldEnd}
      onHoldCancel={handleHoldCancel}
    />
  );
}

function UniCenterButton({
  label = 'Uni',
  path = '/uni-ai',
  onNavigate,
  onVoiceCaptureStart,
}) {
  const { pathname } = useLocation();

  return (
    <UniCenterButtonSession
      pathname={pathname}
      label={label}
      path={path}
      onNavigate={onNavigate}
      onVoiceCaptureStart={onVoiceCaptureStart}
    />
  );
}

export default UniCenterButton;
