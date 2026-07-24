import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAccess } from '../../app/AccessContext.jsx';
import { MORE_MENU_ROUTES, filterShellRoutesByContext } from './shellRoutes.js';
import styles from './MobileAppShell.module.css';

function MoreMenu({ isOpen, items = MORE_MENU_ROUTES, onClose, onNavigate, onAction }) {
  const closeButtonRef = useRef(null);
  const { currentWorkspace } = useAccess();
  const location = useLocation();

  useEffect(() => {
    if (!isOpen) return undefined;

    closeButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Mesma fonte declarativa da Sidebar/BottomNavigation (moduleAccess.js).
  // Sem links empresariais em PF nem PF-exclusivos em PJ; ações puras seguem sempre.
  const visibleItems = filterShellRoutesByContext(items, currentWorkspace);
  const accountItems = visibleItems.filter((item) => item.group === 'account');
  // Grupo 'management': CRM/Clientes/Projetos, BUSINESS_ONLY em moduleAccess.js
  // -- some sozinho em PF via filterShellRoutesByContext acima, sem regra propria.
  const managementItems = visibleItems.filter((item) => item.group === 'management');
  const productItems = visibleItems.filter((item) => item.group === 'product');
  const signOutItem = visibleItems.find((item) => item.id === 'sign-out');

  const handleItem = (item) => {
    if (item.path) onNavigate?.(item);
    else onAction?.(item.action, item);
    onClose?.();
  };

  // Itens comingSoon (Notificações/Suporte) nunca navegam nem disparam acao --
  // renderizados como <button disabled>, nao clicaveis por mouse/teclado/AT,
  // com rotulo "Em breve" visivel (achado P0 da UX1: eram cliques mortos sem
  // nenhum feedback).
  const renderItem = (item) => {
    if (item.comingSoon) {
      return (
        <button
          key={item.id}
          type="button"
          className={`${styles.drawerItem} ${styles.drawerItemDisabled}`}
          disabled
          aria-disabled="true"
        >
          <span className={styles.drawerItemIcon} aria-hidden="true">{item.icon}</span>
          <span className={styles.drawerItemLabelGroup}>
            <span>{item.label}</span>
            <span className={styles.drawerItemComingSoon}>Em breve</span>
          </span>
        </button>
      );
    }

    const isActive = Boolean(item.path) && location.pathname === item.path;

    return (
      <button
        key={item.id}
        type="button"
        className={`${styles.drawerItem} ${item.destructive ? styles.drawerItemDanger : ''} ${isActive ? styles.drawerItemActive : ''}`}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => handleItem(item)}
      >
        <span className={styles.drawerItemIcon} aria-hidden="true">{item.icon}</span>
        <span>{item.label}</span>
      </button>
    );
  };

  return (
    <div className={styles.drawerLayer} data-more-menu>
      <button className={styles.drawerBackdrop} type="button" aria-label="Fechar menu" onClick={onClose} />
      <section className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="mobile-more-title">
        <div className={styles.drawerHandle} aria-hidden="true" />
        <div className={styles.drawerHeader}>
          <h2 id="mobile-more-title" className={styles.drawerTitle}>Mais opções</h2>
          <button ref={closeButtonRef} type="button" className={styles.closeButton} onClick={onClose} aria-label="Fechar menu">
            ×
          </button>
        </div>
        <div className={styles.drawerGroups}>
          {accountItems.length ? (
            <section className={styles.drawerGroup} aria-labelledby="more-account-title">
              <h3 id="more-account-title" className={styles.drawerGroupTitle}>Conta</h3>
              <div className={styles.drawerItems}>{accountItems.map(renderItem)}</div>
            </section>
          ) : null}
          {managementItems.length ? (
            <section className={styles.drawerGroup} aria-labelledby="more-management-title">
              <h3 id="more-management-title" className={styles.drawerGroupTitle}>Gestão</h3>
              <div className={styles.drawerItems}>{managementItems.map(renderItem)}</div>
            </section>
          ) : null}
          {productItems.length ? (
            <section className={styles.drawerGroup} aria-labelledby="more-product-title">
              <h3 id="more-product-title" className={styles.drawerGroupTitle}>Produto</h3>
              <div className={styles.drawerItems}>{productItems.map(renderItem)}</div>
            </section>
          ) : null}
        </div>
        {signOutItem ? <div className={styles.drawerSignOut}>{renderItem(signOutItem)}</div> : null}
      </section>
    </div>
  );
}

export default MoreMenu;
