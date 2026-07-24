import { NavLink } from 'react-router-dom';
import { useAccess } from '../../../app/AccessContext';
import { filterNavigationItems, navigationItems, SIDEBAR_GROUPS } from '../../../app/navigation';
import Badge from '../../ui/Badge';
import styles from './Sidebar.module.css';

// UX6: sidebar antes era uma lista plana de 12 itens sem hierarquia. Agora
// agrupada por SIDEBAR_GROUPS (fonte única em navigation.js) -- a Sidebar
// só itera e filtra, nunca decide sozinha quem pertence a cada grupo nem
// quais módulos são permitidos (isso continua vindo de moduleAccess.js via
// filterNavigationItems). Grupos sem nenhum item visível no contexto atual
// (ex.: Gestão em PF) simplesmente não renderizam.
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

      <nav className={styles.nav} aria-label="Módulos">
        {SIDEBAR_GROUPS.map((group) => {
          const groupItems = visibleNavigationItems.filter((item) => item.group === group.id);
          if (!groupItems.length) return null;

          return (
            <div className={styles.group} key={group.id}>
              <h2 className={styles.groupTitle}>{group.label}</h2>
              {groupItems.map((item) => (
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
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

export default Sidebar;
