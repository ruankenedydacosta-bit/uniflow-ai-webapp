import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { listPayments } from '../../services/billingService.js';
import { safeAsaasUrl } from '../../utils/asaasUrls.js';
import { formatCurrency } from '../../utils/formatters.js';
import { ACCOUNT_SUBROUTES, ACCOUNT_SUBROUTE_IDS } from './simplifiedAccountRoutes.js';
import { formatDate, resolvePaymentMethodLabel } from './subscriptionPresentation.js';
import { PAYMENT_DESCRIPTION, resolvePaymentStatusLabel, resolvePaymentStatusTone } from './paymentPresentation.js';
import { HeadsetIcon, ReceiptIcon } from './SimplifiedIcons.jsx';
import styles from './simplifiedPaymentHistory.module.css';

function BackIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M20 6 10 16l10 10" />
    </svg>
  );
}

// BLOCO FINAL DO MVP (Histórico de pagamentos): tela real única -- serve
// tanto "Ver histórico de pagamentos" (Seu plano) quanto "Notas fiscais e
// recibos" (mesmo link, mesmos dados: cada item já traz seu próprio
// comprovante via invoice_url quando existe). Fonte: billingService.listPayments()
// -> leitura RLS direta de billing_payments (espelhado da Asaas pelo
// webhook) -- nunca a Asaas diretamente, nunca um dado inventado.
function SimplifiedPaymentHistoryPage() {
  const navigate = useNavigate();
  const { workspace } = useSession();
  const workspaceId = workspace?.id;

  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isActive = true;
    // Mesmo padrao de deferimento via setTimeout(0) usado pelas demais
    // telas de assinatura (SimplifiedPlanPage.jsx/SimplifiedPaymentsPage.jsx).
    const timeoutId = window.setTimeout(() => {
      if (!workspaceId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      listPayments({ workspaceId }).then((result) => {
        if (!isActive) return;
        setPayments(result.data ?? []);
        setError(result.error ?? null);
        setIsLoading(false);
      });
    }, 0);
    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [workspaceId]);

  return (
    <div className={styles.page} data-simplified-payment-history>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate(ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PAYMENTS].path)}
            aria-label="Voltar para Pagamento e assinatura"
          >
            <BackIcon />
          </button>
          <h1>Histórico de pagamentos</h1>
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

      {isLoading ? (
        <p className={styles.loadingState}>Carregando pagamentos...</p>
      ) : error ? (
        <p className={styles.errorBanner} role="alert">Não foi possível carregar os dados de pagamento. Tente novamente.</p>
      ) : payments.length === 0 ? (
        <section className={styles.card} aria-label="Histórico de pagamentos">
          <div className={styles.cardHeaderRow}>
            <span className={styles.cardHeaderIcon} aria-hidden="true"><ReceiptIcon /></span>
            <h2>Pagamentos</h2>
          </div>
          <p className={styles.emptyState}>Nenhum pagamento disponível.</p>
        </section>
      ) : (
        <div className={styles.list}>
          {payments.map((payment) => {
            const statusLabel = resolvePaymentStatusLabel(payment.status);
            const tone = resolvePaymentStatusTone(payment.status);
            const methodLabel = resolvePaymentMethodLabel(payment.billing_type);
            return (
              <section key={payment.id} className={styles.paymentCard} aria-label={PAYMENT_DESCRIPTION}>
                <div className={styles.paymentTop}>
                  <div>
                    <strong>{PAYMENT_DESCRIPTION}</strong>
                    {payment.due_date ? <small>Vencimento {formatDate(payment.due_date)}</small> : null}
                  </div>
                  <span className={`${styles.statusBadge} ${styles[`tone_${tone}`]}`}>{statusLabel}</span>
                </div>
                <div className={styles.paymentDetails}>
                  <span className={styles.paymentValue}>{formatCurrency(payment.value)}</span>
                  {methodLabel ? <span>{methodLabel}</span> : null}
                  {payment.paid_at ? <span>Confirmado em {formatDate(payment.paid_at)}</span> : null}
                </div>
                {safeAsaasUrl(payment.invoice_url) ? (
                  <a
                    className={styles.receiptLink}
                    href={safeAsaasUrl(payment.invoice_url)}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Ver comprovante
                  </a>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SimplifiedPaymentHistoryPage;
