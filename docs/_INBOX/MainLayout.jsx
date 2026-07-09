import { useEffect } from 'react';
import { cx } from '../../../lib/cx';
import Sidebar from '../../ui/Sidebar';
import Topbar from '../../ui/Topbar';
import { useBreakpoint } from '../../../hooks/useBreakpoint';
import { useLocalStorageState } from '../../../hooks/useLocalStorageState';
import { useEscapeKey } from '../../../hooks/useDismissable';
import styles from './MainLayout.module.css';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'uf.sidebar.collapsed';

/**
 * MainLayout — casca estrutural do produto autenticado. Composição pura
 * de Sidebar + Topbar já existentes; não redeclara nenhum estilo deles.
 *
 * Responsabilidades próprias (o que justifica este componente existir
 * em vez de a própria página montar Sidebar+Topbar manualmente):
 *   1) decide, via useBreakpoint, se a Sidebar é coluna fixa (desktop)
 *      ou drawer sobreposto (mobile/tablet);
 *   2) persiste a preferência de colapso entre sessões
 *      (useLocalStorageState) — decisão que não pertence ao Sidebar,
 *      que permanece agnóstico de onde seu estado mora;
 *   3) fornece o outlet de conteúdo (`children`) com o padding/scroll
 *      corretos do "content sunken" da marca.
 *
 * @see README.md para documentação completa e exemplo com React Router.
 */
export default function MainLayout({
  navItems,
  activeNavId,
  onNavSelect,
  logo,
  sidebarFooter,
  topbarProps,
  children,
}) {
  const { desktop } = useBreakpoint();
  const [collapsed, setCollapsed] = useLocalStorageState(SIDEBAR_COLLAPSED_STORAGE_KEY, false);
  const [drawerOpen, setDrawerOpen] = useLocalStorageState('uf.sidebar.drawerOpen', false);

  // Em telas menores que desktop, a Sidebar nunca deve ficar aberta por
  // engano ao redimensionar a janela de volta para mobile/tablet.
  useEffect(() => {
    if (!desktop) setDrawerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop]);

  useEscapeKey(() => setDrawerOpen(false), !desktop && drawerOpen);

  return (
    <div className={cx(styles.shell, 'uf-h-screen', 'uf-flex')}>
      {desktop ? (
        <Sidebar
          items={navItems}
          activeId={activeNavId}
          onItemSelect={onNavSelect}
          logo={logo}
          footer={sidebarFooter}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
        />
      ) : (
        <>
          {drawerOpen ? (
            <div
              className={cx(styles.drawerBackdrop, 'uf-fixed', 'uf-inset-0', 'uf-z-modal-backdrop', 'uf-animate-fade-in')}
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
          ) : null}
          <div
            className={cx(
              styles.drawer,
              'uf-fixed',
              'uf-z-modal',
              drawerOpen ? styles.drawerOpen : null
            )}
          >
            <Sidebar
              items={navItems}
              activeId={activeNavId}
              onItemSelect={(item, event) => {
                onNavSelect?.(item, event);
                setDrawerOpen(false);
              }}
              logo={logo}
              footer={sidebarFooter}
              collapsed={false}
            />
          </div>
        </>
      )}

      <div className={cx(styles.content, 'uf-flex', 'uf-flex-column', 'uf-min-w-0', 'uf-flex-1')}>
        <Topbar
          {...topbarProps}
          showMenuToggle={!desktop}
          onMenuToggle={() => setDrawerOpen((prev) => !prev)}
        />

        <main className={cx(styles.main, 'uf-flex-1', 'uf-overflow-y-auto', 'uf-bg-canvas')}>
          {children}
        </main>
      </div>
    </div>
  );
}
