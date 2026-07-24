import Badge from '../../ui/Badge';
import AccessModeSwitcher from '../../dev/AccessModeSwitcher';
import AccountMenu from './AccountMenu.jsx';
import styles from './Topbar.module.css';

function Topbar({
  title,
  profileName = 'UniFlow',
  profileEmail = '',
  activeContext,
  onToggleWorkspace = () => {},
  isSwitchingWorkspace = false,
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
        <AccountMenu
          profileName={profileName}
          profileEmail={profileEmail}
          activeContext={activeContext}
          onToggleWorkspace={onToggleWorkspace}
          isSwitchingWorkspace={isSwitchingWorkspace}
          onSignOut={onSignOut}
          isSigningOut={isSigningOut}
        />
      </div>
    </header>
  );
}

export default Topbar;
