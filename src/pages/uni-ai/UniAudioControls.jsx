import Button from '../../components/ui/Button';
import { audioControlLabels } from './uniAI.experience';
import styles from '../UniAIPage.module.css';

function UniAudioControls({
  hasResponse,
  isSpeaking,
  isPaused,
  isMuted,
  onPause,
  onResume,
  onReplay,
  onToggleMute,
}) {
  if (!hasResponse) return null;

  return (
    <div className={styles.audioControls} aria-label="Controles de áudio da Uni">
      {isSpeaking && !isPaused ? (
        <Button variant="outline" size="sm" onClick={onPause}>
          {audioControlLabels.pause}
        </Button>
      ) : null}

      {isPaused ? (
        <Button variant="outline" size="sm" onClick={onResume}>
          {audioControlLabels.resume}
        </Button>
      ) : null}

      {!isSpeaking && !isPaused ? (
        <Button variant="secondary" size="sm" onClick={onReplay}>
          {audioControlLabels.replay}
        </Button>
      ) : null}

      <Button variant="ghost" size="sm" onClick={onToggleMute}>
        {isMuted ? audioControlLabels.unmute : audioControlLabels.mute}
      </Button>
    </div>
  );
}

export default UniAudioControls;
