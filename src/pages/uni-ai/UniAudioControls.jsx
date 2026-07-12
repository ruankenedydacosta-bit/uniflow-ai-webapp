import Button from '../../components/ui/Button';
import { VOICE_OUTPUT_MODES } from '../../features/uni-voice-output';
import styles from '../UniAIPage.module.css';

function UniAudioControls({
  hasResponse,
  mode,
  isSpeaking,
  isBusy,
  premiumSupported,
  onModeChange,
  onSpeakBrowser,
  onSpeakPremium,
  onStop,
}) {
  return (
    <div className={styles.audioControls} aria-label="Controles de áudio da Uni">
      <span>Voz da Uni:</span>
      <Button
        variant={mode === VOICE_OUTPUT_MODES.OFF ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={mode === VOICE_OUTPUT_MODES.OFF}
        onClick={() => onModeChange(VOICE_OUTPUT_MODES.OFF)}
      >
        Desligada
      </Button>
      <Button
        variant={mode === VOICE_OUTPUT_MODES.BROWSER ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={mode === VOICE_OUTPUT_MODES.BROWSER}
        onClick={() => onModeChange(VOICE_OUTPUT_MODES.BROWSER)}
      >
        Padrão
      </Button>
      <Button
        variant={mode === VOICE_OUTPUT_MODES.PREMIUM ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={mode === VOICE_OUTPUT_MODES.PREMIUM}
        disabled={!premiumSupported}
        onClick={() => onModeChange(VOICE_OUTPUT_MODES.PREMIUM)}
      >
        Premium — demonstração
      </Button>

      {hasResponse && !isSpeaking && !isBusy ? (
        <>
          <Button variant="outline" size="sm" onClick={onSpeakBrowser}>
            Ouvir padrão
          </Button>
          <Button variant="outline" size="sm" disabled={!premiumSupported} onClick={onSpeakPremium}>
            Ouvir premium
          </Button>
        </>
      ) : null}

      {isSpeaking || isBusy ? (
        <Button variant="outline" size="sm" onClick={onStop}>
          Parar
        </Button>
      ) : null}
    </div>
  );
}

export default UniAudioControls;
