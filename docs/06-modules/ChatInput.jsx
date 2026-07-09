import { useRef, useState } from 'react';
import { cx } from '../../lib/cx';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useVoiceInput } from './useVoiceInput';

/**
 * ChatInput — docx Módulo 10 (Uni): "Conversar. Enviar áudio. Enviar
 * documento." Sem CSS próprio — Input (multiline) + Button já resolvem
 * tudo, o único elemento novo é o `<input type="file">` oculto (padrão
 * nativo para upload, sem estilo visível próprio).
 *
 * @param {(text: string) => void} props.onSend
 * @param {(file: File) => void} [props.onUpload]
 * @param {boolean} [props.disabled]
 */
export default function ChatInput({ onSend, onUpload, disabled }) {
  const [value, setValue] = useState('');
  const fileInputRef = useRef(null);
  const { isSupported: voiceSupported, listening, start, stop } = useVoiceInput((transcript) => {
    setValue((prev) => (prev ? `${prev} ${transcript}` : transcript));
  });

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  }

  function handleKeyDown(event) {
    // Enter envia, Shift+Enter quebra linha — padrão universal de chat.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (file) onUpload?.(file);
    event.target.value = '';
  }

  return (
    <form onSubmit={handleSubmit} className={cx('uf-flex', 'uf-gap-sm', 'uf-items-end')}>
      <input
        ref={fileInputRef}
        type="file"
        className="uf-sr-only"
        onChange={handleFileChange}
        tabIndex={-1}
        aria-hidden="true"
      />

      <Button
        type="button"
        variant="ghost"
        size="lg"
        aria-label="Anexar documento"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
      >
        <AttachGlyph />
      </Button>

      <Input
        multiline
        rows={1}
        placeholder="Escreva para a Uni..."
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        fullWidth
      />

      {voiceSupported ? (
        <Button
          type="button"
          variant={listening ? 'danger' : 'ghost'}
          size="lg"
          aria-label={listening ? 'Parar gravação' : 'Enviar mensagem por voz'}
          onClick={listening ? stop : start}
          disabled={disabled}
        >
          <MicGlyph />
        </Button>
      ) : null}

      <Button type="submit" variant="primary" size="lg" disabled={disabled || !value.trim()}>
        Enviar
      </Button>
    </form>
  );
}

function AttachGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5V7a4 4 0 00-4-4H7a4 4 0 00-4 4v10a4 4 0 004 4h6.5" />
      <path d="M15 15l4.5 4.5M19.5 15L15 19.5" />
    </svg>
  );
}

function MicGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v4" />
    </svg>
  );
}
