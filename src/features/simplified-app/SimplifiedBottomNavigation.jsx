import { NavLink, useNavigate } from 'react-router-dom';
import { UniRingOrb } from '../../components/ui/UniRingOrb/index.js';
import {
  PhCalendarBlankFillIcon,
  PhCalendarBlankIcon,
  PhDotsThreeFillIcon,
  PhDotsThreeIcon,
  PhHouseFillIcon,
  PhHouseIcon,
  PhWalletFillIcon,
  PhWalletIcon,
} from './SimplifiedIcons.jsx';
import {
  buildVoiceModeUrl,
  SIMPLIFIED_NAVIGATION,
  SIMPLIFIED_ROUTE_IDS,
} from './simplifiedRoutes.js';
import styles from './simplifiedApp.module.css';

// A aba ativa troca para a variante preenchida do mesmo ícone.
const ICONS = Object.freeze({
  [SIMPLIFIED_ROUTE_IDS.HOME]: [PhHouseIcon, PhHouseFillIcon],
  [SIMPLIFIED_ROUTE_IDS.RECORDS]: [PhWalletIcon, PhWalletFillIcon],
  [SIMPLIFIED_ROUTE_IDS.AGENDA]: [PhCalendarBlankIcon, PhCalendarBlankFillIcon],
  [SIMPLIFIED_ROUTE_IDS.ACCOUNT]: [PhDotsThreeIcon, PhDotsThreeFillIcon],
});

function SimplifiedBottomNavigation({ hidden = false, onNavigate }) {
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
                <UniRingOrb size={64} />
                <span aria-hidden="true">{item.label}</span>
              </button>
            );
          }

          const [Icon, ActiveIcon] = ICONS[item.id];
          return (
            <NavLink
              key={item.id}
              to={item.path}
              onClick={(evento) => onNavigate?.(evento, item)}
              className={({ isActive }) => (
                `${styles.navigationItem} ${isActive ? styles.navigationItemActive : ''}`
              )}
            >
              {({ isActive }) => (
                <>
                  <span className={styles.navigationIcon} data-movimento-icone>
                    {isActive ? <ActiveIcon /> : <Icon />}
                  </span>
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export default SimplifiedBottomNavigation;
