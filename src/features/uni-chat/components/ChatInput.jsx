import { useRef, useState } from 'react';
import styles from './ChatInput.module.css';

export default function ChatInput({ value, onChange, onSend, disabled }) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  function handleSubmit(e) {
    e.preventDefault();
    if (!value.trim() || disabled) return;
    onSend(value.trim());
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={`${styles.field} ${focused ? styles.fieldFocused : ''}`}>
        <button
          type="button"
          className={styles.voiceBtn}
          aria-label="Entrada por voz (em breve)"
          title="Em breve"
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
