import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { pixAutomaticMessage } from '../personal-plan/pixAutomaticPresentation.js';
import { useTransactions } from '../../hooks/index.js';
import { cancelSubscription, getSubscription } from '../../services/billingService.js';
import Badge from '../../components/ui/Badge/Badge.jsx';
import Button from '../../components/ui/Button/Button.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import {
  PERSONAL_PLAN_PRICE_LABEL,
  PERSONAL_PLAN_PRICE_PERIOD,
  PERSONAL_PLAN_ROUTE,
} from '../personal-plan/personalPlanConfig.js';
import { ACCOUNT_SUBROUTES, ACCOUNT_SUBROUTE_IDS } from './simplifiedAccountRoutes.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import {
  formatDate,
  resolveCancelEffectiveAt,
  resolvePlanState,
  resolveRenewsAt,
  resolveTrialEndsAt,
} from './subscriptionPresentation.js';
import {
  AlertTriangleIcon,
  CalendarIcon,
  CardIcon,
  CheckIcon,
  CrownIcon,
  InfoIcon,
  ListIcon,
  MicIcon,
  PieChartIcon,
  ReceiptIcon,
  SavingsIcon,
  XCircleIcon,
} from './SimplifiedIcons.jsx';
import styles from './simplifiedPlan.module.css';

function BackIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M20 6 10 16l10 10" />
    </svg>
  );
}

function firstDayOfMonthISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function SimplifiedPlanPage() {
  const navigate = useNavigate();
  const { workspace } = useSession();
  const workspaceId = workspace?.id;

  const [subscription, setSubscription] = useState(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState(null);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  const loadSubscription = useCallback(() => {
    if (!workspaceId) {
      setIsLoadingSubscription(false);
      return;
    }
    setIsLoadingSubscription(true);
    getSubscription({ workspaceId }).then(({ data, error }) => {
      setSubscription(data ?? null);
      setSubscriptionError(error ?? null);
      setIsLoadingSubscription(false);
    });
  }, [workspaceId]);

  useEffect(() => {
    let isActive = true;
    // Mesmo padrao de deferimento via setTimeout(0) usado por
    // useTransactions.js -- evita disparar setState sincrono direto no
    // corpo do efeito.
    const timeoutId = window.setTimeout(() => {
      if (!isActive) return;
      loadSubscription();
    }, 0);
    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [loadSubscription]);

  const dateFrom = useMemo(() => firstDayOfMonthISO(), []);
  const dateTo = useMemo(() => todayISO(), []);
  const { transactions, isLoading: isLoadingTransactions } = useTransactions({
    workspaceId,
    dateFrom,
    dateTo,
  });
  const monthlyCount = transactions.length;

  const planState = useMemo(() => resolvePlanState(subscription), [subscription]);

  const renewsAt = resolveRenewsAt(subscription, planState);
  const cancelEffectiveAt = resolveCancelEffectiveAt(subscription, planState);
  const trialEndsAt = resolveTrialEndsAt(subscription, planState);
  const canCancel = ['active', 'trialing', 'past_due', 'suspended'].includes(planState.status);

  const usageMessage = isLoadingTransactions
    ? 'Calculando...'
    : monthlyCount > 0
      ? `Você organizou ${monthlyCount} ${monthlyCount === 1 ? 'registro' : 'registros'} este mês usando a UniFlow.`
      : 'Continue usando a UniFlow para acompanhar os benefícios do seu plano.';

  async function handleConfirmCancel() {
    setIsCancelling(true);
    setCancelError(null);
    const { error } = await cancelSubscription({ workspaceId });
    setIsCancelling(false);
    if (error) {
      setCancelError('Não foi possível cancelar agora. Tente novamente em instantes.');
      return;
    }
    setShowCancelModal(false);
    loadSubscription();
  }

  return (
    <div className={styles.page} data-simplified-plan>
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
          <h1>Seu plano</h1>
        </div>
        <button type="button" className={styles.talkButton} onClick={() => navigate(SIMPLIFIED_ROUTES.UNI)}>
          <span className={styles.talkIcon} aria-hidden="true"><MicIcon /></span>
          Falar com a Uni
        </button>
      </header>

      {isLoadingSubscription ? (
        <p className={styles.loadingState}>Carregando informações do seu plano...</p>
      ) : subscriptionError ? (
        <p className={styles.errorBanner} role="alert">Não foi possível carregar seu plano agora. Tente novamente.</p>
      ) : (
        <section className={`${styles.planCard} ${styles[`tone_${planState.tone}`]}`} aria-label="Plano Pessoal">
          <div className={styles.statusRow}>
            <span className={styles.statusIcon} aria-hidden="true">
              {planState.tone === 'danger' ? <XCircleIcon />
                : planState.tone === 'warn' ? <AlertTriangleIcon />
                  : planState.tone === 'neutral' ? <InfoIcon />
                    : <CheckIcon />}
            </span>
            <strong>{planState.label}</strong>
          </div>
          {subscription?.pix_automatic ? <p role="status">{pixAutomaticMessage(subscription.pix_automatic)}</p> : null}

          <div className={styles.planTop}>
            <span className={styles.planIcon} aria-hidden="true"><CrownIcon /></span>
            <div className={styles.planInfo}>
              <strong>Plano Pessoal</strong>
              <Badge
                variant={planState.tone === 'ok' ? 'success' : planState.tone === 'warn' ? 'warning' : planState.tone === 'danger' ? 'danger' : 'default'}
                size="sm"
              >
                {planState.label}
              </Badge>
            </div>
            <div className={styles.planPrice}>
              <strong>{PERSONAL_PLAN_PRICE_LABEL}</strong>
              <small>{PERSONAL_PLAN_PRICE_PERIOD}</small>
            </div>
          </div>

          {(renewsAt || cancelEffectiveAt || trialEndsAt) ? (
            <div className={styles.infoGrid}>
              {renewsAt ? (
                <div className={styles.infoTile}>
                  <span className={styles.infoIcon} aria-hidden="true"><CalendarIcon /></span>
                  <small>Renova em</small>
                  <strong>{formatDate(renewsAt)}</strong>
                </div>
              ) : null}
              {cancelEffectiveAt ? (
                <div className={styles.infoTile}>
                  <span className={styles.infoIcon} aria-hidden="true"><CalendarIcon /></span>
                  <small>Acesso até</small>
                  <strong>{formatDate(cancelEffectiveAt)}</strong>
                </div>
              ) : null}
              {trialEndsAt ? (
                <div className={styles.infoTile}>
                  <span className={styles.infoIcon} aria-hidden="true"><CalendarIcon /></span>
                  <small>Teste encerra em</small>
                  <strong>{formatDate(trialEndsAt)}</strong>
                </div>
              ) : null}
            </div>
          ) : null}

          {planState.status === 'not_configured' ? (
            <p className={styles.hint}>Você ainda não possui uma assinatura ativa.</p>
          ) : null}
          {planState.status === 'pending' ? (
            <p className={styles.hint}>Assinatura criada, aguardando confirmação do pagamento Pix.</p>
          ) : null}
          {planState.status === 'past_due' ? (
            <p className={styles.hint}>Regularize seu pagamento em até 3 dias para evitar a suspensão do acesso.</p>
          ) : null}
          {planState.status === 'suspended' ? (
            <p className={styles.hint}>Seu acesso ao Plano Pessoal está suspenso por falta de pagamento. Fale com a Uni para regularizar.</p>
          ) : null}
          {planState.status === 'cancel_scheduled' ? (
            <p className={styles.hint}>Seu acesso continua ativo até a data acima. Não haverá nova cobrança.</p>
          ) : null}
        </section>
      )}

      <section className={styles.card} aria-label="Economia gerada pela Uni">
        <span className={`${styles.cardIcon} ${styles.toneGreen}`} aria-hidden="true"><SavingsIcon /></span>
        <div className={styles.cardText}>
          <strong>Economia gerada pela Uni</strong>
          <p>A Uni ainda está reunindo dados suficientes para estimar sua economia.</p>
        </div>
      </section>

      <section className={styles.card} aria-label="Utilização deste mês">
        <span className={`${styles.cardIcon} ${styles.toneBlue}`} aria-hidden="true"><PieChartIcon /></span>
        <div className={styles.cardText}>
          <strong>Utilização deste mês</strong>
          <p>
            {isLoadingTransactions
              ? 'Carregando registros do mês...'
              : `${monthlyCount} ${monthlyCount === 1 ? 'registro financeiro organizado' : 'registros financeiros organizados'} este mês.`}
          </p>
        </div>
      </section>

      <section className={`${styles.card} ${styles.recommendationCard}`} aria-label="A Uni recomenda">
        <span className={styles.helpMascot} aria-hidden="true">🙂</span>
        <div className={styles.cardText}>
          <strong>A Uni recomenda</strong>
          <p>{usageMessage}</p>
        </div>
      </section>

      {planState.status === 'not_configured' || planState.status === 'canceled' || planState.status === 'expired' ? (
        <Button type="button" variant="primary" fullWidth onClick={() => navigate(PERSONAL_PLAN_ROUTE)}>
          Assinar Plano Pessoal
        </Button>
      ) : (
        <Button type="button" variant="primary" fullWidth onClick={() => setShowManageModal(true)}>
          Gerenciar assinatura
        </Button>
      )}

      <div className={styles.quickLinks}>
        <button
          type="button"
          className={styles.quickLink}
          onClick={() => navigate(ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PAYMENT_HISTORY].path)}
        >
          <span className={styles.quickLinkIcon} aria-hidden="true"><CardIcon /></span>
          Ver histórico de pagamentos
        </button>
        <button
          type="button"
          className={styles.quickLink}
          onClick={() => navigate(PERSONAL_PLAN_ROUTE)}
        >
          <span className={styles.quickLinkIcon} aria-hidden="true"><ListIcon /></span>
          Trocar de plano
        </button>
        <button
          type="button"
          className={styles.quickLink}
          onClick={() => navigate(ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PAYMENT_HISTORY].path)}
        >
          <span className={styles.quickLinkIcon} aria-hidden="true"><ReceiptIcon /></span>
          Notas fiscais e recibos
        </button>
        <button
          type="button"
          className={styles.quickLink}
          onClick={() => navigate(SIMPLIFIED_ROUTES.UNI)}
        >
          <span className={styles.quickLinkIcon} aria-hidden="true"><MicIcon /></span>
          Falar com a Uni
        </button>
      </div>

      <Modal
        open={showManageModal}
        onClose={() => setShowManageModal(false)}
        title="Gerenciar assinatura"
        description={canCancel
          ? 'Você pode cancelar sua assinatura. Seu acesso continua até o fim do período já pago.'
          : 'A troca de forma de pagamento e a emissão de faturas ainda não estão disponíveis nesta versão.'}
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={() => { setShowManageModal(false); navigate(SIMPLIFIED_ROUTES.UNI); }}>
              Falar com a Uni
            </Button>
            {canCancel ? (
              <Button
                type="button"
                variant="danger"
                onClick={() => { setShowManageModal(false); setShowCancelModal(true); }}
              >
                Cancelar assinatura
              </Button>
            ) : (
              <Button type="button" variant="primary" onClick={() => setShowManageModal(false)}>
                Entendi
              </Button>
            )}
          </>
        )}
      />

      <Modal
        open={showCancelModal}
        onClose={() => { if (!isCancelling) setShowCancelModal(false); }}
        title="Cancelar assinatura"
        description="Seu acesso ao Plano Pessoal continua funcionando normalmente até o fim do período já pago. Depois disso, não haverá nova cobrança."
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={() => setShowCancelModal(false)} disabled={isCancelling}>
              Manter assinatura
            </Button>
            <Button type="button" variant="danger" loading={isCancelling} onClick={handleConfirmCancel}>
              Confirmar cancelamento
            </Button>
          </>
        )}
      >
        {cancelError ? <p className={styles.errorBanner} role="alert">{cancelError}</p> : null}
      </Modal>
    </div>
  );
}

export default SimplifiedPlanPage;
