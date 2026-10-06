import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { getSubscription, listPayments } from '../../services/billingService.js';
import { formatCurrency } from '../../utils/formatters.js';
import Badge from '../../components/ui/Badge/Badge.jsx';
import Button from '../../components/ui/Button/Button.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import {
  formatPlanPrice,
  PERSONAL_PLAN_PRICE_LABEL,
  PERSONAL_PLAN_PRICE_PERIOD,
} from '../personal-plan/personalPlanConfig.js';
import { ACCOUNT_SUBROUTES, ACCOUNT_SUBROUTE_IDS } from './simplifiedAccountRoutes.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import {
  formatDate,
  resolveCancelEffectiveAt,
  resolvePaymentMethodLabel,
  resolvePlanState,
  resolveRenewsAt,
} from './subscriptionPresentation.js';
import { resolvePaymentStatusLabel, resolvePaymentStatusTone } from './paymentPresentation.js';
import {
  AlertTriangleIcon,
  CalendarIcon,
  CardIcon,
  CheckIcon,
  CrownIcon,
  HeadsetIcon,
  InfoIcon,
  ReceiptIcon,
  XCircleIcon,
} from './SimplifiedIcons.jsx';
import styles from './simplifiedPayments.module.css';

const HISTORY_SUMMARY_LIMIT = 3;

function BackIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M20 6 10 16l10 10" />
    </svg>
  );
}

/**
 * Correção (Bloco Saldo + Cobrança): esta tela agora lê a MESMA fonte que
 * "Seu plano" (billingService.getSubscription() -> billing-get-subscription,
 * já testado) e reaproveita o mesmo mapeamento de estado
 * (subscriptionPresentation.js) -- antes lia getWorkspaceSubscriptionAny()
 * (leitura direta da tabela) com seu próprio mapeamento incompleto (não
 * distinguia 'pending'/'suspended', ambos caíam em "Expirado"), podendo
 * divergir de "Seu plano" para o MESMO workspace. `billing_payments`
 * (histórico real de cobranças) segue fora de escopo deste bloco --
 * BLOCO FINAL DO MVP (Histórico de pagamentos): "Histórico de pagamentos"
 * agora mostra um resumo real (billingService.listPayments(), mesma
 * leitura RLS de billing_payments usada por SimplifiedPaymentHistoryPage.jsx)
 * -- nunca um pagamento fictício, nunca inventado quando vazio.
 */
function SimplifiedPaymentsPage() {
  const navigate = useNavigate();
  const { workspace } = useSession();
  const workspaceId = workspace?.id;

  const [subscription, setSubscription] = useState(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState(null);
  const [payments, setPayments] = useState([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(true);
  const [paymentsError, setPaymentsError] = useState(null);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    let isActive = true;
    // Mesmo padrao de deferimento via setTimeout(0) usado por
    // useTransactions.js/SimplifiedPlanPage.jsx -- evita disparar setState
    // sincrono direto no corpo do efeito.
    const timeoutId = window.setTimeout(() => {
      if (!workspaceId) {
        setIsLoadingSubscription(false);
        setIsLoadingPayments(false);
        return;
      }
      setIsLoadingSubscription(true);
      setIsLoadingPayments(true);
      getSubscription({ workspaceId }).then((result) => {
        if (!isActive) return;
        setSubscription(result.data ?? null);
        setSubscriptionError(result.error ?? null);
        setIsLoadingSubscription(false);
      });
      listPayments({ workspaceId, limit: HISTORY_SUMMARY_LIMIT }).then((result) => {
        if (!isActive) return;
        setPayments(result.data ?? []);
        setPaymentsError(result.error ?? null);
        setIsLoadingPayments(false);
      });
    }, 0);
    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [workspaceId]);

  const planState = resolvePlanState(subscription);
  const renewsAt = resolveRenewsAt(subscription, planState);
  const cancelEffectiveAt = resolveCancelEffectiveAt(subscription, planState);
  const paymentMethodLabel = resolvePaymentMethodLabel(subscription?.payment_method);

  const canManageOrCancel = ['active', 'cancel_scheduled', 'trialing', 'past_due'].includes(planState.status);

  const overviewNote = planState.status === 'active'
    ? 'Sua assinatura está ativa e você tem todos os benefícios liberados.'
    : planState.status === 'cancel_scheduled'
      ? 'Sua assinatura foi cancelada e continua ativa até o fim do período já pago.'
      : planState.status === 'trialing'
        ? 'Você está no período de teste do Plano Pessoal.'
        : planState.status === 'pending'
          ? 'Assinatura criada, aguardando confirmação do pagamento.'
          : planState.status === 'past_due'
            ? 'Regularize seu pagamento para continuar usando todos os recursos.'
            : planState.status === 'suspended'
              ? 'Seu acesso está suspenso por falta de pagamento. Fale com a Uni para regularizar.'
              : planState.status === 'canceled'
                ? 'Sua assinatura foi cancelada.'
                : planState.status === 'expired'
                  ? 'Sua assinatura expirou.'
                  : 'Você ainda não possui uma assinatura ativa.';

  return (
    <div className={styles.page} data-simplified-payments>
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
          <h1>Pagamento e assinatura</h1>
        </div>
        <button
          type="button"
          className={styles.helpButton}
          onClick={() => navigate(ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.SUPPORT].path)}
        >
          <span className={styles.helpIcon} aria-hidden="true"><HeadsetIcon /></span>
          Ajuda
        </button>
      </header>

      {isLoadingSubscription ? (
        <p className={styles.loadingState}>Carregando informações da sua assinatura...</p>
      ) : subscriptionError ? (
        <p className={styles.errorBanner} role="alert">Não foi possível carregar sua assinatura agora. Tente novamente.</p>
      ) : (
        <section className={styles.planCard} aria-label="Plano Pessoal">
          <div className={styles.planTop}>
            <span className={styles.planIcon} aria-hidden="true"><CrownIcon /></span>
            <div className={styles.planInfo}>
              <strong>{subscription?.plan_name ?? 'Plano Pessoal'}</strong>
              <small>Plano mensal</small>
              <span className={styles.priceRow}>
                <strong>{formatPlanPrice(subscription?.value) || PERSONAL_PLAN_PRICE_LABEL}</strong>
                <small>{PERSONAL_PLAN_PRICE_PERIOD}</small>
              </span>
            </div>
            <Badge
              variant={planState.tone === 'ok' ? 'success' : planState.tone === 'warn' ? 'warning' : planState.tone === 'danger' ? 'danger' : 'default'}
              size="sm"
            >
              {planState.label}
            </Badge>
          </div>

          <div className={styles.overviewRow}>
            {renewsAt ? (
              <div className={styles.overviewTile}>
                <span className={styles.overviewIcon} aria-hidden="true"><CalendarIcon /></span>
                <div>
                  <small>Próxima renovação</small>
                  <strong>{formatDate(renewsAt)}</strong>
                </div>
              </div>
            ) : cancelEffectiveAt ? (
              <div className={styles.overviewTile}>
                <span className={styles.overviewIcon} aria-hidden="true"><CalendarIcon /></span>
                <div>
                  <small>Acesso disponível até</small>
                  <strong>{formatDate(cancelEffectiveAt)}</strong>
                </div>
              </div>
            ) : null}
            <div className={styles.overviewTile}>
              <span className={`${styles.overviewIcon} ${styles[`tone_${planState.tone}`]}`} aria-hidden="true">
                {planState.tone === 'danger' ? <XCircleIcon />
                  : planState.tone === 'warn' ? <AlertTriangleIcon />
                    : planState.tone === 'neutral' ? <InfoIcon />
                      : <CheckIcon />}
              </span>
              <p>{overviewNote}</p>
            </div>
          </div>

          <Button
            type="button"
            variant="primary"
            fullWidth
            onClick={() => setShowManageModal(true)}
          >
            Gerenciar assinatura
          </Button>
        </section>
      )}

      <section className={styles.card} aria-label="Forma de pagamento">
        <div className={styles.cardHeaderRow}>
          <span className={styles.cardHeaderIcon} aria-hidden="true"><CardIcon /></span>
          <h2>Forma de pagamento</h2>
        </div>
        {paymentMethodLabel ? (
          <p className={styles.emptyState}>{paymentMethodLabel}</p>
        ) : (
          <p className={styles.emptyState}>Forma de pagamento ainda não configurada.</p>
        )}
      </section>

      {/* Correção (Bloco Cobrança + Histórico): cancel_scheduled NUNCA usa o
          rótulo "Próxima cobrança" para a data de encerramento -- não há
          nenhuma cobrança futura real quando o cancelamento já está
          agendado (cancel_at_period_end=true). */}
      <section className={styles.card} aria-label={renewsAt ? 'Próxima cobrança' : cancelEffectiveAt ? 'Acesso disponível até' : 'Próxima cobrança'}>
        <div className={styles.cardHeaderRow}>
          <span className={styles.cardHeaderIcon} aria-hidden="true"><CalendarIcon /></span>
          <h2>{renewsAt ? 'Próxima cobrança' : cancelEffectiveAt ? 'Acesso disponível até' : 'Próxima cobrança'}</h2>
        </div>
        {renewsAt ? (
          <div className={styles.chargeRow}>
            <span className={styles.chargeIcon} aria-hidden="true"><CalendarIcon /></span>
            <div className={styles.chargeInfo}>
              <strong>{formatDate(renewsAt)}</strong>
              {paymentMethodLabel ? <small>{paymentMethodLabel}</small> : null}
            </div>
            <span className={styles.chargePrice}>{formatPlanPrice(subscription?.value) || PERSONAL_PLAN_PRICE_LABEL}</span>
          </div>
        ) : cancelEffectiveAt ? (
          <div className={styles.chargeRow}>
            <span className={styles.chargeIcon} aria-hidden="true"><CalendarIcon /></span>
            <div className={styles.chargeInfo}>
              <strong>{formatDate(cancelEffectiveAt)}</strong>
              <small>Cancelamento agendado -- não haverá nova cobrança.</small>
            </div>
          </div>
        ) : (
          <p className={styles.emptyState}>Nenhuma próxima cobrança disponível.</p>
        )}
      </section>

      <section className={styles.card} aria-label="Histórico de pagamentos">
        <div className={styles.cardHeaderRow}>
          <span className={styles.cardHeaderIcon} aria-hidden="true"><ReceiptIcon /></span>
          <h2>Histórico de pagamentos</h2>
        </div>
        {isLoadingPayments ? (
          <p className={styles.emptyState}>Carregando pagamentos...</p>
        ) : paymentsError ? (
          <p className={styles.errorBanner} role="alert">Não foi possível carregar os dados de pagamento. Tente novamente.</p>
        ) : payments.length === 0 ? (
          <p className={styles.emptyState}>Nenhum pagamento disponível.</p>
        ) : (
          <div className={styles.historySummaryList}>
            {payments.map((payment) => (
              <div key={payment.id} className={styles.historySummaryRow}>
                <span>{payment.due_date ? formatDate(payment.due_date) : formatDate(payment.created_at)}</span>
                <span className={`${styles.historySummaryStatus} ${styles[`tone_${resolvePaymentStatusTone(payment.status)}`]}`}>
                  {resolvePaymentStatusLabel(payment.status)}
                </span>
                <span className={styles.historySummaryValue}>{formatCurrency(payment.value)}</span>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          className={styles.historyLink}
          onClick={() => navigate(ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PAYMENT_HISTORY].path)}
        >
          Ver histórico completo
        </button>
      </section>

      {canManageOrCancel ? (
        <section className={`${styles.card} ${styles.criticalCard}`} aria-label="Cancelar assinatura">
          <span className={styles.criticalIcon} aria-hidden="true"><XCircleIcon /></span>
          <div className={styles.criticalText}>
            <strong>Cancelar assinatura</strong>
            <p>Você pode solicitar o cancelamento da sua assinatura.</p>
          </div>
          <Button type="button" variant="danger" onClick={() => setShowCancelModal(true)}>
            Cancelar assinatura
          </Button>
        </section>
      ) : null}

      <Modal
        open={showManageModal}
        onClose={() => setShowManageModal(false)}
        title="Gerenciar assinatura"
        description="A gestão completa da assinatura (alterar forma de pagamento, ver faturas ou trocar de plano) será disponibilizada após a integração de pagamento estar concluída."
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={() => { setShowManageModal(false); navigate(SIMPLIFIED_ROUTES.UNI); }}>
              Falar com a Uni
            </Button>
            <Button type="button" variant="primary" onClick={() => setShowManageModal(false)}>
              Entendi
            </Button>
          </>
        )}
      />

      <Modal
        open={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancelar assinatura?"
        description="O cancelamento automático ainda não está disponível nesta versão. Nenhuma alteração foi feita na sua assinatura. Fale com a Uni ou nosso suporte para pedir ajuda com o cancelamento."
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={() => setShowCancelModal(false)}>
              Manter assinatura
            </Button>
            <Button type="button" variant="danger" onClick={() => { setShowCancelModal(false); navigate(SIMPLIFIED_ROUTES.UNI); }}>
              Falar com a Uni
            </Button>
          </>
        )}
      />
    </div>
  );
}

export default SimplifiedPaymentsPage;
