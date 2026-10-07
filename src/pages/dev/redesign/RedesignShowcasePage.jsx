import { useEffect } from 'react';
import { UniRingOrb } from '../../../components/ui/UniRingOrb/index.js';
import { UNI_RING_ORB_STATES } from '../../../components/ui/UniRingOrb/uniRingOrbModel.js';
import SimplifiedBottomNavigation from '../../../features/simplified-app/SimplifiedBottomNavigation.jsx';
import SimplifiedHeader from '../../../features/simplified-app/SimplifiedHeader.jsx';
import appStyles from '../../../features/simplified-app/simplifiedApp.module.css';
import { THEME_OPTIONS, useTheme } from '../../../features/theme/index.js';
import styles from './RedesignShowcasePage.module.css';

const ORB_MODES = [
  [UNI_RING_ORB_STATES.IDLE, 'Parada'],
  [UNI_RING_ORB_STATES.LISTENING, 'Ouvindo'],
  [UNI_RING_ORB_STATES.THINKING, 'Pensando'],
  [UNI_RING_ORB_STATES.SPEAKING, 'Falando'],
];

// Vitrine só de desenvolvimento (épico #91): mostra a base do redesign com
// as mesmas classes do shell do app, para comparar com o handoff em 390px
// sem precisar de sessão.
function RedesignShowcasePage() {
  const { selectedTheme, setTheme } = useTheme();

  useEffect(() => {
    document.body.setAttribute('data-simplified-app-mounted', 'true');
    return () => document.body.removeAttribute('data-simplified-app-mounted');
  }, []);

  return (
    <div className={appStyles.shell} data-simplified-app-shell>
      <div className={appStyles.shellSurface}>
        <div className={appStyles.shellTopRegion}>
          <SimplifiedHeader unreadCount={3} profileName="Jonatas Oliveira" />
        </div>

        <main className={`${appStyles.mainContent} ${styles.content}`}>
          <section className={styles.section}>
            <h2 className={styles.label}>Tema</h2>
            <div className={styles.row}>
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={styles.chip}
                  aria-pressed={selectedTheme === option.id}
                  onClick={() => setTheme(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.label}>Uni Orb</h2>
            <div className={styles.orbGrid}>
              {ORB_MODES.map(([state, label]) => (
                <figure key={state} className={styles.orbItem}>
                  <UniRingOrb size={64} state={state} />
                  <figcaption>{label}</figcaption>
                </figure>
              ))}
            </div>
            <div className={styles.row}>
              {[18, 22, 28, 120].map((size) => <UniRingOrb key={size} size={size} />)}
            </div>
          </section>
        </main>

        <SimplifiedBottomNavigation />
      </div>
    </div>
  );
}

export default RedesignShowcasePage;
