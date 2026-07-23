import { NavLink } from 'react-router-dom';
import { useAccess } from '../../app/AccessContext.jsx';
import { BOTTOM_NAVIGATION_ROUTES, SHELL_ROUTE_IDS, filterShellRoutesByContext } from './shellRoutes.js';
import UniCenterButton from './UniCenterButton.jsx';
import styles from './MobileAppShell.module.css';

function BottomNavigation({ items = BOTTOM_NAVIGATION_ROUTES, onNavigate, onOpenMore }) {
  const { currentWorkspace } = useAccess();
  // Mesma fonte declarativa da Sidebar desktop (moduleAccess.js via shellRoutes.js).
  // Reavalia na troca de contexto sem reload; itens incompatíveis saem do DOM/foco.
  const visibleItems = filterShellRoutesByContext(items, currentWorkspace);

  return (
    <nav className={styles.bottomNavigation} aria-label="Navegação principal mobile">
      <div className={styles.bottomNavigationInner}>
        {visibleItems.map((item) => {
          if (item.center) {
            return <UniCenterButton key={item.id} label={item.label} path={item.path} onNavigate={onNavigate} />;
          }

          if (item.id === SHELL_ROUTE_IDS.MORE) {
            return (
              <button
                key={item.id}
                type="button"
                className={styles.navigationItem}
                aria-haspopup="dialog"
                onClick={onOpenMore}
              >
                <span className={styles.navigationMark} aria-hidden="true">•••</span>
                <span className={styles.navigationLabel}>{item.label}</span>
              </button>
            );
          }

          return (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) => `${styles.navigationItem} ${isActive ? styles.navigationActive : ''}`}
              onClick={() => onNavigate?.(item)}
            >
              <span className={styles.navigationMark} aria-hidden="true">{item.label.slice(0, 1)}</span>
              <span className={styles.navigationLabel}>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export default BottomNavigation;
