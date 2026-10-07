import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { getPasswordResetRequestFeedback } from '../auth-mobile/passwordRecoveryUtils.js';
import Button from '../../components/ui/Button/Button.jsx';
import IconBox from '../../components/ui/IconBox/index.js';
import Modal from '../../components/ui/Modal/Modal.jsx';
import OutlineButton from '../../components/ui/OutlineButton/index.js';
import { cx } from '../../utils/cx.js';
import { ACCOUNT_SUBROUTES, ACCOUNT_SUBROUTE_IDS } from './simplifiedAccountRoutes.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import {
  PhCheckCircleIcon,
  PhClockCounterClockwiseIcon,
  PhDeviceMobileIcon,
  PhEnvelopeSimpleIcon,
  PhHeadsetIcon,
  PhLockKeyIcon,
  PhPhoneIcon,
  PhShieldCheckIcon,
  PhWarningIcon,
  PhXCircleIcon,
} from './SimplifiedIcons.jsx';
import SimplifiedSettingsTabs from './SimplifiedSettingsTabs.jsx';
import SimplifiedSubpageHeader from './SimplifiedSubpageHeader.jsx';
import groups from './simplifiedGroups.module.css';
import styles from './simplifiedSecurity.module.css';

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
 *
 * Fase 3 do redesign (#90): aba "Segurança" da tela 14 Configurações.
 * Mesmos dados e ações; só o visual mudou (grupos, linhas com caixa de
 * ícone e etiquetas contornadas).
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
      <SimplifiedSubpageHeader
        title="Configurações"
        onBack={() => navigate(SIMPLIFIED_ROUTES.ACCOUNT)}
        backLabel="Voltar para Mais"
      />

      <SimplifiedSettingsTabs active={ACCOUNT_SUBROUTE_IDS.SECURITY} />

      <section className={styles.overviewCard} aria-label="Visão geral da proteção da conta">
        <div className={styles.overviewTop}>
          <IconBox className={hasBasicProtection ? styles.overviewIconOk : styles.overviewIconWarn}>
            <PhShieldCheckIcon />
          </IconBox>
          <p className={styles.overviewSummary}>{overviewSummary}</p>
        </div>
        <ul className={styles.checklist}>
          <li>
            <span className={isEmailVerified ? styles.checkOk : styles.checkNeutral} aria-hidden="true">
              {isEmailVerified ? <PhCheckCircleIcon /> : <PhXCircleIcon />}
            </span>
            E-mail verificado
          </li>
          <li>
            <span className={hasPasswordIdentity ? styles.checkOk : styles.checkNeutral} aria-hidden="true">
              {hasPasswordIdentity ? <PhCheckCircleIcon /> : <PhXCircleIcon />}
            </span>
            {hasPasswordIdentity ? 'Senha configurada' : oauthProvider ? `Acesso via ${oauthProvider}` : 'Senha não configurada'}
          </li>
          <li>
            <span className={styles.checkNeutral} aria-hidden="true"><PhXCircleIcon /></span>
            Verificação em duas etapas não configurada
          </li>
        </ul>
      </section>

      <section className={groups.group} aria-label="Acesso">
        <h2 className={groups.groupLabel}>Acesso</h2>
        <div className={groups.list}>
          <section className={cx(groups.row, styles.staticRow)} aria-label="Alterar senha">
            <IconBox><PhLockKeyIcon /></IconBox>
            <span className={groups.rowText}>
              <span className={groups.rowTitle}>Alterar senha</span>
              <span className={cx(groups.rowSubtitle, styles.wrap)}>
                {hasPasswordIdentity
                  ? 'Enviaremos um link seguro para o seu e-mail.'
                  : oauthProvider
                    ? `Você entra com sua conta ${oauthProvider}. A senha é gerenciada por lá.`
                    : 'Não foi possível determinar como você entra na conta.'}
              </span>
            </span>
          </section>
          {hasPasswordIdentity ? (
            <div className={styles.inset}>
              <OutlineButton
                variant="secondary"
                disabled={isRequestingReset}
                onClick={handleRequestPasswordReset}
              >
                {isRequestingReset ? 'Enviando…' : 'Enviar link de redefinição'}
              </OutlineButton>
              {resetFeedback ? (
                <p
                  className={resetFeedback.tone === 'alert' ? styles.errorBanner : styles.successBanner}
                  role={resetFeedback.tone === 'alert' ? 'alert' : 'status'}
                >
                  {resetFeedback.message}
                </p>
              ) : null}
            </div>
          ) : null}

          <section className={cx(groups.row, styles.staticRow)} aria-label="Verificação em duas etapas">
            <IconBox><PhShieldCheckIcon /></IconBox>
            <span className={groups.rowText}>
              <span className={cx(groups.rowTitle, styles.wrap)}>Verificação em duas etapas</span>
              <span className={cx(groups.rowSubtitle, styles.wrap)}>Estará disponível em uma futura versão.</span>
            </span>
            <span className={cx(groups.pill, groups.pillMuted)}>Não configurada</span>
          </section>
        </div>
      </section>

      <section className={groups.group} aria-label="Seus aparelhos">
        <h2 className={groups.groupLabel}>Seus aparelhos</h2>
        <div className={groups.list}>
          <div className={cx(groups.row, styles.staticRow)}>
            <IconBox><PhDeviceMobileIcon /></IconBox>
            <span className={groups.rowText}>
              <span className={groups.rowTitle}>Aparelhos conectados</span>
              <span className={cx(groups.rowSubtitle, styles.wrap)}>Aparelhos onde sua conta está conectada.</span>
            </span>
          </div>
        </div>
        <p className={styles.emptyState}>Informações de aparelhos ainda não estão disponíveis nesta versão.</p>
      </section>

      <section className={groups.group} aria-label="Atividade recente">
        <h2 className={groups.groupLabel}>Atividade recente</h2>
        <div className={groups.list}>
          <div className={cx(groups.row, styles.staticRow)}>
            <IconBox><PhClockCounterClockwiseIcon /></IconBox>
            <span className={groups.rowText}>
              <span className={groups.rowTitle}>Últimos acessos</span>
              <span className={cx(groups.rowSubtitle, styles.wrap)}>
                {lastSignInAt ? `Último acesso: ${lastSignInAt}` : 'Veja os últimos acessos à sua conta.'}
              </span>
            </span>
          </div>
        </div>
        <p className={styles.emptyState}>Não há mais detalhes de atividade disponíveis nesta versão.</p>
      </section>

      <section className={groups.group} aria-label="Recuperação da conta">
        <h2 className={groups.groupLabel}>Recuperação da conta</h2>
        <div className={groups.list}>
          <div className={cx(groups.row, styles.staticRow)}>
            <IconBox><PhEnvelopeSimpleIcon /></IconBox>
            <span className={groups.rowText}>
              <span className={groups.rowSubtitle}>E-mail de recuperação</span>
              <strong className={styles.recoveryValue}>{user?.email || 'Ainda não definido'}</strong>
            </span>
            {isEmailVerified ? <span className={cx(groups.pill, groups.pillGreen)}>Verificado</span> : null}
          </div>
          <div className={cx(groups.row, styles.staticRow)}>
            <IconBox><PhPhoneIcon /></IconBox>
            <span className={groups.rowText}>
              <span className={groups.rowSubtitle}>Telefone de recuperação</span>
              <strong className={styles.recoveryValue}>{phone || 'Ainda não definido'}</strong>
            </span>
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

      <section className={styles.criticalCard} aria-label="Encerrar sessões">
        <div className={styles.criticalTop}>
          <IconBox className={styles.criticalIcon}><PhWarningIcon /></IconBox>
          <span className={groups.rowText}>
            <span className={cx(groups.rowTitle, styles.criticalTitle)}>Encerrar todas as sessões</span>
            <span className={cx(groups.rowSubtitle, styles.wrap)}>
              Se perdeu seu celular ou acredita que alguém entrou na sua conta, use esta opção.
              Isso também encerra sua sessão aqui. Você precisará entrar novamente.
            </span>
          </span>
        </div>
        <OutlineButton variant="secondary" className={styles.criticalButton} onClick={() => setShowEndSessionsConfirm(true)}>
          Encerrar todas as sessões
        </OutlineButton>
      </section>

      <section className={groups.group} aria-label="Ajuda">
        <div className={groups.list}>
          <div className={cx(groups.row, styles.staticRow)}>
            <IconBox><PhHeadsetIcon /></IconBox>
            <span className={groups.rowText}>
              <strong className={groups.rowTitle}>Ajuda</strong>
              <span className={cx(groups.rowSubtitle, styles.wrap)}>Precisa de ajuda com a segurança da sua conta? Fale com o nosso suporte.</span>
            </span>
            <OutlineButton
              variant="secondary"
              onClick={() => navigate(ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.SUPPORT].path)}
            >
              Ajuda
            </OutlineButton>
          </div>
        </div>
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
