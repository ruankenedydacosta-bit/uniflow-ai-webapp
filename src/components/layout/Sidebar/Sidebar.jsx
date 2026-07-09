import Badge from '../../ui/Badge';
import styles from './Sidebar.module.css';

const navItems = [
  'Dashboard',
  'Uni AI',
  'Financeiro',
  'CRM',
  'Projetos',
  'Agenda',
  'Relatórios',
  'Configurações',
];

function Sidebar({ activeItem = 'Dashboard' }) {
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
        {navItems.map((item) => {
          const isActive = item === activeItem;

          return (
            <a
              key={item}
              href="#"
              className={isActive ? `${styles.item} ${styles.active}` : styles.item}
              aria-current={isActive ? 'page' : undefined}
            >
              <span>{item}</span>
              {isActive ? (
                <Badge variant="primary" size="sm">
                  Ativo
                </Badge>
              ) : null}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}

export default Sidebar;
