import { useEffect, useState } from 'react';
import { useUniVoiceTts, VOICE_TTS_STATUS, MAX_TTS_TEXT_LENGTH } from '../../../../features/uni-voice-tts';
import styles from './TtsPlayground.module.css';

const STATUS_LABELS = Object.freeze({
  [VOICE_TTS_STATUS.UNAVAILABLE]: 'Indisponível',
  [VOICE_TTS_STATUS.IDLE]: 'Pronto',
  [VOICE_TTS_STATUS.LOADING]: 'Gerando voz…',
  [VOICE_TTS_STATUS.PLAYING]: 'Reproduzindo',
  [VOICE_TTS_STATUS.PAUSED]: 'Pausado',
  [VOICE_TTS_STATUS.STOPPED]: 'Parado',
  [VOICE_TTS_STATUS.ERROR]: 'Erro',
});

/**
 * ELEVEN1: area de teste da fundacao de Text-to-Speech (ElevenLabs), isolada
 * nesta pagina DEV -- nao integrada ao chat principal ainda. Usa apenas
 * useUniVoiceTts(); nenhum fetch nem chave aqui.
 */
export default function TtsPlayground() {
  const voice = useUniVoiceTts();
  const [text, setText] = useState('');
  const [clientHealth, setClientHealth] = useState(null);

  useEffect(() => {
    let active = true;
    voice.healthCheck().then((result) => {
      if (active) setClientHealth(result);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOverLimit = text.length > MAX_TTS_TEXT_LENGTH;
  const isLoading = voice.status === VOICE_TTS_STATUS.LOADING;
  const isPlaying = voice.status === VOICE_TTS_STATUS.PLAYING;
  const isPaused = voice.status === VOICE_TTS_STATUS.PAUSED;
  const canGenerate = Boolean(text.trim()) && !isOverLimit && !isLoading;

  async function handleGenerate() {
    if (!canGenerate) return;
    await voice.speak(text);
  }

  const notConfigured = clientHealth?.available === false
    || voice.error?.code === 'NOT_CONFIGURED'
    || voice.error?.code === 'UNAVAILABLE';

  return (
    <section className={styles.playground} aria-labelledby="tts-playground-title">
      <div className={styles.header}>
        <p className={styles.eyebrow}>Fundação de voz premium</p>
        <h2 id="tts-playground-title">Gerar voz (Text-to-Speech)</h2>
        <p className={styles.hint}>
          Área de teste da infraestrutura -- ainda não conectada ao chat principal da Uni.
        </p>
      </div>

      {notConfigured && (
        <p className={styles.notConfigured} role="status">
          A geração de voz ainda não está configurada neste ambiente.
        </p>
      )}

      <label className={styles.field} htmlFor="tts-text">
        <span>Texto para gerar voz</span>
        <textarea
          id="tts-text"
          rows="4"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Digite um texto em português para testar a voz…"
          aria-describedby="tts-char-count"
        />
      </label>
      <p id="tts-char-count" className={`${styles.charCount} ${isOverLimit ? styles.charCountOver : ''}`}>
        {text.length} / {MAX_TTS_TEXT_LENGTH} caracteres
      </p>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={handleGenerate}
          disabled={!canGenerate}
          aria-label="Gerar voz a partir do texto"
        >
          {isLoading ? 'Gerando…' : 'Gerar voz'}
        </button>

        {isLoading && (
          <button
            type="button"
            aria-label="Cancelar geração de voz"
            onClick={() => voice.cancel()}
          >
            Cancelar geração
          </button>
        )}

        <button
          type="button"
          aria-label="Reproduzir"
          onClick={() => voice.play()}
          disabled={isPlaying || isLoading}
        >
          Play
        </button>
        <button
          type="button"
          aria-label="Pausar"
          onClick={() => voice.pause()}
          disabled={!isPlaying}
        >
          Pausar
        </button>
        <button
          type="button"
          aria-label="Retomar"
          onClick={() => voice.resume()}
          disabled={!isPaused}
        >
          Retomar
        </button>
        <button
          type="button"
          aria-label="Parar"
          onClick={() => voice.stop()}
          disabled={voice.status === VOICE_TTS_STATUS.STOPPED || voice.status === VOICE_TTS_STATUS.IDLE}
        >
          Parar
        </button>
      </div>

      <p className={styles.status} role="status" aria-live="polite">
        Estado: <strong>{STATUS_LABELS[voice.status] ?? voice.status}</strong>
      </p>

      {voice.error && (
        <p className={styles.error} role="alert">
          {voice.error.message}
        </p>
      )}
    </section>
  );
}
