import { useEffect, useRef } from 'react';
import { MORE_MENU_ROUTES } from './shellRoutes.js';
import styles from './MobileAppShell.module.css';

function MoreMenu({ isOpen, items = MORE_MENU_ROUTES, onClose, onNavigate, onAction }) {
  const closeButtonRef = useRef(null);

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

  const accountItems = items.filter((item) => item.group === 'account');
  const productItems = items.filter((item) => item.group === 'product');
  const signOutItem = items.find((item) => item.id === 'sign-out');

  const handleItem = (item) => {
    if (item.path) onNavigate?.(item);
    else onAction?.(item.action, item);
    onClose?.();
  };

  const renderItem = (item) => (
    <button
      key={item.id}
      type="button"
      className={`${styles.drawerItem} ${item.destructive ? styles.drawerItemDanger : ''}`}
      onClick={() => handleItem(item)}
    >
      <span className={styles.drawerItemIcon} aria-hidden="true">{item.icon}</span>
      <span>{item.label}</span>
    </button>
  );

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
          <section className={styles.drawerGroup} aria-labelledby="more-account-title">
            <h3 id="more-account-title" className={styles.drawerGroupTitle}>Conta</h3>
            <div className={styles.drawerItems}>{accountItems.map(renderItem)}</div>
          </section>
          <section className={styles.drawerGroup} aria-labelledby="more-product-title">
            <h3 id="more-product-title" className={styles.drawerGroupTitle}>Produto</h3>
            <div className={styles.drawerItems}>{productItems.map(renderItem)}</div>
          </section>
        </div>
        {signOutItem ? <div className={styles.drawerSignOut}>{renderItem(signOutItem)}</div> : null}
      </section>
    </div>
  );
}

export default MoreMenu;
