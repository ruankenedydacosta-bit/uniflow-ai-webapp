import { NavLink, useNavigate } from 'react-router-dom';
import { UniRingOrb } from '../../components/ui/UniRingOrb/index.js';
import { CalendarIcon, DotsIcon, SunHorizonIcon, WalletIcon } from './SimplifiedIcons.jsx';
import {
  buildVoiceModeUrl,
  SIMPLIFIED_NAVIGATION,
  SIMPLIFIED_ROUTE_IDS,
} from './simplifiedRoutes.js';
import styles from './simplifiedApp.module.css';

const ICONS = Object.freeze({
  [SIMPLIFIED_ROUTE_IDS.HOME]: SunHorizonIcon,
  [SIMPLIFIED_ROUTE_IDS.RECORDS]: WalletIcon,
  [SIMPLIFIED_ROUTE_IDS.AGENDA]: CalendarIcon,
  [SIMPLIFIED_ROUTE_IDS.ACCOUNT]: DotsIcon,
});

function SimplifiedBottomNavigation({ hidden = false }) {
  const navigate = useNavigate();

  return (
    <nav
      className={`${styles.bottomNavigation} ${hidden ? styles.bottomNavigationHidden : ''}`}
      aria-label="Navegação principal"
      aria-hidden={hidden}
      inert={hidden}
    >
      <div
        className={styles.bottomNavigationInner}
        style={{ '--simplified-navigation-count': SIMPLIFIED_NAVIGATION.length }}
      >
        {SIMPLIFIED_NAVIGATION.map((item) => {
          // O orb central abre a tela de voz na Home, de qualquer aba. A Home
          // lê o parâmetro, abre a tela e começa a ouvir.
          if (item.id === SIMPLIFIED_ROUTE_IDS.VOICE) {
            return (
              <button
                key={item.id}
                type="button"
                className={styles.navigationVoice}
                onClick={() => navigate(buildVoiceModeUrl())}
                aria-label="Falar com a Uni"
                data-uni-voice-control
              >
                <UniRingOrb size={60} />
                <span aria-hidden="true">{item.label}</span>
              </button>
            );
          }

          const Icon = ICONS[item.id];
          return (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) => (
                `${styles.navigationItem} ${isActive ? styles.navigationItemActive : ''}`
              )}
            >
              <span className={styles.navigationIcon}><Icon /></span>
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export default SimplifiedBottomNavigation;
