import { useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UniInstantButton } from '../../features/uni-instant/index.js';

function UniCenterButtonSession({
  pathname,
  label,
  path,
  onNavigate,
}) {
  const navigate = useNavigate();
  const buttonRef = useRef(null);

  // O toque só navega: o áudio gravado de boas-vindas ("returning_user")
  // saiu com a voz fora da conversa em tempo real.
  const handleTap = useCallback(() => {
    onNavigate?.({ label, path });
    navigate(path);
  }, [label, navigate, onNavigate, path]);

  return (
    <UniInstantButton
      aria-label="Conversar com a Uni"
      label={label}
      active={pathname === path}
      buttonRef={buttonRef}
      onTap={handleTap}
    />
  );
}

function UniCenterButton({
  label = 'Uni',
  path = '/uni-ai',
  onNavigate,
}) {
  const { pathname } = useLocation();

  return (
    <UniCenterButtonSession
      pathname={pathname}
      label={label}
      path={path}
      onNavigate={onNavigate}
    />
  );
}

export default UniCenterButton;
