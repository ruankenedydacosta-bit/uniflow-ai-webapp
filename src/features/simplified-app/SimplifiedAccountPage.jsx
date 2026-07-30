import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { useAccounts } from '../../hooks/index.js';
import Avatar from '../../components/ui/Avatar/Avatar.jsx';
import Badge from '../../components/ui/Badge/Badge.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import Button from '../../components/ui/Button/Button.jsx';
import {
  PERSONAL_PLAN_PRICE_LABEL,
  PERSONAL_PLAN_PRICE_PERIOD,
} from '../personal-plan/personalPlanConfig.js';
import { resolveSimplifiedGreeting } from './simplifiedGreeting.js';
import { ACCOUNT_SUBROUTES, ACCOUNT_SUBROUTE_IDS } from './simplifiedAccountRoutes.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import {
  BankIcon,
  BellIcon,
  CardIcon,
  CrownIcon,
  HelpIcon,
  InfoIcon,
  LockIcon,
  LogoutIcon,
  MicIcon,
  PhoneIcon,
  ShieldIcon,
  UniMark,
  AccountIcon,
  ChevronRightIcon,
} from './SimplifiedIcons.jsx';
import styles from './simplifiedAccount.module.css';

const EMPTY_RECORDS = Object.freeze([]);

// Versão real do aplicativo -- espelha package.json (mantida sincronizada
// manualmente aqui; não é um valor inventado, é o mesmo número publicado).
const APP_VERSION = '0.0.0';

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * Estados honestos do card de plano (Fase 6) -- nunca inventa assinatura,
 * cartão ou data de renovação. `subscription` vem de useSession() (linha
 * real da tabela subscriptions do workspace ativo, ou null quando não há
 * nenhuma -- o caso normal hoje, já que o checkout ainda não existe).
 */
function resolvePlanState(subscription) {
  if (!subscription) {
    return { status: 'not_configured', label: 'Pagamento ainda não configurado' };
  }
  if (subscription.status === 'active' || subscription.status === 'trialing') {
    return {
      status: 'active',
      label: 'Seu plano está ativo',
      renewsAt: subscription.current_period_ends_at ?? null,
    };
  }
  if (subscription.status === 'past_due') {
    return { status: 'past_due', label: 'Pagamento pendente' };
  }
  // 'canceled' | 'expired'
  return { status: 'inactive', label: 'Plano não ativo' };
}

function SimplifiedAccountPage() {
  const navigate = useNavigate();
  const { user, profile, workspace, subscription, signOut } = useSession();
  const accountState = useAccounts({ workspaceId: workspace?.id, fallbackAccounts: EMPTY_RECORDS, fallbackAccountTypes: EMPTY_RECORDS });
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState(null);

  const greeting = useMemo(() => resolveSimplifiedGreeting(profile, user), [profile, user]);
  const displayName = greeting.hasKnownName
    ? greeting.heading
    : (profile?.full_name?.trim() || 'Sua conta');
  const email = user?.email ?? '';
  const phone = typeof profile?.phone === 'string' ? profile.phone.trim() : '';
  const planState = resolvePlanState(subscription);
  const accountsCount = accountState.activeAccounts.length;

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
    {
      id: ACCOUNT_SUBROUTE_IDS.PAYMENTS,
      Icon: CardIcon,
      tone: 'blue',
      title: 'Pagamento e assinatura',
      subtitle: planState.status === 'active' ? 'Ver detalhes da assinatura' : 'Gerenciar plano e pagamento',
    },
    {
      id: ACCOUNT_SUBROUTE_IDS.MY_ACCOUNTS,
      Icon: BankIcon,
      tone: 'green',
      title: 'Minhas contas',
      subtitle: accountState.isLoading
        ? 'Carregando…'
        : accountsCount > 0
          ? `${accountsCount} ${accountsCount === 1 ? 'conta cadastrada' : 'contas cadastradas'}`
          : 'Nenhuma conta cadastrada',
    },
    {
      id: ACCOUNT_SUBROUTE_IDS.NOTIFICATIONS,
      Icon: BellIcon,
      tone: 'purple',
      title: 'Notificações',
      subtitle: 'Alertas e lembretes',
    },
    {
      id: ACCOUNT_SUBROUTE_IDS.VOICE,
      Icon: MicIcon,
      tone: 'blue',
      title: 'Voz da Uni',
      subtitle: 'Configurações de voz',
    },
    {
      id: ACCOUNT_SUBROUTE_IDS.PRIVACY,
      Icon: ShieldIcon,
      tone: 'green',
      title: 'Privacidade e dados',
      subtitle: 'Como seus dados são usados',
    },
    {
      id: ACCOUNT_SUBROUTE_IDS.SUPPORT,
      Icon: HelpIcon,
      tone: 'blue',
      title: 'Suporte',
      subtitle: 'Fale com nossa equipe',
    },
    {
      id: ACCOUNT_SUBROUTE_IDS.ABOUT,
      Icon: InfoIcon,
      tone: 'purple',
      title: 'Sobre o UniFlow AI',
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

      <button type="button" className={`${styles.planCard} ${styles[`plan_${planState.status}`]}`} onClick={() => goTo(ACCOUNT_SUBROUTE_IDS.PLAN)}>
        <span className={styles.planIcon} aria-hidden="true"><CrownIcon /></span>
        <span className={styles.planInfo}>
          <strong className={styles.planStatusLabel}>{planState.label}</strong>
          <span className={styles.planName}>Plano Pessoal</span>
          {planState.status === 'active' && planState.renewsAt ? (
            <small>Renova em {formatDate(planState.renewsAt)}</small>
          ) : null}
        </span>
        {planState.status === 'active' ? (
          <span className={styles.planPrice}>
            <strong>{PERSONAL_PLAN_PRICE_LABEL}</strong>
            <small>{PERSONAL_PLAN_PRICE_PERIOD}</small>
          </span>
        ) : null}
        <span className={styles.planChevron} aria-hidden="true"><ChevronRightIcon /></span>
      </button>

      <section className={styles.menuCard} aria-label="Configurações da conta">
        {menuItems.map((item) => (
          <button key={item.id} type="button" className={styles.menuRow} onClick={() => goTo(item.id)}>
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
