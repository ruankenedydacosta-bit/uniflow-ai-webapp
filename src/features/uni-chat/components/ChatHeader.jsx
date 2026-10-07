import { UNI_RING_ORB_STATES, UniRingOrb } from '../../../components/ui/UniRingOrb/index.js';
import { PhClockCounterClockwiseIcon, PhPlusIcon } from '../../simplified-app/SimplifiedIcons.jsx';
import styles from './ChatHeader.module.css';

// Cabeçalho da conversa (tela 02 do redesign, épico #91): orb de 28px, nome
// e espaço ativo. O seletor Pessoal/Empresa só existe no chat completo.
export default function ChatHeader({
  mode,
  onModeChange,
  onHistory,
  onNewChat,
  isThinking,
  showModeSelector = true,
}) {
  return (
    <header className={styles.header}>
      <div className={styles.identity}>
        <UniRingOrb
          size={28}
          state={isThinking ? UNI_RING_ORB_STATES.THINKING : UNI_RING_ORB_STATES.IDLE}
        />
        <div className={styles.text}>
          <h1 className={styles.name}>Uni</h1>
          <span className={styles.status}>
            {mode === 'empresa' ? 'Espaço Empresa' : 'Espaço Pessoal'}
          </span>
        </div>
      </div>

      <div className={styles.actions}>
        {showModeSelector ? (
          <div className={styles.toggle} role="tablist" aria-label="Selecionar perfil">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'pessoal'}
            className={`${styles.toggleBtn} ${mode === 'pessoal' ? styles.toggleActive : ''}`}
            onClick={() => onModeChange('pessoal')}
          >
            Pessoal
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'empresa'}
            className={`${styles.toggleBtn} ${mode === 'empresa' ? styles.toggleActive : ''}`}
            onClick={() => onModeChange('empresa')}
          >
            Empresa
          </button>
          <span
            className={styles.toggleThumb}
            style={{ transform: mode === 'empresa' ? 'translateX(100%)' : 'translateX(0)' }}
            aria-hidden="true"
          />
          </div>
        ) : null}

        <button type="button" className={styles.iconBtn} onClick={onHistory} aria-label="Ver histórico">
          <PhClockCounterClockwiseIcon />
        </button>
        <button type="button" className={styles.iconBtn} onClick={onNewChat} aria-label="Nova conversa">
          <PhPlusIcon />
        </button>
      </div>
    </header>
  );
}
