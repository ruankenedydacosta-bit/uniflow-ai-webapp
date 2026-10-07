import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { getSubscription } from '../../services/billingService.js';
import Avatar from '../../components/ui/Avatar/Avatar.jsx';
import IconBox from '../../components/ui/IconBox/index.js';
import Modal from '../../components/ui/Modal/Modal.jsx';
import Button from '../../components/ui/Button/Button.jsx';
import { cx } from '../../utils/cx.js';
import AnalyticsConsentPreferencesModal from '../analytics/AnalyticsConsentPreferencesModal.jsx';
import { useAnalyticsConsent } from '../analytics/useAnalyticsConsent.js';
import SimplifiedAccountNotificationsRow from './SimplifiedAccountNotificationsRow.jsx';
import {
  formatPlanPrice,
  PERSONAL_PLAN_PRICE_LABEL,
  PERSONAL_PLAN_PRICE_PERIOD,
} from '../personal-plan/personalPlanConfig.js';
import { resolveSimplifiedGreeting } from './simplifiedGreeting.js';
import { formatDate, resolvePlanState, resolveRenewsAt } from './subscriptionPresentation.js';
import { ACCOUNT_SUBROUTES, ACCOUNT_SUBROUTE_IDS } from './simplifiedAccountRoutes.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import { useUniUpdates } from './useUniUpdates.js';
import {
  PhCalendarIcon,
  PhCaretRightIcon,
  PhChartBarIcon,
  PhCreditCardIcon,
  PhCrownIcon,
  PhGearIcon,
  PhInfoIcon,
  PhLifebuoyIcon,
  PhLockKeyIcon,
  PhMicrophoneIcon,
  PhShieldCheckIcon,
  PhSignOutIcon,
  PhUserIcon,
  UniMark,
} from './SimplifiedIcons.jsx';
import groups from './simplifiedGroups.module.css';
import styles from './simplifiedAccount.module.css';

/**
 * Correção (Bloco Saldo + Cobrança): esta tela busca sua PRÓPRIA assinatura
 * via billingService.getSubscription() (mesma fonte de "Seu plano"/
 * "Pagamento e assinatura") em vez de reaproveitar useSession().subscription
 * -- aquele valor vem de workspaceService.getWorkspaceSubscription(),
 * filtrado para status IN ('trialing','active','past_due') para fins de
 * CONTROLE DE ACESSO do app inteiro (App.jsx). Reaproveitar esse mesmo valor
 * aqui para EXIBIÇÃO fazia uma assinatura cancelada/suspensa/pendente
 * aparecer como "Nenhuma assinatura ativa". SessionContext e o guard de
 * acesso em App.jsx continuam INTOCADOS.
 *
 * Fase 3 do redesign (#90): tela 07 "Mais" do handoff. Card de perfil,
 * card do plano e três grupos (Conta, Produto, Sessão) com linhas de 36px
 * de ícone. Ficam de fora o espaço ativo e os itens que levam a telas que
 * o app simplificado não tem (Metas, Visão de futuro, Categorias, Open
 * Finance). O acesso à Uni é o orb da navegação inferior.
 */
function SimplifiedAccountPage() {
  const navigate = useNavigate();
  const { user, profile, workspace, signOut } = useSession();
  const workspaceId = workspace?.id;
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showAnalyticsPreferences, setShowAnalyticsPreferences] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const { status: analyticsConsentStatus } = useAnalyticsConsent();
  // UNIUPD2: limit:1 -- só precisa da versão atual (mesma fonte de Sobre a
  // UniFlow AI e da notificação), nunca o histórico inteiro.
  const { currentVersion } = useUniUpdates({ limit: 1 });

  useEffect(() => {
    let isActive = true;
    // Mesmo padrao de deferimento via setTimeout(0) usado por
    // SimplifiedPlanPage.jsx/SimplifiedPaymentsPage.jsx -- evita disparar
    // setState sincrono direto no corpo do efeito.
    const timeoutId = window.setTimeout(() => {
      if (!workspaceId) return;
      getSubscription({ workspaceId }).then((result) => {
        if (!isActive) return;
        setSubscription(result.data ?? null);
      });
    }, 0);
    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [workspaceId]);

  const greeting = useMemo(() => resolveSimplifiedGreeting(profile, user), [profile, user]);
  const displayName = greeting.hasKnownName
    ? greeting.heading
    : (profile?.full_name?.trim() || 'Sua conta');
  const email = user?.email ?? '';
  const planState = resolvePlanState(subscription);
  const renewsAt = resolveRenewsAt(subscription, planState);

  function goTo(subrouteId) {
    navigate(ACCOUNT_SUBROUTES[subrouteId].path);
  }

  async function handleConfirmLogout() {
    setIsSigningOut(true);
    setLogoutError(null);
    const result = await signOut();
    setIsSigningOut(false);
    if (result?.error) {
      setLogoutError('Não foi possível sair agora. Tente novamente.');
      return;
    }
    setShowLogoutConfirm(false);
  }

  // Grupo "Conta" do handoff: Perfil, Configurações (a aba Preferências,
  // que mora na rota de Tema) e Segurança.
  const accountItems = [
    {
      id: ACCOUNT_SUBROUTE_IDS.EDIT_PROFILE,
      Icon: PhUserIcon,
      title: 'Perfil',
    },
    {
      id: ACCOUNT_SUBROUTE_IDS.THEME,
      Icon: PhGearIcon,
      title: 'Configurações',
    },
    {
      id: ACCOUNT_SUBROUTE_IDS.SECURITY,
      Icon: PhShieldCheckIcon,
      title: 'Segurança',
    },
  ];

  // Grupo "Produto": Relatórios e Notificações vêm do handoff; Agenda,
  // Pagamento e assinatura, Voz da Uni, Suporte, Privacidade e Sobre são
  // telas que já existem e continuam alcançáveis por aqui.
  const productItems = [
    {
      id: 'reports',
      Icon: PhChartBarIcon,
      title: 'Relatórios',
      to: SIMPLIFIED_ROUTES.RELATORIO,
    },
    // LOTE AGENDA VISUAL: não é subrota de Conta (não existe em
    // ACCOUNT_SUBROUTES) -- navega pela rota interna /app/agenda.
    {
      id: 'agenda',
      Icon: PhCalendarIcon,
      title: 'Agenda',
      subtitle: 'Seus compromissos e lembretes',
      to: SIMPLIFIED_ROUTES.AGENDA,
    },
    {
      id: ACCOUNT_SUBROUTE_IDS.PAYMENTS,
      Icon: PhCreditCardIcon,
      title: 'Pagamento e assinatura',
      subtitle: planState.status === 'active' ? 'Ver detalhes da assinatura' : 'Gerenciar plano e pagamento',
    },
    {
      id: ACCOUNT_SUBROUTE_IDS.VOICE,
      Icon: PhMicrophoneIcon,
      title: 'Voz da Uni',
    },
    {
      id: ACCOUNT_SUBROUTE_IDS.SUPPORT,
      Icon: PhLifebuoyIcon,
      title: 'Suporte',
    },
    {
      id: 'analytics-consent',
      Icon: PhLockKeyIcon,
      title: 'Privacidade e Analytics',
      subtitle: analyticsConsentStatus === 'granted'
        ? 'Dados de uso permitidos'
        : analyticsConsentStatus === 'denied'
          ? 'Dados de uso não permitidos'
          : 'Escolher preferência',
      onSelect: () => setShowAnalyticsPreferences(true),
    },
    {
      id: ACCOUNT_SUBROUTE_IDS.ABOUT,
      Icon: PhInfoIcon,
      title: 'Sobre a UniFlow AI',
      subtitle: `Versão ${currentVersion}`,
    },
  ];

  function renderRow(item) {
    return (
      <button
        key={item.id}
        type="button"
        className={cx(groups.row, styles.menuRow)}
        onClick={() => (item.onSelect ? item.onSelect() : item.to ? navigate(item.to) : goTo(item.id))}
      >
        <IconBox><item.Icon /></IconBox>
        <span className={groups.rowText}>
          <span className={groups.rowTitle}>{item.title}</span>
          {item.subtitle ? <span className={groups.rowSubtitle}>{item.subtitle}</span> : null}
        </span>
        <span className={groups.caret} aria-hidden="true"><PhCaretRightIcon /></span>
      </button>
    );
  }

  return (
    <div className={styles.page} data-simplified-account>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.mark} aria-hidden="true"><UniMark /></span>
          <h1>Mais</h1>
        </div>
        <Link
          to={ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.EDIT_PROFILE].path}
          className={styles.headerAvatar}
          aria-label="Seu perfil"
        >
          <Avatar
            size="sm"
            className={styles.avatar}
            src={profile?.avatar_url || undefined}
            name={profile?.full_name || undefined}
            alt=""
            aria-hidden="true"
          />
        </Link>
      </header>

      <button
        type="button"
        className={styles.profileCard}
        onClick={() => goTo(ACCOUNT_SUBROUTE_IDS.EDIT_PROFILE)}
      >
        <Avatar
          className={styles.avatar}
          src={profile?.avatar_url || undefined}
          name={profile?.full_name || undefined}
          size="lg"
        />
        <span className={styles.profileInfo}>
          <strong>{displayName}</strong>
          {email ? <small>{email}</small> : null}
        </span>
        <span className={groups.caret} aria-hidden="true"><PhCaretRightIcon /></span>
      </button>

      <button type="button" className={cx(styles.planCard, styles[`plan_${planState.tone}`])} onClick={() => goTo(ACCOUNT_SUBROUTE_IDS.PLAN)}>
        <IconBox className={styles.planIcon}><PhCrownIcon /></IconBox>
        <span className={styles.planInfo}>
          <strong className={styles.planStatusLabel}>{planState.label}</strong>
          <span className={styles.planName}>Plano Pessoal</span>
          {renewsAt ? (
            <small>Renova em {formatDate(renewsAt)}</small>
          ) : null}
        </span>
        {planState.tone === 'ok' ? (
          <span className={styles.planPrice}>
            <strong>{formatPlanPrice(subscription?.value) || PERSONAL_PLAN_PRICE_LABEL}</strong>
            <small>{PERSONAL_PLAN_PRICE_PERIOD}</small>
          </span>
        ) : null}
        <span className={groups.caret} aria-hidden="true"><PhCaretRightIcon /></span>
      </button>

      <section className={groups.group} aria-label="Conta">
        <h2 className={groups.groupLabel}>Conta</h2>
        <div className={groups.list}>
          {accountItems.map(renderRow)}
        </div>
      </section>

      <section className={groups.group} aria-label="Produto">
        <h2 className={groups.groupLabel}>Produto</h2>
        <div className={groups.list}>
          {productItems.slice(0, 2).map(renderRow)}
          <SimplifiedAccountNotificationsRow />
          {productItems.slice(2).map(renderRow)}
        </div>
      </section>

      <section className={groups.group} aria-label="Sessão">
        <h2 className={groups.groupLabel}>Sessão</h2>
        <div className={groups.list}>
          <button type="button" className={cx(groups.row, styles.logoutCard)} onClick={() => setShowLogoutConfirm(true)}>
            <IconBox><PhSignOutIcon /></IconBox>
            <span className={groups.rowText}>
              <span className={groups.rowTitle}>Sair</span>
            </span>
          </button>
        </div>
      </section>

      <AnalyticsConsentPreferencesModal
        open={showAnalyticsPreferences}
        onClose={() => setShowAnalyticsPreferences(false)}
      />

      <Modal
        open={showLogoutConfirm}
        onClose={() => { if (!isSigningOut) { setShowLogoutConfirm(false); setLogoutError(null); } }}
        title="Deseja sair da sua conta?"
        description="Você precisará entrar novamente para acessar a UniFlow."
        footer={(
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setShowLogoutConfirm(false); setLogoutError(null); }}
              disabled={isSigningOut}
            >
              Continuar conectado
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmLogout}
              loading={isSigningOut}
            >
              Sair da conta
            </Button>
          </>
        )}
      >
        {logoutError ? <p className={styles.logoutError} role="alert">{logoutError}</p> : null}
      </Modal>
    </div>
  );
}

export default SimplifiedAccountPage;
