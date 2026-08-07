import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { getPasswordResetRequestFeedback } from '../auth-mobile/passwordRecoveryUtils.js';
import Badge from '../../components/ui/Badge/Badge.jsx';
import Button from '../../components/ui/Button/Button.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import { ACCOUNT_SUBROUTES, ACCOUNT_SUBROUTE_IDS } from './simplifiedAccountRoutes.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import {
  AlertTriangleIcon,
  CheckIcon,
  ClockIcon,
  DeviceIcon,
  HeadsetIcon,
  LockIcon,
  MailIcon,
  PhoneIcon,
  ShieldIcon,
  XCircleIcon,
} from './SimplifiedIcons.jsx';
import styles from './simplifiedSecurity.module.css';

function BackIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M20 6 10 16l10 10" />
    </svg>
  );
}

function formatDateTime(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * ETAPA 4 -- Segurança (Fase 1 confirmou por auditoria real do Supabase
 * Auth): não existe MFA habilitado, não existe API client-side para listar
 * sessões/dispositivos ou logs de auditoria (isso exigiria a Admin API,
 * que roda só no servidor com service-role key), e "força de senha" nunca
 * pode ser medida depois do fato -- o SDK nunca devolve a senha nem seu
 * hash. Por isso o card de visão geral mostra só os 3 sinais que realmente
 * existem (e-mail verificado, senha configurada via identities, MFA
 * ausente), "Seus aparelhos" e "Atividade recente" ficam honestamente
 * vazios, e "Encerrar sessões" reaproveita o mesmo signOut() real da Conta
 * (escopo padrão do Supabase já é global -- de fato encerra todas as
 * sessões, não é um rótulo vazio).
 */
function SimplifiedSecurityPage() {
  const navigate = useNavigate();
  const { user, profile, signOut, requestPasswordReset } = useSession();

  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const [resetFeedback, setResetFeedback] = useState(null);
  const [showEndSessionsConfirm, setShowEndSessionsConfirm] = useState(false);
  const [isEndingSessions, setIsEndingSessions] = useState(false);
  const [endSessionsError, setEndSessionsError] = useState(null);

  const isEmailVerified = Boolean(user?.email_confirmed_at);
  const hasPasswordIdentity = Array.isArray(user?.identities)
    ? user.identities.some((identity) => identity?.provider === 'email')
    : false;
  const oauthProvider = !hasPasswordIdentity ? (user?.app_metadata?.provider || null) : null;
  const lastSignInAt = user?.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : '';
  const phone = typeof profile?.phone === 'string' ? profile.phone.trim() : '';

  const hasBasicProtection = isEmailVerified && (hasPasswordIdentity || Boolean(oauthProvider));
  const overviewSummary = hasBasicProtection
    ? 'Sua conta possui as proteções básicas ativas.'
    : 'Há configurações de segurança que ainda podem ser concluídas.';

  async function handleRequestPasswordReset() {
    if (!user?.email || isRequestingReset) return;
    setIsRequestingReset(true);
    setResetFeedback(null);
    try {
      // useSession() já expõe requestPasswordReset com o redirectTo correto
      // (mesmo fluxo real do login/Configurações) -- só encaminha a chamada.
      const { error } = await requestPasswordReset(user.email);
      setResetFeedback(getPasswordResetRequestFeedback(error));
    } finally {
      setIsRequestingReset(false);
    }
  }

  async function handleConfirmEndSessions() {
    setIsEndingSessions(true);
    setEndSessionsError(null);
    const result = await signOut();
    setIsEndingSessions(false);
    if (result?.error) {
      setEndSessionsError('Não foi possível encerrar as sessões agora. Tente novamente.');
      return;
    }
    setShowEndSessionsConfirm(false);
  }

  return (
    <div className={styles.page} data-simplified-security>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate(SIMPLIFIED_ROUTES.ACCOUNT)}
            aria-label="Voltar para Conta"
          >
            <BackIcon />
          </button>
          <div>
            <h1>Segurança</h1>
            <p className={styles.subtitle}>Gerencie a segurança da sua conta.</p>
          </div>
        </div>
      </header>

      <section className={`${styles.card} ${styles.overviewCard}`} aria-label="Visão geral da proteção da conta">
        <div className={styles.overviewTop}>
          <span className={`${styles.overviewIcon} ${hasBasicProtection ? styles.overviewIconOk : styles.overviewIconWarn}`} aria-hidden="true">
            <ShieldIcon />
          </span>
          <p className={styles.overviewSummary}>{overviewSummary}</p>
        </div>
        <ul className={styles.checklist}>
          <li>
            <span className={isEmailVerified ? styles.checkOk : styles.checkNeutral} aria-hidden="true">
              {isEmailVerified ? <CheckIcon /> : <XCircleIcon />}
            </span>
            E-mail verificado
          </li>
          <li>
            <span className={hasPasswordIdentity ? styles.checkOk : styles.checkNeutral} aria-hidden="true">
              {hasPasswordIdentity ? <CheckIcon /> : <XCircleIcon />}
            </span>
            {hasPasswordIdentity ? 'Senha configurada' : oauthProvider ? `Acesso via ${oauthProvider}` : 'Senha não configurada'}
          </li>
          <li>
            <span className={styles.checkNeutral} aria-hidden="true"><XCircleIcon /></span>
            Verificação em duas etapas não configurada
          </li>
        </ul>
      </section>

      <section className={styles.card} aria-label="Alterar senha">
        <div className={styles.rowHeader}>
          <span className={`${styles.rowIcon} ${styles.toneBlue}`} aria-hidden="true"><LockIcon /></span>
          <div className={styles.rowText}>
            <strong>Alterar senha</strong>
            <small>
              {hasPasswordIdentity
                ? 'Enviaremos um link seguro para o seu e-mail.'
                : oauthProvider
                  ? `Você entra com sua conta ${oauthProvider}. A senha é gerenciada por lá.`
                  : 'Não foi possível determinar como você entra na conta.'}
            </small>
          </div>
        </div>
        {hasPasswordIdentity ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={isRequestingReset}
              onClick={handleRequestPasswordReset}
            >
              Enviar link de redefinição
            </Button>
            {resetFeedback ? (
              <p
                className={resetFeedback.tone === 'alert' ? styles.errorBanner : styles.successBanner}
                role={resetFeedback.tone === 'alert' ? 'alert' : 'status'}
              >
                {resetFeedback.message}
              </p>
            ) : null}
          </>
        ) : null}
      </section>

      <section className={styles.card} aria-label="Verificação em duas etapas">
        <div className={styles.rowHeader}>
          <span className={`${styles.rowIcon} ${styles.tonePurple}`} aria-hidden="true"><ShieldIcon /></span>
          <div className={styles.rowText}>
            <strong>Verificação em duas etapas</strong>
            <small>Estará disponível em uma futura versão.</small>
          </div>
          <Badge variant="warning" size="sm">Não configurada</Badge>
        </div>
      </section>

      <section className={styles.card} aria-label="Seus aparelhos">
        <div className={styles.sectionTitle}>
          <span className={`${styles.rowIcon} ${styles.toneBlue}`} aria-hidden="true"><DeviceIcon /></span>
          <div className={styles.rowText}>
            <strong>Seus aparelhos</strong>
            <small>Aparelhos onde sua conta está conectada.</small>
          </div>
        </div>
        <p className={styles.emptyState}>Informações de aparelhos ainda não estão disponíveis nesta versão.</p>
      </section>

      <section className={styles.card} aria-label="Atividade recente">
        <div className={styles.sectionTitle}>
          <span className={`${styles.rowIcon} ${styles.tonePurple}`} aria-hidden="true"><ClockIcon /></span>
          <div className={styles.rowText}>
            <strong>Atividade recente</strong>
            <small>Veja os últimos acessos à sua conta.</small>
          </div>
        </div>
        {lastSignInAt ? (
          <p className={styles.activityLine}>Último acesso: {lastSignInAt}</p>
        ) : null}
        <p className={styles.emptyState}>Não há mais detalhes de atividade disponíveis nesta versão.</p>
      </section>

      <section className={styles.card} aria-label="Recuperação da conta">
        <div className={styles.sectionTitle}>
          <span className={`${styles.rowIcon} ${styles.toneGreen}`} aria-hidden="true"><MailIcon /></span>
          <div className={styles.rowText}>
            <strong>Recuperação da conta</strong>
            <small>Mantenha seus contatos sempre atualizados.</small>
          </div>
        </div>
        <div className={styles.recoveryGrid}>
          <div className={styles.recoveryItem}>
            <span className={styles.fieldIcon} aria-hidden="true"><MailIcon /></span>
            <div className={styles.rowText}>
              <small>E-mail de recuperação</small>
              <strong>{user?.email || 'Ainda não definido'}</strong>
            </div>
            {isEmailVerified ? <Badge variant="success" size="sm">Verificado</Badge> : null}
          </div>
          <div className={styles.recoveryItem}>
            <span className={styles.fieldIcon} aria-hidden="true"><PhoneIcon /></span>
            <div className={styles.rowText}>
              <small>Telefone de recuperação</small>
              <strong>{phone || 'Ainda não definido'}</strong>
            </div>
          </div>
        </div>
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => navigate(ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.EDIT_PROFILE].path)}
        >
          Atualizar contatos de recuperação
        </button>
      </section>

      <section className={`${styles.card} ${styles.criticalCard}`} aria-label="Encerrar sessões">
        <span className={styles.criticalIcon} aria-hidden="true"><AlertTriangleIcon /></span>
        <div className={styles.rowText}>
          <strong>Encerrar todas as sessões</strong>
          <small>
            Se perdeu seu celular ou acredita que alguém entrou na sua conta, use esta opção.
            Isso também encerra sua sessão aqui -- você precisará entrar novamente.
          </small>
        </div>
        <Button type="button" variant="danger" fullWidth onClick={() => setShowEndSessionsConfirm(true)}>
          Encerrar todas as sessões
        </Button>
      </section>

      <section className={`${styles.card} ${styles.helpCard}`} aria-label="Ajuda">
        <span className={styles.helpMascot} aria-hidden="true"><HeadsetIcon /></span>
        <div className={styles.helpText}>
          <strong>Ajuda</strong>
          <p>Precisa de ajuda com a segurança da sua conta? Fale com o nosso suporte.</p>
        </div>
        <button
          type="button"
          className={styles.talkButton}
          onClick={() => navigate(ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.SUPPORT].path)}
        >
          Ajuda
        </button>
      </section>

      <Modal
        open={showEndSessionsConfirm}
        onClose={() => { if (!isEndingSessions) { setShowEndSessionsConfirm(false); setEndSessionsError(null); } }}
        title="Encerrar todas as sessões?"
        description="Você e qualquer outro aparelho conectado serão desconectados. Será necessário entrar novamente."
        footer={(
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setShowEndSessionsConfirm(false); setEndSessionsError(null); }}
              disabled={isEndingSessions}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmEndSessions}
              loading={isEndingSessions}
            >
              Encerrar todas as sessões
            </Button>
          </>
        )}
      >
        {endSessionsError ? <p className={styles.errorBanner} role="alert">{endSessionsError}</p> : null}
      </Modal>
    </div>
  );
}

export default SimplifiedSecurityPage;
