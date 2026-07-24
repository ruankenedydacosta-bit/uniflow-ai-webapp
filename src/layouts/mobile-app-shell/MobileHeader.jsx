import MobileContextHeader from './MobileContextHeader.jsx';

function getInitials(value) {
  return String(value || 'UniFlow')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

function MobileHeader({
  activeContext,
  contextError = false,
  contextLocked = false,
  contextMessage,
  isContextLoading = false,
  onAvatarPress,
  onContextChange,
  title,
  subtitle,
}) {
  const rawDisplayName = subtitle || title || 'UniFlow';
  const isBusiness = /empresa|empresarial|business/i.test(rawDisplayName);
  const isGenericPersonal = /espaço pessoal|personal/i.test(rawDisplayName);
  const displayName = isBusiness ? 'Empresa' : isGenericPersonal ? 'Pessoal' : rawDisplayName;

  return (
    <MobileContextHeader
      user={{ displayName, initials: getInitials(displayName) }}
      activeContext={activeContext ?? (isBusiness ? 'PJ' : 'PF')}
      availableContexts={['PF', 'PJ']}
      contextError={contextError}
      contextLocked={contextLocked}
      contextMessage={contextMessage}
      isContextLoading={isContextLoading}
      notificationState="permission-pending"
      onAvatarPress={onAvatarPress}
      onContextChange={onContextChange}
    />
  );
}

export default MobileHeader;
