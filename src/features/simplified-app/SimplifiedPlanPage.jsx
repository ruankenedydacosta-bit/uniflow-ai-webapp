import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { useTransactions } from '../../hooks/index.js';
import { cancelSubscription, changePlan, getSubscription } from '../../services/billingService.js';
import { getMyVoiceBalance } from '../../services/voiceQuotaService.js';
import Badge from '../../components/ui/Badge/Badge.jsx';
import Button from '../../components/ui/Button/Button.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import {
  formatPlanPrice,
  PERSONAL_PLAN_PRICE_LABEL,
  PERSONAL_PLAN_PRICE_PERIOD,
  PERSONAL_PLAN_ROUTE,
  PERSONAL_PLAN_TIERS,
} from '../personal-plan/personalPlanConfig.js';
import { describePlanChange, describeVoiceBalance } from './planChangePresentation.js';
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
  // Épico #116: minutos de voz do ciclo e troca entre os três planos.
  const [voiceBalance, setVoiceBalance] = useState(null);
  const [showChangePlanModal, setShowChangePlanModal] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState(null);
  const [isChangingPlan, setIsChangingPlan] = useState(false);
  const [changePlanError, setChangePlanError] = useState(null);
  const [upgradePix, setUpgradePix] = useState(null);

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
    getMyVoiceBalance().then(({ data }) => setVoiceBalance(data ?? null));
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
  // Plano manual (concedido pela equipe) não tem cobrança: nada a cancelar
  // nem a trocar pelo app.
  const isManualPlan = subscription?.source === 'manual';
  const canCancel = planState.status === 'active' && !isManualPlan;

  const usageMessage = isLoadingTransactions
    ? 'Calculando...'
    : monthlyCount > 0
      ? `Você organizou ${monthlyCount} ${monthlyCount === 1 ? 'registro' : 'registros'} este mês usando a UniFlow.`
      : 'Continue usando a UniFlow para acompanhar os benefícios do seu plano.';

  const currentTierId = subscription?.tier_id ?? null;
  const planChange = selectedTierId && currentTierId
    ? describePlanChange({ currentTierId, targetTierId: selectedTierId, renewsAt })
    : null;
  const voiceBalanceText = planState.status === 'active' ? describeVoiceBalance(voiceBalance) : null;

  function handleOpenChangePlan() {
    if (isManualPlan) {
      setShowManageModal(true);
      return;
    }
    if (planState.status !== 'active' || !currentTierId) {
      navigate(PERSONAL_PLAN_ROUTE);
      return;
    }
    setSelectedTierId(subscription?.pending_tier_id ?? currentTierId);
    setChangePlanError(null);
    setUpgradePix(null);
    setShowChangePlanModal(true);
  }

  function handleCloseChangePlan() {
    if (isChangingPlan) return;
    setShowChangePlanModal(false);
    setUpgradePix(null);
    loadSubscription();
  }

  async function handleConfirmChangePlan() {
    if (!selectedTierId) return;
    setIsChangingPlan(true);
    setChangePlanError(null);
    const { data, error } = await changePlan({ workspaceId, tierId: selectedTierId });
    setIsChangingPlan(false);
    if (error) {
      setChangePlanError('Não foi possível trocar de plano agora. Tente novamente em instantes.');
      return;
    }
    if (data?.kind === 'upgrade' && data.pix) {
      setUpgradePix(data.pix);
      return;
    }
    setShowChangePlanModal(false);
    loadSubscription();
  }

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

          <div className={styles.planTop}>
            <span className={styles.planIcon} aria-hidden="true"><CrownIcon /></span>
            <div className={styles.planInfo}>
              <strong>{subscription?.plan_name ?? 'Plano Pessoal'}</strong>
              <Badge
                variant={planState.tone === 'ok' ? 'success' : planState.tone === 'warn' ? 'warning' : planState.tone === 'danger' ? 'danger' : 'default'}
                size="sm"
              >
                {planState.label}
              </Badge>
            </div>
            <div className={styles.planPrice}>
              <strong>{formatPlanPrice(subscription?.value) || PERSONAL_PLAN_PRICE_LABEL}</strong>
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
          {isManualPlan && planState.status === 'active' ? (
            <p className={styles.hint}>
              {subscription?.current_period_ends_at
                ? `Plano liberado pela equipe da UniFlow até ${formatDate(subscription.current_period_ends_at)}. Não há cobrança.`
                : 'Plano liberado pela equipe da UniFlow. Não há cobrança.'}
            </p>
          ) : null}
          {planState.status === 'cancel_scheduled' ? (
            <p className={styles.hint}>Seu acesso continua ativo até a data acima. Não haverá nova cobrança.</p>
          ) : null}
          {subscription?.pending_tier_name && planState.status === 'active' ? (
            <p className={styles.hint}>
              {renewsAt
                ? `A partir de ${formatDate(renewsAt)}, seu plano passa a ser ${subscription.pending_tier_name}.`
                : `Na próxima cobrança, seu plano passa a ser ${subscription.pending_tier_name}.`}
            </p>
          ) : null}
        </section>
      )}

      {voiceBalanceText ? (
        <section className={styles.card} aria-label="Conversa por voz">
          <span className={`${styles.cardIcon} ${styles.toneBlue}`} aria-hidden="true"><MicIcon /></span>
          <div className={styles.cardText}>
            <strong>Conversa por voz</strong>
            <p>{voiceBalanceText}</p>
          </div>
        </section>
      ) : null}

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
          onClick={handleOpenChangePlan}
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
        description={isManualPlan
          ? 'Seu plano foi liberado pela equipe da UniFlow e não gera cobrança. Para trocar ou encerrar, fale com o suporte.'
          : canCancel
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
        open={showChangePlanModal}
        onClose={handleCloseChangePlan}
        title="Trocar de plano"
        description={upgradePix
          ? 'Pague o Pix abaixo. Os minutos do novo plano entram assim que o pagamento for confirmado.'
          : 'Escolha o plano. Registrar por texto não tem limite em nenhum deles.'}
        footer={upgradePix ? (
          <Button type="button" variant="primary" onClick={handleCloseChangePlan}>Fechar</Button>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={handleCloseChangePlan} disabled={isChangingPlan}>
              Voltar
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={isChangingPlan}
              disabled={!planChange || (planChange.kind === 'same' && !subscription?.pending_tier_id)}
              onClick={handleConfirmChangePlan}
            >
              {planChange?.kind === 'same' && subscription?.pending_tier_id ? 'Manter o plano atual' : planChange?.confirmLabel ?? 'Trocar'}
            </Button>
          </>
        )}
      >
        {upgradePix ? (
          <div className={styles.upgradePix}>
            <img src={`data:image/png;base64,${upgradePix.encoded_image}`} alt="QR Code Pix da diferença" width="200" height="200" />
            <p className={styles.hint}>Ou copie o código Pix:</p>
            <code className={styles.upgradePixCode}>{upgradePix.payload}</code>
          </div>
        ) : (
          <fieldset className={styles.tierOptions} disabled={isChangingPlan}>
            <legend className="uf-sr-only">Planos</legend>
            {PERSONAL_PLAN_TIERS.map((tier) => (
              <label key={tier.id} className={styles.tierOption} data-selected={selectedTierId === tier.id}>
                <input
                  type="radio"
                  name="change-plan-tier"
                  value={tier.id}
                  checked={selectedTierId === tier.id}
                  onChange={() => setSelectedTierId(tier.id)}
                />
                <span className={styles.tierOptionText}>
                  <strong>{tier.name}{tier.id === currentTierId ? ' (plano atual)' : ''}</strong>
                  <small>{tier.priceLabel}{PERSONAL_PLAN_PRICE_PERIOD} · {tier.voiceMinutesLabel}</small>
                </span>
              </label>
            ))}
            {planChange ? <p className={styles.hint}>{planChange.text}</p> : null}
          </fieldset>
        )}
        {changePlanError ? <p className={styles.errorBanner} role="alert">{changePlanError}</p> : null}
      </Modal>

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
