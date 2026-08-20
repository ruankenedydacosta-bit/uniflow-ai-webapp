import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { PUSH_STATUS, useWebPush } from '../mobile-push/useWebPush.js';
import NotificationsPanel from '../notifications/NotificationsPanel.jsx';
import { useNotifications } from '../notifications/useNotifications.js';
import { useCollapsibleHeaderOnScroll } from './collapsibleHeaderScroll.js';
import SimplifiedBottomNavigation from './SimplifiedBottomNavigation.jsx';
import SimplifiedHeader from './SimplifiedHeader.jsx';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import { useVisualViewport, VisualViewportContext } from './useVisualViewport.js';
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
  const mainContentRef = useRef(null);
  const shellRef = useRef(null);
  const viewportState = useVisualViewport();
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    refresh,
    markAsRead,
    markAllAsRead,
    dismissNotification,
  } = useNotifications();
  // NOTIF-UX3: o Notification Center interno e o Web Push são coisas
  // diferentes -- o sino abre a lista de notificações independentemente de
  // push estar autorizado. Este hook só alimenta o CTA discreto "Ativar
  // notificações" dentro do painel (mesmo enableNotifications() de sempre,
  // nunca uma segunda arquitetura de subscription); status === DEFAULT é o
  // único estado em que o toque realmente resolve algo -- denied/
  // unsupported/not_configured não têm ação útil aqui (o usuário vê o
  // detalhe em Conta), então o CTA fica ausente nesses casos.
  const { status: pushStatus, enableNotifications: enablePushNotifications } = useWebPush();
  const showPushCta = pushStatus === PUSH_STATUS.DEFAULT;
  const isPushEnabling = pushStatus === PUSH_STATUS.ENABLING;
  // ETAPA 4: Conta e suas rotas internas (/app/conta/...) também têm
  // cabeçalho próprio (título + voltar, ou título + Falar com a Uni na
  // principal) -- mesmo padrão já usado por Registros, nunca o cabeçalho
  // genérico (marca + sino) duplicado por cima.
  const hasPageHeader = location.pathname === SIMPLIFIED_ROUTES.RECORDS
    || location.pathname === SIMPLIFIED_ROUTES.ACCOUNT
    || location.pathname.startsWith(`${SIMPLIFIED_ROUTES.ACCOUNT}/`);
  const isUniChatRoute = location.pathname === SIMPLIFIED_ROUTES.UNI;
  const isUniChatKeyboardOpen = isUniChatRoute && viewportState.isKeyboardOpen;
  // COMPACT-HEADER1: só as rotas que realmente renderizam SimplifiedHeader
  // (abaixo) ganham o comportamento de esconder/reexibir ao rolar --
  // Registros/Conta/Chat da Uni têm cabeçalho próprio, nunca afetado por
  // isto.
  const showsCompactHeader = !hasPageHeader && !isUniChatRoute;
  const isHeaderHidden = useCollapsibleHeaderOnScroll({
    scrollContainerRef: mainContentRef,
    shellRef,
    enabled: showsCompactHeader,
  });

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openNotifications = useCallback(() => {
    clearCloseTimer();
    void refresh();
    setIsNotificationsRendered(true);
    openFrameRef.current = window.requestAnimationFrame(() => {
      setIsNotificationsOpen(true);
      openFrameRef.current = null;
    });
  }, [clearCloseTimer, refresh]);

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
      // NOTIF-UX3: 190ms -- alinhado à duração de fechamento pedida
      // (150-200ms) para a nova animação opacity+translateY+scale.
      closeTimerRef.current = window.setTimeout(() => {
        setIsNotificationsRendered(false);
        closeTimerRef.current = null;
      }, 190);
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

  useEffect(() => {
    const body = document.body;
    const previousValue = body.getAttribute('data-simplified-app-mounted');
    body.setAttribute('data-simplified-app-mounted', 'true');
    return () => {
      if (previousValue === null) body.removeAttribute('data-simplified-app-mounted');
      else body.setAttribute('data-simplified-app-mounted', previousValue);
    };
  }, []);

  return (
    <div
      ref={shellRef}
      className={styles.shell}
      style={viewportState.viewportStyle}
      data-simplified-app-shell
      data-keyboard-open={isUniChatKeyboardOpen ? 'true' : 'false'}
      data-text-size={profile?.text_size ?? 'standard'}
    >
      <div className={styles.shellSurface}>
        <div className={styles.shellTopRegion}>
          {hasPageHeader || isUniChatRoute ? null : (
            <SimplifiedHeader
              notificationButtonRef={notificationButtonRef}
              unreadCount={unreadCount}
              isNotificationsOpen={isNotificationsOpen}
              onNotifications={toggleNotifications}
              hidden={isHeaderHidden}
            />
          )}
          {isNotificationsRendered && !hasPageHeader && !isUniChatRoute ? (
            <>
              {/* NOTIF-UX3: puramente visual/bloqueio de toque -- fechar
                  continua sendo decidido pelo listener de pointerdown no
                  document (abaixo), que já ignora cliques dentro do
                  painel/botão do sino. pointer-events segue data-open
                  (nunca o inert do painel) para devolver a interação com a
                  Home no INSTANTE em que o fechamento começa, sem esperar
                  a transição de opacidade terminar. */}
              <div
                className={styles.notificationsBackdrop}
                data-open={isNotificationsOpen ? 'true' : 'false'}
                aria-hidden="true"
              />
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
                  <h2 id="simplified-notifications-title">Notificações</h2>
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
                  onDismiss={dismissNotification}
                  onNavigate={(url) => {
                    closeNotifications({ restoreFocus: false, immediate: true });
                    navigate(url);
                  }}
                />
                {showPushCta ? (
                  <div className={styles.notificationsPushCta}>
                    <p>Receba lembretes mesmo com a UniFlow fechada.</p>
                    <button
                      type="button"
                      disabled={isPushEnabling}
                      onClick={() => enablePushNotifications()}
                    >
                      {isPushEnabling ? 'Ativando…' : 'Ativar notificações'}
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
        <main
          ref={mainContentRef}
          className={styles.mainContent}
          data-uni-chat={isUniChatRoute ? 'true' : undefined}
          data-compact-header={showsCompactHeader ? 'true' : undefined}
          data-notifications-open={isNotificationsOpen ? 'true' : undefined}
        >
          <VisualViewportContext.Provider value={viewportState}>
            {children}
          </VisualViewportContext.Provider>
        </main>
        <SimplifiedBottomNavigation hidden={isUniChatKeyboardOpen} />
      </div>
    </div>
  );
}

export default SimplifiedAppShell;
