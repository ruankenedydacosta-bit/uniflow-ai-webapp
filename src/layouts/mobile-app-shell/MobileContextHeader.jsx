import ContextSegmentedControl from './ContextSegmentedControl.jsx';
import HeaderAvatar from './HeaderAvatar.jsx';
import HeaderIdentityBlock from './HeaderIdentityBlock.jsx';
import HeaderSkeleton from './HeaderSkeleton.jsx';
import NotificationBell from './NotificationBell.jsx';
import { getContextGreeting } from './mobileContextHeaderSchema.js';
import styles from './MobileContextHeader.module.css';

function MobileContextHeader({
  user = {},
  activeContext = 'PF',
  availableContexts = ['PF', 'PJ'],
  notificationState = 'none',
  notificationCount = 0,
  isLoading = false,
  contextLocked = false,
  contextError = false,
  onContextChange,
  onAvatarPress,
  onBellPress,
}) {
  if (isLoading) return <HeaderSkeleton variant="full" />;

  const displayName = user.displayName || 'Bem-vindo novamente';
  const workspaceType = activeContext === 'PJ' ? 'business' : 'personal';

  return (
    <header className={styles.contextHeader} data-mobile-context-header data-mobile-shell-header>
      <div className={styles.identityZone}>
        <HeaderAvatar
          photoUrl={user.photoUrl}
          initials={user.initials}
          isOnline={user.isOnline}
          workspaceType={workspaceType}
          onPress={onAvatarPress}
        />
        <HeaderIdentityBlock
          greeting={user.greeting || getContextGreeting()}
          displayName={displayName}
        />
      </div>

      <div className={styles.actionZone}>
        <ContextSegmentedControl
          activeContext={activeContext}
          availableContexts={availableContexts}
          isLocked={contextLocked}
          isLoading={false}
          hasError={contextError}
          onChange={onContextChange}
        />
        <NotificationBell
          state={notificationState}
          count={notificationCount}
          onPress={onBellPress}
        />
      </div>
    </header>
  );
}

export default MobileContextHeader;
