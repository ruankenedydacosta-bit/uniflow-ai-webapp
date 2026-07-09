import Avatar from '../../ui/Avatar';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import styles from './Topbar.module.css';

function Topbar({ title }) {
  return (
    <header className={styles.topbar}>
      <div className={styles.heading}>
        <Badge variant="secondary" dot>
          Uni ativa
        </Badge>
        <h1 className={styles.title}>{title}</h1>
      </div>

      <div className={styles.actions}>
        <Button variant="outline" size="sm">
          Nova ação
        </Button>
        <Avatar name="UniFlow AI" size="sm" status="online" />
      </div>
    </header>
  );
}

export default Topbar;
