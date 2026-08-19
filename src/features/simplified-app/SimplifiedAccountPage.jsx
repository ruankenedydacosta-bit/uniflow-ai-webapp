import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { getSubscription } from '../../services/billingService.js';
import Avatar from '../../components/ui/Avatar/Avatar.jsx';
import Badge from '../../components/ui/Badge/Badge.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import Button from '../../components/ui/Button/Button.jsx';
import AnalyticsConsentPreferencesModal from '../analytics/AnalyticsConsentPreferencesModal.jsx';
import { useAnalyticsConsent } from '../analytics/useAnalyticsConsent.js';
import SimplifiedPushNotificationsCard from '../mobile-push/SimplifiedPushNotificationsCard.jsx';
import {
  PERSONAL_PLAN_PRICE_LABEL,
  PERSONAL_PLAN_PRICE_PERIOD,
} from '../personal-plan/personalPlanConfig.js';
import { resolveSimplifiedGreeting } from './simplifiedGreeting.js';
import { formatDate, resolvePlanState, resolveRenewsAt } from './subscriptionPresentation.js';
import { ACCOUNT_SUBROUTES, ACCOUNT_SUBROUTE_IDS } from './simplifiedAccountRoutes.js';
import { APP_VERSION } from './appIdentity.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import {
  CalendarIcon,
  CardIcon,
  CrownIcon,
  HelpIcon,
  InfoIcon,
  LockIcon,
  LogoutIcon,
  MicIcon,
  PhoneIcon,
  SparkleIcon,
  UniMark,
  AccountIcon,
  ChevronRightIcon,
} from './SimplifiedIcons.jsx';
import styles from './simplifiedAccount.module.css';

/**
 * Correção (Bloco Saldo + Cobrança): esta tela agora busca sua PRÓPRIA
 * assinatura via billingService.getSubscription() (mesma fonte de "Seu
 * plano"/"Pagamento e assinatura") em vez de reaproveitar
 * useSession().subscription -- aquele valor vem de
 * workspaceService.getWorkspaceSubscription(), filtrado para
 * status IN ('trialing','active','past_due') para fins de CONTROLE DE
 * ACESSO do app inteiro (App.jsx). Reaproveitar esse mesmo valor aqui para
 * EXIBIÇÃO fazia uma assinatura cancelada/suspensa/pendente aparecer como
 * "Nenhuma assinatura ativa" (o filtro devolve null), quando na verdade
 * existe uma linha real com um estado diferente. SessionContext e o guard
 * de acesso em App.jsx continuam INTOCADOS -- só a apresentação nesta tela
 * passou a usar a fonte mais rica.
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
  const phone = typeof profile?.phone === 'string' ? profile.phone.trim() : '';
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

  const menuItems = [
    // LOTE AGENDA VISUAL: a Agenda ganhou entrada própria logo abaixo do
    // card "Seu plano" e ANTES de "Pagamento e assinatura". Não é subrota
    // de Conta (não existe em ACCOUNT_SUBROUTES) -- navega pela rota
    // interna /app/agenda (SIMPLIFIED_ROUTES.AGENDA), já sempre registrada.
    {
      id: 'agenda',
      Icon: CalendarIcon,
      tone: 'purple',
      title: 'Agenda',
      subtitle: 'Seus compromissos e lembretes',
      to: SIMPLIFIED_ROUTES.AGENDA,
    },
    {
      id: ACCOUNT_SUBROUTE_IDS.PAYMENTS,
      Icon: CardIcon,
      tone: 'blue',
      title: 'Pagamento e assinatura',
      subtitle: planState.status === 'active' ? 'Ver detalhes da assinatura' : 'Gerenciar plano e pagamento',
    },
    {
      id: ACCOUNT_SUBROUTE_IDS.VOICE,
      Icon: MicIcon,
      tone: 'blue',
      title: 'Voz da Uni',
      subtitle: 'Configurações de voz',
    },
    {
      id: ACCOUNT_SUBROUTE_IDS.SUPPORT,
      Icon: HelpIcon,
      tone: 'blue',
      title: 'Suporte',
      subtitle: 'Fale com nossa equipe',
    },
    {
      id: ACCOUNT_SUBROUTE_IDS.THEME,
      Icon: SparkleIcon,
      tone: 'purple',
      title: 'Tema',
      subtitle: 'Claro, Escuro, UniFlow ou Sistema',
    },
    {
      id: 'analytics-consent',
      Icon: LockIcon,
      tone: 'purple',
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
      Icon: InfoIcon,
      tone: 'purple',
      title: 'Sobre a UniFlow AI',
      subtitle: `Versão ${APP_VERSION}`,
    },
  ];

  return (
    <div className={styles.page} data-simplified-account>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.mark}><UniMark /></span>
          <h1>Conta</h1>
        </div>
        <button type="button" className={styles.talkButton} onClick={() => navigate(SIMPLIFIED_ROUTES.UNI)}>
          <span className={styles.talkIcon} aria-hidden="true"><MicIcon /></span>
          Falar com a Uni
        </button>
      </header>

      <section className={styles.profileCard} aria-label="Seu perfil">
        <div className={styles.profileTop}>
          <Avatar
            src={profile?.avatar_url || undefined}
            name={profile?.full_name || undefined}
            size="xl"
          />
          <div className={styles.profileInfo}>
            <div className={styles.nameRow}>
              <strong>{displayName}</strong>
              <Badge variant="success" size="sm">Plano Pessoal</Badge>
            </div>
            {email ? <span className={styles.profileLine}>{email}</span> : null}
            {phone ? (
              <span className={styles.profileLine}>
                <span className={styles.inlineIcon} aria-hidden="true"><PhoneIcon /></span>
                {phone}
              </span>
            ) : (
              <button type="button" className={styles.addPhoneButton} onClick={() => goTo(ACCOUNT_SUBROUTE_IDS.EDIT_PROFILE)}>
                <span className={styles.inlineIcon} aria-hidden="true"><PhoneIcon /></span>
                Adicionar telefone
              </button>
            )}
          </div>
        </div>

        <div className={styles.profileActions}>
          <button type="button" className={styles.profileAction} onClick={() => goTo(ACCOUNT_SUBROUTE_IDS.EDIT_PROFILE)}>
            <span className={`${styles.actionIcon} ${styles.toneBlue}`} aria-hidden="true"><AccountIcon /></span>
            <span>
              <strong>Editar perfil</strong>
              <small>Nome, foto e dados</small>
            </span>
          </button>
          <button type="button" className={styles.profileAction} onClick={() => goTo(ACCOUNT_SUBROUTE_IDS.SECURITY)}>
            <span className={`${styles.actionIcon} ${styles.toneGreen}`} aria-hidden="true"><LockIcon /></span>
            <span>
              <strong>Segurança</strong>
              <small>Senha e acesso</small>
            </span>
          </button>
        </div>
      </section>

      <button type="button" className={`${styles.planCard} ${styles[`plan_${planState.tone}`]}`} onClick={() => goTo(ACCOUNT_SUBROUTE_IDS.PLAN)}>
        <span className={styles.planIcon} aria-hidden="true"><CrownIcon /></span>
        <span className={styles.planInfo}>
          <strong className={styles.planStatusLabel}>{planState.label}</strong>
          <span className={styles.planName}>Plano Pessoal</span>
          {renewsAt ? (
            <small>Renova em {formatDate(renewsAt)}</small>
          ) : null}
        </span>
        {planState.tone === 'ok' ? (
          <span className={styles.planPrice}>
            <strong>{PERSONAL_PLAN_PRICE_LABEL}</strong>
            <small>{PERSONAL_PLAN_PRICE_PERIOD}</small>
          </span>
        ) : null}
        <span className={styles.planChevron} aria-hidden="true"><ChevronRightIcon /></span>
      </button>

      <SimplifiedPushNotificationsCard />

      <section className={styles.menuCard} aria-label="Configurações da conta">
        {menuItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.menuRow}
            onClick={() => (item.onSelect ? item.onSelect() : item.to ? navigate(item.to) : goTo(item.id))}
          >
            <span className={`${styles.menuIcon} ${styles[`tone${item.tone.charAt(0).toUpperCase()}${item.tone.slice(1)}`]}`} aria-hidden="true">
              <item.Icon />
            </span>
            <span className={styles.menuText}>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
            </span>
            <span className={styles.menuChevron} aria-hidden="true"><ChevronRightIcon /></span>
          </button>
        ))}
      </section>

      <button type="button" className={styles.logoutCard} onClick={() => setShowLogoutConfirm(true)}>
        <span className={styles.logoutIcon} aria-hidden="true"><LogoutIcon /></span>
        <span className={styles.menuText}>
          <strong>Sair da conta</strong>
          <small>Encerrar a sessão com segurança</small>
        </span>
        <span className={styles.menuChevron} aria-hidden="true"><ChevronRightIcon /></span>
      </button>

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
