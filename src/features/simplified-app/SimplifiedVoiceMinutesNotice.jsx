import OutlineButton from '../../components/ui/OutlineButton/index.js';
import { PhMicrophoneIcon, PhXIcon } from './SimplifiedIcons.jsx';
import styles from './simplifiedVoiceMinutesNotice.module.css';

// Tela 19: aviso da Home com 5 minutos de voz ou menos, abaixo do card da Uni.
// "Entendi" e o X dispensam o aviso até o saldo zerar ou o ciclo renovar.
function SimplifiedVoiceMinutesNotice({ notice, onOpenPlan, onDismiss }) {
  return (
    <section className={styles.notice} aria-labelledby="voice-minutes-notice-title">
      <div className={styles.body}>
        <span className={styles.icon} aria-hidden="true"><PhMicrophoneIcon /></span>
        <div className={styles.text}>
          <h2 id="voice-minutes-notice-title" className={styles.title}>{notice.title}</h2>
          <p className={styles.description}>{notice.body}</p>
        </div>
        <button type="button" className={styles.dismissButton} onClick={onDismiss} aria-label="Dispensar aviso">
          <PhXIcon />
        </button>
      </div>
      <div className={styles.actions}>
        <OutlineButton variant="secondary" onClick={onOpenPlan}>Ver plano</OutlineButton>
        <OutlineButton variant="ghost" onClick={onDismiss}>Entendi</OutlineButton>
      </div>
    </section>
  );
}

export default SimplifiedVoiceMinutesNotice;
