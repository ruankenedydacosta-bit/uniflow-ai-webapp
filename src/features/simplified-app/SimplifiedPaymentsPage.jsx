import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { getWorkspaceSubscriptionAny } from '../../services/workspaceService.js';
import Badge from '../../components/ui/Badge/Badge.jsx';
import Button from '../../components/ui/Button/Button.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import {
  PERSONAL_PLAN_PRICE_LABEL,
  PERSONAL_PLAN_PRICE_PERIOD,
} from '../personal-plan/personalPlanConfig.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
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

function BackIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M20 6 10 16l10 10" />
    </svg>
  );
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * ETAPA 4 -- Pagamento e assinatura: esta tela ainda não foi conectada ao
 * billingService (o Bloco Final do MVP conectou apenas PersonalPlanPage.jsx
 * e SimplifiedPlanPage.jsx) -- nenhuma tabela de notas fiscais existe, e
 * `billing_payments` (histórico real de cobranças) ainda não é lida por
 * aqui. Por isso: histórico de pagamentos fica honestamente vazio -- nunca
 * um Visa ou pagamento fictício. O estado do plano reaproveita exatamente a
 * mesma lógica de SimplifiedPlanPage.jsx (mesmos estados reais), duplicada
 * aqui de propósito em vez de extraída para um util compartilhado (decisão
 * original da Etapa 4, mantida) -- esta tela em si não faz parte do escopo
 * do Bloco Final do MVP.
 */
function SimplifiedPaymentsPage() {
  const navigate = useNavigate();
  const { workspace } = useSession();
  const workspaceId = workspace?.id;

  const [subscription, setSubscription] = useState(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState(null);
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
        return;
      }
      setIsLoadingSubscription(true);
      getWorkspaceSubscriptionAny(workspaceId).then((result) => {
        if (!isActive) return;
        setSubscription(result.data ?? null);
        setSubscriptionError(result.error ?? null);
        setIsLoadingSubscription(false);
      });
    }, 0);
    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [workspaceId]);

  let planState;
  if (!subscription) {
    planState = { status: 'not_configured', label: 'Pagamento ainda não configurado', tone: 'neutral' };
  } else if (subscription.status === 'active') {
    planState = { status: 'active', label: 'Ativo', tone: 'ok' };
  } else if (subscription.status === 'trialing') {
    planState = { status: 'trialing', label: 'Período de teste', tone: 'ok' };
  } else if (subscription.status === 'past_due') {
    planState = { status: 'past_due', label: 'Pagamento pendente', tone: 'warn' };
  } else if (subscription.status === 'canceled') {
    planState = { status: 'canceled', label: 'Cancelado', tone: 'danger' };
  } else {
    planState = { status: 'expired', label: 'Expirado', tone: 'danger' };
  }

  const canManageOrCancel = ['active', 'trialing', 'past_due'].includes(planState.status);
  const renewsAt = (planState.status === 'active' || planState.status === 'trialing')
    ? subscription?.current_period_ends_at
    : null;

  const overviewNote = planState.status === 'active'
    ? 'Sua assinatura está ativa e você tem todos os benefícios liberados.'
    : planState.status === 'trialing'
      ? 'Você está no período de teste do Plano Pessoal.'
      : planState.status === 'past_due'
        ? 'Regularize seu pagamento para continuar usando todos os recursos.'
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
        <button type="button" className={styles.helpButton} onClick={() => navigate(SIMPLIFIED_ROUTES.UNI)}>
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
              <strong>Plano Pessoal</strong>
              <small>Plano mensal</small>
              <span className={styles.priceRow}>
                <strong>{PERSONAL_PLAN_PRICE_LABEL}</strong>
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
        <p className={styles.emptyState}>Forma de pagamento ainda não configurada.</p>
      </section>

      <section className={styles.card} aria-label="Próxima cobrança">
        <div className={styles.cardHeaderRow}>
          <span className={styles.cardHeaderIcon} aria-hidden="true"><CalendarIcon /></span>
          <h2>Próxima cobrança</h2>
        </div>
        {renewsAt ? (
          <div className={styles.chargeRow}>
            <span className={styles.chargeIcon} aria-hidden="true"><CalendarIcon /></span>
            <div className={styles.chargeInfo}>
              <strong>{formatDate(renewsAt)}</strong>
              <small>Será cobrado automaticamente, quando o pagamento estiver configurado.</small>
            </div>
            <span className={styles.chargePrice}>{PERSONAL_PLAN_PRICE_LABEL}</span>
          </div>
        ) : (
          <p className={styles.emptyState}>A cobrança será exibida após a configuração do pagamento.</p>
        )}
      </section>

      <section className={styles.card} aria-label="Histórico de pagamentos">
        <div className={styles.cardHeaderRow}>
          <span className={styles.cardHeaderIcon} aria-hidden="true"><ReceiptIcon /></span>
          <h2>Histórico de pagamentos</h2>
        </div>
        <p className={styles.emptyState}>Nenhum pagamento disponível.</p>
        <button type="button" className={styles.disabledLink} disabled>
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
