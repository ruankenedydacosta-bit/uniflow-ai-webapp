import { forwardRef, useId } from 'react';
import { cx } from '../../../lib/cx';
import { useRovingFocus } from '../../../hooks/useRovingFocus';
import { useSidebarCollapsed } from './hooks';
import { COLLAPSED_ATTR } from './constants';
import styles from './Sidebar.module.css';

/**
 * Sidebar — navegação estrutural principal do produto (docx: componente
 * "Sidebar", fundo --uf-color-bg-surface, igual a Navbar e Cards).
 *
 * Segue exatamente a arquitetura do Button: nenhuma cor/espaçamento/
 * radius/sombra/duração hardcoded — tudo var(--uf-...) via CSS Module,
 * combinado com classes de utilities.css já aplicadas no JSX.
 *
 * @see README.md para documentação completa de props e navegação por teclado.
 */
const Sidebar = forwardRef(function Sidebar(
  {
    items,
    activeId,
    onItemSelect,
    collapsed,
    defaultCollapsed = false,
    onCollapsedChange,
    logo = null,
    footer = null,
    className,
    ...rest
  },
  ref
) {
  const navId = useId();
  const [isCollapsed, toggleCollapsed] = useSidebarCollapsed({
    collapsed,
    defaultCollapsed,
    onCollapsedChange,
  });

  const { onKeyDown, getItemProps } = useRovingFocus({
    itemCount: items.length,
    orientation: 'vertical',
  });

  return (
    <aside
      ref={ref}
      className={cx(styles.sidebar, 'uf-bg-surface', 'uf-flex', 'uf-flex-column', className)}
      data-collapsed={isCollapsed || undefined}
      aria-label="Navegação principal"
      {...rest}
    >
      {logo ? (
        <div className={cx(styles.logoSlot, 'uf-flex', 'uf-items-center')}>{logo}</div>
      ) : null}

      <nav className={cx(styles.nav, 'uf-flex-1', 'uf-overflow-y-auto')}>
        <ul
          id={navId}
          className={cx(styles.list, 'uf-flex', 'uf-flex-column', 'uf-gap-xs')}
          onKeyDown={onKeyDown}
          role="list"
        >
          {items.map((item, index) => {
            const isActive = item.id === activeId;
            const itemProps = getItemProps(index);

            return (
              <li key={item.id} role="listitem">
                <a
                  {...itemProps}
                  href={item.href ?? '#'}
                  className={cx(
                    styles.item,
                    'uf-flex',
                    'uf-items-center',
                    'uf-gap-md',
                    'uf-rounded-md',
                    isActive && styles.itemActive
                  )}
                  aria-current={isActive ? 'page' : undefined}
                  data-tooltip={isCollapsed ? item.label : undefined}
                  onClick={(event) => {
                    if (!item.href) event.preventDefault();
                    onItemSelect?.(item, event);
                  }}
                >
                  {item.icon ? (
                    <span className={cx(styles.icon, 'uf-shrink-0')} aria-hidden="true">
                      {item.icon}
                    </span>
                  ) : null}

                  <span className={cx(styles.label, 'uf-truncate', 'uf-text-caption')}>
                    {item.label}
                  </span>

                  {item.badge ? (
                    <span className={cx(styles.badge, 'uf-bg-primary-subtle', 'uf-text-brand', 'uf-text-micro', 'uf-rounded-full')}>
                      {item.badge}
                    </span>
                  ) : null}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      {footer ? (
        <div className={cx(styles.footerSlot, 'uf-border-t')}>{footer}</div>
      ) : null}

      <button
        type="button"
        className={cx(styles.collapseToggle, 'uf-flex', 'uf-items-center', 'uf-justify-center', 'uf-border-t')}
        onClick={toggleCollapsed}
        aria-expanded={!isCollapsed}
        aria-controls={navId}
        aria-label={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
      >
        <span className={cx(styles.collapseIcon, isCollapsed && styles.collapseIconFlipped)} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </span>
      </button>
    </aside>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;
