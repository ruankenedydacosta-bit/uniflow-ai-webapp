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
  notificationCount = 0,
  onAvatarPress,
  onBellPress,
  onContextChange,
  title,
  subtitle,
}) {
  // UX5: mostra o rotulo completo do espaço ("Espaço Pessoal"/"Espaço
  // Empresa", vindo de workspaceSelection.js) em vez de truncar para
  // "Pessoal"/"Empresa" sozinho -- PF/PJ já aparece como rótulo secundário
  // no ContextSegmentedControl ao lado, então aqui o texto precisa deixar
  // claro por si só que é um ESPAÇO, não apenas um nome solto.
  const isBusiness = /empresa|business/i.test(subtitle ?? '');
  const displayName = subtitle || title || 'UniFlow';

  return (
    <MobileContextHeader
      user={{ displayName, initials: getInitials(displayName) }}
      activeContext={activeContext ?? (isBusiness ? 'PJ' : 'PF')}
      availableContexts={['PF', 'PJ']}
      contextError={contextError}
      contextLocked={contextLocked}
      contextMessage={contextMessage}
      isContextLoading={isContextLoading}
      notificationState={notificationCount > 0 ? 'unread' : 'none'}
      notificationCount={notificationCount}
      onAvatarPress={onAvatarPress}
      onBellPress={onBellPress}
      onContextChange={onContextChange}
    />
  );
}

export default MobileHeader;
