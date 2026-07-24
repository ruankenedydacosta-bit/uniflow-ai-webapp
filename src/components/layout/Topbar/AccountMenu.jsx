import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getWorkspaceContextLabel, getWorkspaceTypeFromContext } from '../../../app/workspaceSelection.js';
import { WORKSPACE_TYPES } from '../../../app/access.js';
import Avatar from '../../ui/Avatar';
import styles from './AccountMenu.module.css';

/**
 * Menu real de conta no Topbar desktop (UX3). Ate aqui o avatar era so
 * decorativo (Avatar sem onClick) e a identidade do usuario ficava
 * fragmentada entre o avatar, o AccessModeSwitcher (que chegou a mostrar o
 * nome fixo "UniFlow Demo") e a propria pagina de Configuracoes. Este menu
 * concentra dados reais do perfil + as acoes de conta num unico lugar.
 *
 * Mesmo padrao de dropdown acessivel ja usado por AccessModeSwitcher.jsx
 * (pointerdown fora fecha, Escape fecha) -- nenhuma infraestrutura nova de
 * menu/popover foi criada, so reaproveitado o padrao existente.
 */
function AccountMenu({
  profileName = 'UniFlow',
  profileEmail = '',
  activeContext,
  onToggleWorkspace = () => {},
  isSwitchingWorkspace = false,
  onSignOut = () => {},
  isSigningOut = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) return undefined;

    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const items = Array.from(
          menuRef.current?.querySelectorAll('[role="menuitem"]') ?? [],
        );
        if (!items.length) return;
        const currentIndex = items.indexOf(document.activeElement);
        const nextIndex = event.key === 'ArrowDown'
          ? (currentIndex + 1) % items.length
          : (currentIndex - 1 + items.length) % items.length;
        items[nextIndex]?.focus();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    // Foco inicial no primeiro item ao abrir -- navegacao por teclado
    // funcional desde a primeira tecla (Arrow/Tab), sem exigir um clique.
    const firstItem = menuRef.current?.querySelector('[role="menuitem"]');
    firstItem?.focus();

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  function closeAnd(action) {
    setIsOpen(false);
    action();
  }

  const activeWorkspaceType = getWorkspaceTypeFromContext(activeContext);
  const contextLabel = activeContext ? getWorkspaceContextLabel(activeWorkspaceType) : null;
  // UX5: rotulo mostra o DESTINO real da troca (nao um "Trocar espaço"
  // generico e ambiguo) -- o usuario ve exatamente para onde vai antes de
  // clicar.
  const destinationWorkspaceType = activeWorkspaceType === WORKSPACE_TYPES.BUSINESS
    ? WORKSPACE_TYPES.PERSONAL
    : WORKSPACE_TYPES.BUSINESS;
  // AUTH3: rótulo indica claramente que uma troca já está em andamento --
  // nunca antecipa o destino como se já fosse o contexto ativo (esse
  // continua vindo de activeContext/contextLabel, sempre confirmado).
  const toggleWorkspaceLabel = isSwitchingWorkspace
    ? 'Alterando espaço…'
    : `Ir para ${getWorkspaceContextLabel(destinationWorkspaceType)}`;

  return (
    <div className={styles.menu} ref={menuRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Menu da conta de ${profileName}`}
        onClick={() => setIsOpen((current) => !current)}
      >
        <Avatar name={profileName} size="sm" status="online" />
      </button>

      {isOpen ? (
        <div className={styles.panel} role="menu" aria-label="Menu da conta">
          <div className={styles.header}>
            <strong className={styles.profileName}>{profileName}</strong>
            {profileEmail ? <span className={styles.profileEmail}>{profileEmail}</span> : null}
            {contextLabel ? <span className={styles.contextLabel}>{contextLabel}</span> : null}
          </div>

          <div className={styles.items}>
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => closeAnd(() => navigate('/configuracoes?section=perfil'))}
            >
              Ver perfil
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => closeAnd(() => navigate('/configuracoes?section=preferencias'))}
            >
              Configurações
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => closeAnd(() => navigate('/configuracoes?section=seguranca'))}
            >
              Segurança
            </button>
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              disabled={isSwitchingWorkspace}
              onClick={() => closeAnd(onToggleWorkspace)}
            >
              {toggleWorkspaceLabel}
            </button>
          </div>

          <div className={styles.signOutGroup}>
            <button
              type="button"
              role="menuitem"
              className={`${styles.item} ${styles.itemDanger}`}
              disabled={isSigningOut}
              onClick={() => closeAnd(onSignOut)}
            >
              {isSigningOut ? 'Saindo...' : 'Sair'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default AccountMenu;
