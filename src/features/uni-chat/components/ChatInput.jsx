import { useEffect, useRef, useState } from 'react';
import { useUniVoiceInput, VOICE_CAPTURE_STATES } from '../../uni-voice';
import styles from './ChatInput.module.css';

export default function ChatInput({
  value,
  onChange,
  onSend,
  onBeforeVoiceStart,
  onAutoVoiceStartHandled,
  autoStartVoice = false,
  workspaceId,
  disabled,
  personalityProfileId = 'balanced',
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const valueRef = useRef(value);
  const autoStartAttemptedRef = useRef(false);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const voiceInput = useUniVoiceInput({
    profileId: personalityProfileId,
    workspaceId,
    onBeforeStart: onBeforeVoiceStart,
    onFinalTranscript: (transcript) => {
      const clean = (transcript || '').trim();
      if (!clean) return;
      const current = (valueRef.current || '').trim();
      const next = current ? `${current} ${clean}` : clean;
      onChange(next);
      onSend(next);
    },
  });

  const { status, start: startVoice } = voiceInput;

  useEffect(() => {
    if (
      !autoStartVoice
      || autoStartAttemptedRef.current
      || !workspaceId
      || disabled
    ) {
      return;
    }

    autoStartAttemptedRef.current = true;
    void startVoice().finally(() => {
      onAutoVoiceStartHandled?.();
    });
  }, [
    autoStartVoice,
    disabled,
    onAutoVoiceStartHandled,
    startVoice,
    workspaceId,
  ]);

  const isCapturing =
    status === VOICE_CAPTURE_STATES.LISTENING ||
    status === VOICE_CAPTURE_STATES.REQUESTING_PERMISSION ||
    status === VOICE_CAPTURE_STATES.PROCESSING;

  const showStatus =
    status !== VOICE_CAPTURE_STATES.IDLE && status !== VOICE_CAPTURE_STATES.COMPLETED;

  function handleSubmit(e) {
    e.preventDefault();
    if (!value.trim() || disabled) return;
    onSend(value.trim());
  }

  function handleVoiceClick() {
    if (disabled && !isCapturing) return;
    if (
      status === VOICE_CAPTURE_STATES.REQUESTING_PERMISSION
      || status === VOICE_CAPTURE_STATES.PROCESSING
    ) {
      voiceInput.cancel();
      return;
    }
    voiceInput.toggle();
  }

  const voiceLabel = status === VOICE_CAPTURE_STATES.LISTENING
    ? 'Parar e enviar áudio'
    : isCapturing ? 'Cancelar áudio' : 'Falar com a Uni por voz';

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {showStatus && voiceInput.message && (
        <p
          className={`${styles.voiceStatus} ${
            status === VOICE_CAPTURE_STATES.LISTENING ? styles.voiceStatusActive : ''
          }`}
          role="status"
          aria-live="polite"
        >
          {voiceInput.message}
        </p>
      )}
      <div className={`${styles.field} ${focused ? styles.fieldFocused : ''}`}>
        <button
          type="button"
          className={`${styles.voiceBtn} ${isCapturing ? styles.voiceBtnActive : ''}`}
          aria-label={voiceLabel}
          aria-pressed={isCapturing}
          title={voiceLabel}
          onClick={handleVoiceClick}
        >
          <MicIcon />
        </button>

        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          inputMode="text"
          placeholder="Pergunte ou peça algo para a Uni"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-label="Pergunte ou peça algo para a Uni"
        />

        <button
          type="submit"
          className={styles.sendBtn}
          disabled={!value.trim() || disabled}
          aria-label="Enviar mensagem"
        >
          <SendIcon />
        </button>
      </div>
    </form>
  );
}

function MicIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v4M8 23h8" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h15" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}
