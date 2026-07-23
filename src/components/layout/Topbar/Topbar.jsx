import Avatar from '../../ui/Avatar';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';
import AccessModeSwitcher from '../../dev/AccessModeSwitcher';
import styles from './Topbar.module.css';

function Topbar({
  title,
  profileName = 'UniFlow',
  onSignOut = () => {},
  isSigningOut = false,
  signOutError = null,
}) {
  return (
    <header className={styles.topbar}>
      <div className={styles.heading}>
        <Badge variant="secondary" dot>
          Uni ativa
        </Badge>
        <h1 className={styles.title}>{title}</h1>
      </div>

      <div className={styles.actions}>
        {signOutError ? (
          <span role="alert" className="uf-text-caption">
            {signOutError.message ?? 'Não foi possível sair da conta. Tente novamente.'}
          </span>
        ) : null}
        <AccessModeSwitcher />
        <Avatar name={profileName} size="sm" status="online" />
        <Button
          variant="ghost"
          size="sm"
          loading={isSigningOut}
          onClick={onSignOut}
          aria-label="Sair da conta"
        >
          Sair
        </Button>
      </div>
    </header>
  );
}

export default Topbar;
