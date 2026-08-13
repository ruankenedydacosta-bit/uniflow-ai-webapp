import { NavLink } from 'react-router-dom';
import { AccountIcon, CalendarIcon, HelpIcon, HomeIcon, RecordsIcon } from './SimplifiedIcons.jsx';
import {
  SIMPLIFIED_NAVIGATION,
  SIMPLIFIED_ROUTE_IDS,
} from './simplifiedRoutes.js';
import styles from './simplifiedApp.module.css';

const ICONS = Object.freeze({
  [SIMPLIFIED_ROUTE_IDS.HOME]: HomeIcon,
  [SIMPLIFIED_ROUTE_IDS.RECORDS]: RecordsIcon,
  [SIMPLIFIED_ROUTE_IDS.AGENDA]: CalendarIcon,
  [SIMPLIFIED_ROUTE_IDS.SUPPORT]: HelpIcon,
  [SIMPLIFIED_ROUTE_IDS.ACCOUNT]: AccountIcon,
});

function SimplifiedBottomNavigation({ hidden = false }) {
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
