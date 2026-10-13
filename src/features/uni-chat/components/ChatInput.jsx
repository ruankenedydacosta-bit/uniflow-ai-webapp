import { useLayoutEffect, useRef, useState } from 'react';
import { PhPaperPlaneRightIcon } from '../../simplified-app/SimplifiedIcons.jsx';
import styles from './ChatInput.module.css';

// O chat é só texto. Para falar com a Uni, a pessoa abre a conversa por voz
// em tempo real (orb da barra inferior).
export default function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
}) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }, [value]);

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

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={`${styles.field} ${focused ? styles.fieldFocused : ''}`}>
        <textarea
          ref={inputRef}
          className={styles.input}
          inputMode="text"
          rows={1}
          placeholder="Escreva para a Uni"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-label="Escreva para a Uni"
        />

        <button
          type="submit"
          className={styles.sendBtn}
          disabled={disabled || !value.trim()}
          aria-label="Enviar mensagem"
        >
          <PhPaperPlaneRightIcon />
        </button>
      </div>
    </form>
  );
}
