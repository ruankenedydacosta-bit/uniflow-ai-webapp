import MobileContextHeader from './MobileContextHeader.jsx';

const NOOP = () => {};

function getInitials(value) {
  return String(value || 'UniFlow')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

function MobileHeader({ title, subtitle }) {
  const rawDisplayName = subtitle || title || 'UniFlow';
  const isBusiness = /empresa|empresarial|business/i.test(rawDisplayName);
  const isGenericPersonal = /espaço pessoal|personal/i.test(rawDisplayName);
  const displayName = isBusiness ? 'Empresa' : isGenericPersonal ? 'Pessoal' : rawDisplayName;

  return (
    <MobileContextHeader
      user={{ displayName, initials: getInitials(displayName) }}
      activeContext={isBusiness ? 'PJ' : 'PF'}
      availableContexts={['PF', 'PJ']}
      notificationState="permission-pending"
      onContextChange={NOOP}
      onAvatarPress={NOOP}
      onBellPress={NOOP}
    />
  );
}

export default MobileHeader;
