import { forwardRef, useId } from 'react';
import { cx } from '../../../lib/cx';
import Button from '../Button';
import { useRovingFocus } from '../../../hooks/useRovingFocus';
import { useTopbarMenu } from './hooks';
import styles from './Topbar.module.css';

/**
 * Topbar — barra superior do produto (docx: componente "Navbar", mesmo
 * fundo --uf-color-bg-surface de Sidebar/Cards). Composição de Button
 * já existente para todas as ações em ícone — nenhum novo "botão de
 * ícone" foi inventado aqui.
 *
 * @see README.md para documentação completa de props e navegação por teclado.
 */
const Topbar = forwardRef(function Topbar(
  {
    onMenuToggle,
    showMenuToggle = false,
    title = null,
    breadcrumb = null,
    notifications = null,
    user = null,
    actions = null,
    className,
    ...rest
  },
  ref
) {
  const menuId = useId();
  const { menuRef, isOpen, toggle, close } = useTopbarMenu();

  const menuItemCount = user?.menuItems?.length ?? 0;
  const { onKeyDown, getItemProps } = useRovingFocus({
    itemCount: menuItemCount,
    orientation: 'vertical',
  });

  return (
    <header
      ref={ref}
      className={cx(
        styles.topbar,
        'uf-bg-surface',
        'uf-border-b',
        'uf-flex',
        'uf-items-center',
        'uf-justify-between',
        'uf-sticky',
        'uf-z-sticky',
        className
      )}
      {...rest}
    >
      <div className={cx(styles.leading, 'uf-flex', 'uf-items-center', 'uf-gap-md', 'uf-min-w-0')}>
        {showMenuToggle ? (
          <Button
            variant="ghost"
            size="md"
            aria-label="Abrir menu de navegação"
            onClick={onMenuToggle}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </Button>
        ) : null}

        <div className={cx('uf-min-w-0', 'uf-flex', 'uf-flex-column')}>
          {breadcrumb ? (
            <div className={cx(styles.breadcrumb, 'uf-text-micro', 'uf-text-tertiary', 'uf-truncate')}>
              {breadcrumb}
            </div>
          ) : null}
          {title ? (
            <div className={cx('uf-text-title', 'uf-truncate')}>{title}</div>
          ) : null}
        </div>
      </div>

      <div className={cx(styles.trailing, 'uf-flex', 'uf-items-center', 'uf-gap-sm', 'uf-shrink-0')}>
        {actions}

        {notifications ? (
          <span className={cx(styles.notificationWrap, 'uf-relative')}>
            <Button
              variant="ghost"
              size="md"
              aria-label={
                notifications.count
                  ? `Notificações (${notifications.count} não lidas)`
                  : 'Notificações'
              }
              onClick={notifications.onClick}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 01-3.46 0" />
              </svg>
            </Button>
            {notifications.count ? (
              <span
                className={cx(styles.notificationBadge, 'uf-bg-danger-subtle', 'uf-text-danger', 'uf-text-micro', 'uf-rounded-full')}
                aria-hidden="true"
              >
                {notifications.count > 9 ? '9+' : notifications.count}
              </span>
            ) : null}
          </span>
        ) : null}

        {user ? (
          <div ref={menuRef} className={cx(styles.userMenu, 'uf-relative')}>
            <button
              type="button"
              className={cx(styles.userTrigger, 'uf-flex', 'uf-items-center', 'uf-gap-sm', 'uf-rounded-full')}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              aria-controls={menuId}
              onClick={toggle}
            >
              {user.avatar}
              <span className={cx(styles.userName, 'uf-text-caption', 'uf-font-medium', 'uf-truncate')}>
                {user.name}
              </span>
            </button>

            {isOpen ? (
              <ul
                id={menuId}
                role="menu"
                aria-label={`Menu de ${user.name}`}
                className={cx(styles.menu, 'uf-glass-strong', 'uf-rounded-md', 'uf-shadow-lg', 'uf-z-popover', 'uf-animate-scale-in')}
                onKeyDown={onKeyDown}
              >
                {user.menuItems?.map((menuItem, index) => (
                  <li key={menuItem.id} role="none">
                    <button
                      {...getItemProps(index)}
                      type="button"
                      role="menuitem"
                      className={cx(
                        styles.menuItem,
                        'uf-flex',
                        'uf-items-center',
                        'uf-gap-md',
                        'uf-w-full',
                        'uf-text-left',
                        menuItem.danger && 'uf-text-danger'
                      )}
                      onClick={(event) => {
                        menuItem.onClick?.(event);
                        close();
                      }}
                    >
                      {menuItem.icon ? (
                        <span className={styles.menuItemIcon} aria-hidden="true">
                          {menuItem.icon}
                        </span>
                      ) : null}
                      {menuItem.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
});

Topbar.displayName = 'Topbar';

export default Topbar;
