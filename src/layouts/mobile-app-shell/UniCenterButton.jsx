import { NavLink } from 'react-router-dom';
import styles from './MobileAppShell.module.css';

function UniCenterButton({ label = 'Uni', path = '/uni-ai', onNavigate }) {
  return (
    <NavLink
      to={path}
      aria-label="Conversar com a Uni"
      className={({ isActive }) => `${styles.uniLink} ${isActive ? styles.uniActive : ''}`}
      onClick={() => onNavigate?.({ label, path })}
    >
      <span className={styles.uniButton} aria-hidden="true">Uni</span>
      <span className={styles.navigationLabel}>{label}</span>
    </NavLink>
  );
}

export default UniCenterButton;
