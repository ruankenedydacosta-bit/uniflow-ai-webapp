import { NavLink } from 'react-router-dom';
import { useAccess } from '../../../app/AccessContext';
import { filterNavigationItems, navigationItems } from '../../../app/navigation';
import Badge from '../../ui/Badge';
import styles from './Sidebar.module.css';

function Sidebar() {
  const { access } = useAccess();
  const visibleNavigationItems = filterNavigationItems(navigationItems, access);

  return (
    <aside className={styles.sidebar} aria-label="Navegação principal">
      <div className={styles.brand}>
        <div className={styles.logo} aria-hidden="true">
          UF
        </div>
        <div className={styles.brandText}>
          <span className={styles.name}>UniFlow AI</span>
          <span className={styles.subtitle}>Clareza financeira</span>
        </div>
      </div>

      <nav className={styles.nav}>
        {visibleNavigationItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => (isActive ? `${styles.item} ${styles.active}` : styles.item)}
          >
            {({ isActive }) => (
              <>
                <span>{item.label}</span>
                {isActive ? (
                  <Badge variant="primary" size="sm">
                    Ativo
                  </Badge>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
