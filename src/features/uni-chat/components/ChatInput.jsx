import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  useSharedUniVoiceInput,
  useStableVoiceInputHandlers,
  VOICE_CAPTURE_STATES,
} from '../../uni-voice';
import { PhMicrophoneIcon, PhPaperPlaneRightIcon } from '../../simplified-app/SimplifiedIcons.jsx';
import styles from './ChatInput.module.css';

export default function ChatInput({
  value,
  onChange,
  onSend,
  onBeforeVoiceStart,
  disabled,
  isSpeaking = false,
  onInterruptSpeech,
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }, [value]);

  const voiceInput = useSharedUniVoiceInput();

  const voiceHandlers = useMemo(() => ({
    onBeforeStart: onBeforeVoiceStart,
    onFinalTranscript: (transcript) => {
      const clean = (transcript || '').trim();
      if (!clean) return;
      const current = (valueRef.current || '').trim();
      const next = current ? `${current} ${clean}` : clean;
      onChange(next);
      onSend(next, { source: 'voice' });
    },
  }), [onBeforeVoiceStart, onChange, onSend]);
  useStableVoiceInputHandlers(voiceInput.registerHandlers, voiceHandlers);

  const { status } = voiceInput;

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

  function handleInputKeyDown(event) {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!value.trim() || disabled) return;
    onSend(value.trim());
  }

  function handleVoiceClick() {
    if (disabled && !isCapturing) return;
    // BLOCO UNI 2: enquanto a Uni está falando, o botão INTERROMPE a fala
    // em vez de iniciar uma gravação -- nunca grava por cima da resposta
    // falada (mesma regra da Home). O usuário toca de novo, já sem fala em
    // andamento, para efetivamente começar a falar.
    if (isSpeaking) {
      onInterruptSpeech?.();
      return;
    }
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
    : isCapturing ? 'Cancelar áudio' : 'Falar';
  // Redesign (épico #91): vazio, o campo só tem o microfone, como no design.
  // Com texto, o enviar entra ao lado; o microfone fica para ditar mais e
  // para interromper a fala da Uni.
  const showSendButton = Boolean(value.trim()) && !isCapturing;

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
        <textarea
          ref={inputRef}
          className={styles.input}
          inputMode="text"
          rows={1}
          placeholder="Escreva ou fale com a Uni"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-label="Escreva ou fale com a Uni"
        />

        <button
          type="button"
          className={`${styles.voiceBtn} ${isCapturing ? styles.voiceBtnActive : ''}`}
          data-secondary={showSendButton ? 'true' : undefined}
          aria-label={voiceLabel}
          aria-pressed={isCapturing}
          title={voiceLabel}
          onClick={handleVoiceClick}
        >
          <PhMicrophoneIcon />
        </button>
        {showSendButton ? (
          <button
            type="submit"
            className={styles.sendBtn}
            disabled={disabled}
            aria-label="Enviar mensagem"
          >
            <PhPaperPlaneRightIcon />
          </button>
        ) : null}
      </div>
    </form>
  );
}
