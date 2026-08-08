import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import NotificationsPanel from '../notifications/NotificationsPanel.jsx';
import { useNotifications } from '../notifications/useNotifications.js';
import { PwaInstallExperience } from '../pwa-install/index.js';
import SimplifiedBottomNavigation from './SimplifiedBottomNavigation.jsx';
import SimplifiedHeader from './SimplifiedHeader.jsx';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import { useVisualViewport } from './useVisualViewport.js';
import styles from './simplifiedApp.module.css';

function SimplifiedAppShell({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useSession();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isNotificationsRendered, setIsNotificationsRendered] = useState(false);
  const notificationButtonRef = useRef(null);
  const notificationPanelRef = useRef(null);
  const closeTimerRef = useRef(null);
  const openFrameRef = useRef(null);
  const viewportStyle = useVisualViewport();
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    refresh,
    markAsRead,
    markAllAsRead,
  } = useNotifications();
  // ETAPA 4: Conta e suas rotas internas (/app/conta/...) também têm
  // cabeçalho próprio (título + voltar, ou título + Falar com a Uni na
  // principal) -- mesmo padrão já usado por Registros, nunca o cabeçalho
  // genérico (marca + sino) duplicado por cima.
  const hasPageHeader = location.pathname === SIMPLIFIED_ROUTES.RECORDS
    || location.pathname === SIMPLIFIED_ROUTES.ACCOUNT
    || location.pathname.startsWith(`${SIMPLIFIED_ROUTES.ACCOUNT}/`);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openNotifications = useCallback(() => {
    clearCloseTimer();
    setIsNotificationsRendered(true);
    openFrameRef.current = window.requestAnimationFrame(() => {
      setIsNotificationsOpen(true);
      openFrameRef.current = null;
    });
  }, [clearCloseTimer]);

  const closeNotifications = useCallback(({ restoreFocus = true, immediate = false } = {}) => {
    clearCloseTimer();
    if (openFrameRef.current) {
      window.cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
    setIsNotificationsOpen(false);
    if (immediate) {
      setIsNotificationsRendered(false);
    } else {
      closeTimerRef.current = window.setTimeout(() => {
        setIsNotificationsRendered(false);
        closeTimerRef.current = null;
      }, 220);
    }
    if (restoreFocus) window.setTimeout(() => notificationButtonRef.current?.focus(), 0);
  }, [clearCloseTimer]);

  function toggleNotifications() {
    if (isNotificationsOpen) {
      closeNotifications();
      return;
    }
    if (closeTimerRef.current) {
      openNotifications();
      return;
    }
    if (isNotificationsRendered) closeNotifications();
    else openNotifications();
  }

  useEffect(() => {
    if (!isNotificationsOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') closeNotifications();
    }

    function handlePointerDown(event) {
      if (
        notificationPanelRef.current?.contains(event.target)
        || notificationButtonRef.current?.contains(event.target)
      ) return;
      closeNotifications({ restoreFocus: false });
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [closeNotifications, isNotificationsOpen]);

  useEffect(() => {
    if (!isNotificationsOpen) return undefined;
    const focusTimer = window.setTimeout(() => notificationPanelRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [isNotificationsOpen]);

  useEffect(() => {
    const routeTimer = window.setTimeout(() => {
      closeNotifications({ restoreFocus: false, immediate: true });
    }, 0);
    return () => window.clearTimeout(routeTimer);
  }, [closeNotifications, location.pathname]);

  useEffect(() => () => {
    clearCloseTimer();
    if (openFrameRef.current) window.cancelAnimationFrame(openFrameRef.current);
  }, [clearCloseTimer]);

  return (
    <div
      className={styles.shell}
      style={viewportStyle}
      data-simplified-app-shell
      data-text-size={profile?.text_size ?? 'standard'}
    >
      <div className={styles.shellSurface}>
        <div className={styles.shellTopRegion}>
          {hasPageHeader ? null : (
            <SimplifiedHeader
              notificationButtonRef={notificationButtonRef}
              unreadCount={unreadCount}
              isNotificationsOpen={isNotificationsOpen}
              onNotifications={toggleNotifications}
            />
          )}
          {isNotificationsRendered && !hasPageHeader ? (
            <div
              id="simplified-notifications-panel"
              ref={notificationPanelRef}
              className={styles.notificationsDropdown}
              data-open={isNotificationsOpen ? 'true' : 'false'}
              role="region"
              aria-labelledby="simplified-notifications-title"
              aria-hidden={!isNotificationsOpen}
              inert={!isNotificationsOpen}
              tabIndex={-1}
            >
              <div className={styles.notificationsDropdownHeader}>
                <div>
                  <h2 id="simplified-notifications-title">Notificações</h2>
                  <p>Informações importantes sobre sua conta.</p>
                </div>
                <button
                  type="button"
                  className={styles.notificationsClose}
                  onClick={() => closeNotifications()}
                  aria-label="Fechar notificações"
                >
                  ×
                </button>
              </div>
              <NotificationsPanel
                notifications={notifications}
                isLoading={isLoading}
                error={error}
                unreadCount={unreadCount}
                onMarkAsRead={markAsRead}
                onMarkAllAsRead={markAllAsRead}
                onRetry={refresh}
                onNavigate={(url) => {
                  closeNotifications({ restoreFocus: false, immediate: true });
                  navigate(url);
                }}
              />
            </div>
          ) : null}
        </div>
        <main className={styles.mainContent}>{children}</main>
        {location.pathname === SIMPLIFIED_ROUTES.ACCOUNT ? <PwaInstallExperience /> : null}
        <SimplifiedBottomNavigation />
      </div>
    </div>
  );
}

export default SimplifiedAppShell;
