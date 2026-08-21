import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import { resolvePresentationUserId } from '../presentation';
import { SIMPLIFIED_ROUTES } from '../simplified-app/index.js';
import Button from '../../components/ui/Button/Button.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import { createCheckout, createCustomer, createSubscription, getSubscription } from '../../services/billingService.js';
import { useSubscriptionStatusPolling } from './useSubscriptionStatusPolling.js';
import PlanBenefitIcon from './PlanBenefitIcon.jsx';
import PlanBrandSignature from './PlanBrandHeader.jsx';
import PlanPromotionCard from './PlanPromotionCard.jsx';
import {
  PERSONAL_PLAN_BENEFITS,
  PERSONAL_PLAN_PRICE_LABEL,
  PERSONAL_PLAN_PRICE_PERIOD,
  PERSONAL_PLAN_VOICE_DEMO,
} from './personalPlanConfig.js';
import { markPersonalPlanCompleted } from './personalPlanStorage.js';
import { resolvePersonalWorkspaceId } from './resolvePersonalWorkspaceId.js';
import { isValidPersistedPixAttempt, isValidPixPayload } from './personalPlanPixAttempt.js';
import {
  createGa4CheckoutEventLifecycle,
  createGa4SubscriptionActivationLifecycle,
} from '../analytics/ga4ProductEvents.js';
import {
  clearPendingGa4SubscriptionActivation,
  persistPendingGa4SubscriptionActivation,
} from '../analytics/ga4SubscriptionActivationOperation.js';
import styles from './PersonalPlan.module.css';

// BUGFIX (modal Pix quebrado ao voltar da apresentação): tempo máximo para
// a chamada de criação do Pix (createCustomer + createSubscription) --
// nunca deixa "Confirmar assinatura" em loading indefinido; ao estourar,
// mostra erro recuperável (rule 8: "Gerando QR Code..." exige timeout e
// tratamento de erro).
const PIX_CREATION_TIMEOUT_MS = 20000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error('PIX_CREATION_TIMEOUT')), ms);
    }),
  ]);
}

// BLOCO FINAL DO MVP: internal id real usado pelo backend (plans.id = 'pro',
// decisão comercial congelada desde o Bloco Asaas 0) -- distinto do
// PERSONAL_PLAN_ID ('personal'), que é só a identidade da ROTA/marca desta
// tela, nunca enviado à Edge Function.
const BILLING_PLAN_ID = 'pro';

function CrownIcon() {
  return (
    <svg viewBox="0 0 48 36" aria-hidden="true">
      <path d="m5 9 10 8 9-13 9 13 10-8-4 21H9Z" />
      <path d="M10 34h28" />
    </svg>
  );
}

function BackChevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14.5 5.5 8 12l6.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RowChevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MicGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="2.6" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.4 11.4a6.6 6.6 0 0 0 13.2 0M12 18v3.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function DemoWave() {
  return (
    <svg viewBox="0 0 180 24" fill="none" aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <linearGradient id="personal-plan-demo-wave" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#7c3aed" />
          <stop offset=".5" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity=".25" />
        </linearGradient>
      </defs>
      <g stroke="url(#personal-plan-demo-wave)" strokeWidth="2.4" strokeLinecap="round">
        <path d="M3 12h2M11 8v8M19 5v14M27 9v6M35 4v16M43 10v4M51 7v10M59 11v2M67 8v8M75 12h2M83 10v4M91 12h2" />
      </g>
    </svg>
  );
}

// REDESIGN CHECKOUT: glifos locais do checkout/Pix. Todos decorativos
// (aria-hidden pelo container), traço/preenchimento herdados via
// currentColor -- nenhuma dependência nova, nenhum asset externo.
function PixGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.8 21.2 12 12 21.2 2.8 12 12 2.8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M8.6 12 12 8.6l3.4 3.4L12 15.4 8.6 12Z" fill="currentColor" />
    </svg>
  );
}

function CardGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.6" y="5.2" width="18.8" height="13.6" rx="2.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M2.6 9.6h18.8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6.2 14.6h3.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.6" y="10.4" width="14.8" height="9.6" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ShieldCheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2.6l7.4 3.2v5.4c0 5.2-2.9 8.6-7.4 11-4.5-2.4-7.4-5.8-7.4-11V5.8L12 2.6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m8.8 11.8 2.5 2.5 4.1-4.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7.4V12l3.1 1.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckCircleGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="m8.4 12.2 2.6 2.6 4.7-5.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="8.6" y="8.6" width="11.8" height="11.8" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15.4 8.6V6a2.4 2.4 0 0 0-2.4-2.4H6A2.4 2.4 0 0 0 3.6 6v7a2.4 2.4 0 0 0 2.4 2.4h2.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function UserGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8.4" r="3.8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.8 20c.9-3.7 3.7-5.8 7.2-5.8s6.3 2.1 7.2 5.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ArrowRightGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.8 12h14.4m0 0-5.2-5.2M19.2 12l-5.2 5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SparkleGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.4l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9 1.9-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function normalizeCpfCnpjInput(value) {
  return value.replace(/\D/g, '').slice(0, 14);
}

function isValidCpfCnpjFormat(digits) {
  return digits.length === 11 || digits.length === 14;
}

// BLOCO ASAAS CHECKOUT: Pix continua o fluxo direto (createSubscription).
// Cartão de crédito agora usa o Asaas Checkout hospedado -- nunca um
// formulário próprio, nunca número/validade/CVV dentro da UniFlow (ver
// billing-create-checkout). Boleto nunca aparece (fora do MVP, decisão
// comercial).
function SubscriptionMethodModal({
  open, onClose, onConfirm, isSubmitting, submitError,
}) {
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const digits = normalizeCpfCnpjInput(cpfCnpj);
  // CORRECAO NOTIFICACOES (cartao): CPF/CNPJ agora é exigido pelos DOIS
  // métodos -- billing-create-customer precisa dele tanto para o Pix quanto
  // para garantir/reutilizar o customer do cartão ANTES do Checkout
  // hospedado (só assim o Checkout usa `customer: asaas_customer_id`, em
  // vez de deixar a Asaas criar um cliente novo sem notificationDisabled).
  // Nome/endereço/dados do cartão continuam exclusivamente na página
  // hospedada da Asaas (Asaas rejeita customerData parcial sem endereço,
  // que a UniFlow nunca coletou -- por isso o Checkout nunca envia
  // customerData, só o `customer` já identificado).
  const canSubmit = isValidCpfCnpjFormat(digits) && !isSubmitting;

  return (
    <Modal
      open={open}
      onClose={onClose}
      className={styles.checkoutDialog}
      overlayClassName={styles.checkoutOverlay}
      headerClassName={styles.checkoutHeader}
      bodyClassName={styles.checkoutBody}
      title={(
        <span className={styles.checkoutTitle}>
          <span className={styles.checkoutTitleIcon} aria-hidden="true"><CrownIcon /></span>
          <span className={styles.checkoutTitleText}>
            Assinar Plano Pessoal
            <small>Acesso completo a todos os recursos da UniFlow.</small>
          </span>
        </span>
      )}
      footer={(
        <div className={styles.checkoutActions}>
          <Button
            type="button"
            variant="primary"
            fullWidth
            loading={isSubmitting}
            disabled={!canSubmit}
            className={styles.checkoutCta}
            leftIcon={<LockGlyph />}
            rightIcon={<ArrowRightGlyph />}
            onClick={() => onConfirm({ cpfCnpj: digits, paymentMethod })}
          >
            {paymentMethod === 'credit_card' ? 'Continuar com cartão' : 'Continuar com Pix'}
          </Button>
          <button
            type="button"
            className={styles.checkoutCancel}
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancelar
          </button>
          <p className={styles.checkoutTrustBar}>
            <span><ShieldCheckGlyph /> Pagamento seguro</span>
            <span aria-hidden="true" className={styles.checkoutTrustDivider} />
            <span>Processado pelo <strong>Asaas</strong></span>
          </p>
        </div>
      )}
    >
      <div className={styles.checkoutPriceCard}>
        <p className={styles.checkoutPrice}>
          <strong>{PERSONAL_PLAN_PRICE_LABEL}</strong>
          <span>{PERSONAL_PLAN_PRICE_PERIOD}</span>
        </p>
        <p className={styles.checkoutPriceNote}>
          <CheckCircleGlyph /> Cancele quando quiser
        </p>
      </div>

      <p className={styles.checkoutSectionTitle}>Escolha a forma de pagamento</p>
      <div className={styles.methodChoiceGroup} role="radiogroup" aria-label="Forma de pagamento">
        <label className={styles.methodOption} data-selected={paymentMethod === 'pix' ? 'true' : 'false'}>
          <input
            type="radio"
            name="payment-method"
            value="pix"
            checked={paymentMethod === 'pix'}
            onChange={() => setPaymentMethod('pix')}
          />
          <span className={styles.methodIcon} data-tone="pix" aria-hidden="true"><PixGlyph /></span>
          <span className={styles.methodText}>
            <strong>Pix</strong>
            <small>Aprovação rápida</small>
          </span>
          <span className={styles.methodMark} aria-hidden="true"><CheckCircleGlyph /></span>
        </label>
        <label className={styles.methodOption} data-selected={paymentMethod === 'credit_card' ? 'true' : 'false'}>
          <input
            type="radio"
            name="payment-method"
            value="credit_card"
            checked={paymentMethod === 'credit_card'}
            onChange={() => setPaymentMethod('credit_card')}
          />
          <span className={styles.methodIcon} data-tone="card" aria-hidden="true"><CardGlyph /></span>
          <span className={styles.methodText}>
            <strong>Cartão de crédito</strong>
            <small>Pagamento processado com segurança pelo Asaas</small>
          </span>
          <span className={styles.methodMark} aria-hidden="true"><CheckCircleGlyph /></span>
        </label>
      </div>

      <p className={styles.checkoutSectionTitle}>Dados para emissão da cobrança</p>
      <label className={styles.cpfField}>
        <span>CPF ou CNPJ</span>
        <span className={styles.cpfInputWrap}>
          <span className={styles.cpfInputIcon} aria-hidden="true"><UserGlyph /></span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={cpfCnpj}
            onChange={(event) => setCpfCnpj(event.target.value)}
            placeholder="000.000.000-00"
            aria-invalid={cpfCnpj.length > 0 && !isValidCpfCnpjFormat(digits)}
          />
        </span>
        <small className={styles.cpfHelper}>
          <LockGlyph /> Necessário para processar sua cobrança com segurança. Não armazenamos seus dados bancários.
        </small>
      </label>
      {paymentMethod === 'credit_card' ? (
        <p className={styles.hint}>
          <LockGlyph />
          Nome, endereço e dados do cartão serão informados diretamente na página segura do Asaas.
        </p>
      ) : null}
      {submitError ? <p className={styles.methodError} role="alert">{submitError}</p> : null}
    </Modal>
  );
}

// CORRECAO FINAL PIX: modal simples de pagamento -- QR Code oficial +
// copia-e-cola da Asaas (nunca gerado/inventado pela UniFlow). Reaproveita
// o polling já ligado no componente pai (useSubscriptionStatusPolling);
// este modal só exibe o que já foi buscado, nunca chama billing* sozinho.
function PixPaymentModal({
  open, onClose, pixData, isActive, onGoHome,
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopyPixCode() {
    if (!pixData?.payload) return;
    try {
      await navigator.clipboard.writeText(pixData.payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard indisponível (permissão/navegador) -- nunca quebra a
      // tela, só não copia; o QR Code continua funcionando normalmente.
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnOverlayClick={false}
      className={styles.checkoutDialog}
      overlayClassName={styles.checkoutOverlay}
      headerClassName={styles.checkoutHeader}
      bodyClassName={styles.checkoutBody}
      title={(
        <span className={styles.checkoutTitle}>
          <span className={styles.checkoutTitleIcon} data-tone="pix" aria-hidden="true"><PixGlyph /></span>
          <span className={styles.checkoutTitleText}>
            Pagamento via Pix
            <small>Plano Pessoal</small>
          </span>
        </span>
      )}
      footer={(
        <div className={styles.checkoutActions}>
          {isActive ? (
            <Button type="button" variant="primary" fullWidth className={styles.checkoutCta} onClick={onGoHome}>
              Ir para o início
            </Button>
          ) : null}
          <p className={styles.checkoutTrustBar}>
            <span><ShieldCheckGlyph /> Pagamento protegido pelo <strong>Asaas</strong></span>
            <span aria-hidden="true" className={styles.checkoutTrustDivider} />
            <span><LockGlyph /> Seus dados estão seguros</span>
          </p>
        </div>
      )}
    >
      <div className={styles.pixValueCard}>
        <p className={styles.pixValueLabel}>Valor da assinatura</p>
        <p className={styles.pixValueAmount}>{PERSONAL_PLAN_PRICE_LABEL}</p>
        <p className={styles.pixValueNote}>Cobrança mensal</p>
      </div>

      {isActive ? (
        <div className={styles.pixStatusCard} data-tone="confirmed">
          <span className={styles.pixStatusIcon} aria-hidden="true"><CheckCircleGlyph /></span>
          <span className={styles.pixStatusText}>
            <strong className={styles.subscriptionStatus} aria-live="polite">Pagamento confirmado.</strong>
            <small>Seu Plano Pessoal está ativo.</small>
          </span>
        </div>
      ) : (
        <>
          <div className={styles.pixStatusCard} data-tone="waiting">
            <span className={styles.pixStatusIcon} aria-hidden="true"><ClockGlyph /></span>
            <span className={styles.pixStatusText}>
              <strong className={styles.subscriptionStatus} aria-live="polite">Aguardando pagamento</strong>
              <small>O pagamento é identificado automaticamente em poucos segundos.</small>
            </span>
            <span className={styles.pixStatusBadge}>
              <ShieldCheckGlyph /> Ambiente seguro
            </span>
          </div>

          <div className={styles.pixQrCard}>
            <p className={styles.pixQrTitle}>Escaneie o QR Code com o app do seu banco</p>
            {pixData?.encoded_image ? (
              <span className={styles.pixQrFrame}>
                <img
                  className={styles.pixQrImage}
                  src={`data:image/png;base64,${pixData.encoded_image}`}
                  alt="QR Code Pix para pagamento do Plano Pessoal"
                />
              </span>
            ) : (
              <p className={styles.hint}>Gerando QR Code...</p>
            )}

            <p className={styles.pixSeparator}><span>ou</span></p>
            <p className={styles.pixCopyLabel}>Copie o código Pix e cole no seu banco.</p>
            <Button
              type="button"
              variant="primary"
              fullWidth
              className={styles.checkoutCta}
              data-copied={copied ? 'true' : 'false'}
              leftIcon={copied ? <CheckCircleGlyph /> : <CopyGlyph />}
              onClick={handleCopyPixCode}
              disabled={!pixData?.payload}
            >
              {copied ? 'Código Pix copiado' : 'Copiar código Pix'}
            </Button>
            <p className={styles.pixCopyHint}>
              Ao copiar, cole o código no seu banco para concluir o pagamento.
            </p>
          </div>

          <div className={styles.pixNoticeCard}>
            <span className={styles.pixNoticeIcon} aria-hidden="true"><SparkleGlyph /></span>
            <span className={styles.pixNoticeText}>
              A confirmação acontece automaticamente.
              <strong>Não feche esta tela até o pagamento ser identificado.</strong>
            </span>
          </div>
        </>
      )}
    </Modal>
  );
}

function PersonalPlanPage() {
  const navigate = useNavigate();
const {
  session,
  isSupabaseConfigured,
  workspace,
  availableWorkspaces,
  createWorkspaceProfile,
  signOut,
} = useSession();
  const userId = resolvePresentationUserId(session, isSupabaseConfigured);
  // GUARD FIX: resolver compartilhado com App.jsx (nunca duas
  // implementações divergentes decidindo o workspace da assinatura).
  const workspaceId = resolvePersonalWorkspaceId(availableWorkspaces, workspace);

  // checking: consulta inicial (evita oferecer "assinar" para quem já tem
  // assinatura); idle: sem assinatura, pode assinar; method_modal: modal
  // aberto; pending: assinatura criada, aguardando pagamento (polling
  // ativo); active: pagamento confirmado; already_active/cancel_scheduled/
  // needs_regularization: estados de quem já tinha assinatura antes de
  // abrir esta tela; error: falha ao consultar/criar.
  const [flowState, setFlowState] = useState('checking');
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initialSubscription, setInitialSubscription] = useState(null);
  // CORRECAO FINAL PIX: dados do QR Code (encoded_image/payload/value/
  // due_date), vindos direto da resposta de billing-create-subscription ou
  // billing-get-subscription -- nunca gerados no frontend.
  const [pixData, setPixData] = useState(null);
  const [pixModalDismissed, setPixModalDismissed] = useState(false);
  const promotionEligibility = flowState === 'checking'
    ? null
    : !['active', 'already_active', 'cancel_scheduled'].includes(flowState);
  const [checkoutEventLifecycle] = useState(() => createGa4CheckoutEventLifecycle());
  // Fase 4B Lite: instância própria por montagem da página -- a leitura
  // inicial (already_active/pending restaurado) nunca chama
  // markWitnessedActivation, só as duas transições reais observadas abaixo.
  const [subscriptionActivationLifecycle] = useState(
    () => createGa4SubscriptionActivationLifecycle(),
  );

  useEffect(() => {
    let cancelled = false;
    // Deferido via setTimeout(0) -- mesmo padrão usado em
    // SimplifiedPlanPage.jsx/useTransactions.js -- evita disparar setState
    // sincrono direto no corpo do efeito.
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      if (!workspaceId) {
        setFlowState('idle');
        return;
      }
      getSubscription({ workspaceId }).then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.exists) {
          setFlowState('idle');
          return;
        }
        setInitialSubscription(data);
        if (data.internal_status === 'active' && !data.cancel_at_period_end) {
          setFlowState('already_active');
        } else if (data.internal_status === 'active' && data.cancel_at_period_end) {
          setFlowState('cancel_scheduled');
        } else if (data.internal_status === 'pending' && isValidPersistedPixAttempt(data)) {
          // GUARD FIX: só restaura o modal Pix automaticamente quando TODOS
          // os sinais de uma tentativa Pix real e completa existem ao
          // mesmo tempo (isValidPersistedPixAttempt) -- nunca só porque
          // internal_status é 'pending' (isso também é verdade para um
          // checkout de cartão abandonado, sem nenhum dado de Pix).
          setPixData(data.pix);
          setPixModalDismissed(false);
          setFlowState('pending');
        } else if (data.internal_status === 'pending') {
          // BUGFIX (modal Pix quebrado): 'pending' sem uma tentativa Pix
          // válida (ex.: checkout de cartão abandonado, registro
          // incompleto) -- nunca reabre o modal quebrado; estado neutro,
          // usuário escolhe de novo explicitamente.
          setFlowState('idle');
        } else if (data.needs_regularization) {
          setFlowState('needs_regularization');
        } else {
          // canceled/expired: tratado como "sem acesso pago", pode assinar de novo.
          setFlowState('idle');
        }
      });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timeoutId); };
  }, [workspaceId]);

  const { status: polledSubscription } = useSubscriptionStatusPolling({
    workspaceId,
    active: flowState === 'pending',
  });

  useEffect(() => {
    if (flowState !== 'pending' || !polledSubscription?.exists) return undefined;
    // Deferido via setTimeout(0) -- evita setState sincrono direto no
    // corpo do efeito (mesmo padrão do efeito de consulta inicial acima).
    const timeoutId = window.setTimeout(() => {
      if (polledSubscription.internal_status === 'active') {
        setFlowState('active');
        markPersonalPlanCompleted(userId);
        subscriptionActivationLifecycle.markWitnessedActivation();
      } else if (['canceled', 'expired'].includes(polledSubscription.internal_status)) {
        setFlowState('idle');
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [flowState, polledSubscription, userId, subscriptionActivationLifecycle]);

  async function handleConfirmSubscription({ cpfCnpj, paymentMethod }) {
    checkoutEventLifecycle.confirmPaymentMethod(paymentMethod);
    setIsSubmitting(true);
    setSubmitError(null);
let resolvedWorkspaceId = workspaceId;

if (!resolvedWorkspaceId) {
  const workspaceResult = await createWorkspaceProfile('personal');

  if (workspaceResult.error || !workspaceResult.data?.id) {
    setSubmitError(
      'Não foi possível preparar seu espaço pessoal. Tente novamente em instantes.',
    );
    setIsSubmitting(false);
    return;
  }

  resolvedWorkspaceId = workspaceResult.data.id;
}
    // CORRECAO NOTIFICACOES (cartao): billing-create-customer PRIMEIRO --
    // garante/reutiliza (nunca duplica) o customer Asaas do workspace, já
    // nascendo com notificationDisabled:true (mesma Edge Function do Pix,
    // já em Production). SEMPRE sequencial, nunca em paralelo com
    // createCheckout: se a criação/reuso do customer falhar, o Checkout
    // NUNCA abre -- nenhuma cobrança é criada sem um customer identificado.
    // billing-create-checkout resolve o asaas_customer_id correto pelo
    // workspace autenticado, do lado do servidor -- o frontend nunca envia
    // um customer id para o Checkout. Redireciona na MESMA aba para
    // checkout_url; nunca considera o plano ativo só por isso (a rota de
    // retorno consulta billing-get-subscription de verdade).
    if (paymentMethod === 'credit_card') {
      let cardCustomerResult;
      try {
        cardCustomerResult = await withTimeout(
          createCustomer({ workspaceId: resolvedWorkspaceId, cpfCnpj }),
          PIX_CREATION_TIMEOUT_MS,
        );
      } catch {
        setSubmitError('Não foi possível preparar seu cadastro de pagamento. Tente novamente.');
        setIsSubmitting(false);
        return;
      }
      if (cardCustomerResult.error) {
        setSubmitError('Não foi possível preparar seu cadastro de pagamento. Tente novamente.');
        setIsSubmitting(false);
        return;
      }

      const checkoutResult = await createCheckout({ workspaceId: resolvedWorkspaceId })
      if (checkoutResult.error || !checkoutResult.data?.checkout_url) {
        setSubmitError('Não foi possível iniciar o pagamento por cartão agora. Tente novamente em instantes.');
        setIsSubmitting(false);
        return;
      }
      // Fase 4B Lite: card_checkout_created dispara aqui -- checkout_url real
      // e válida confirmada, imediatamente antes do redirect. O tracker é
      // fail-open/síncrono (nunca faz await, nunca lança), então uma falha do
      // GA4 jamais atrasa ou bloqueia o redirecionamento abaixo.
      // O marcador session-scoped atravessa o Checkout hospedado e permite que
      // /plano-pessoal/retorno reconheça uma ativação que já chegou `active`
      // no primeiro polling. Ele é categórico, fail-open e não altera o fluxo.
      persistPendingGa4SubscriptionActivation();
      checkoutEventLifecycle.markCardCheckoutCreated();
      window.location.href = checkoutResult.data.checkout_url;
      return;
    }

    // BUGFIX (modal Pix quebrado): timeout explícito na chamada real de
    // criação (createCustomer + createSubscription) -- nunca deixa
    // "Confirmar assinatura" em loading indefinido; ao estourar, mostra
    // erro recuperável em vez de travar a UI.
    let customerResult;
    let subscriptionResult;
    try {
      customerResult = await withTimeout(
        createCustomer({ workspaceId: resolvedWorkspaceId, cpfCnpj }),
        PIX_CREATION_TIMEOUT_MS,
      );

      if (customerResult.error) {
        setSubmitError('Não foi possível preparar seu cadastro de pagamento. Tente novamente.');
        setIsSubmitting(false);
        return;
      }

      subscriptionResult = await withTimeout(
        createSubscription({
          workspaceId: resolvedWorkspaceId,
          planId: BILLING_PLAN_ID,
          paymentMethod: 'pix',
        }),
        PIX_CREATION_TIMEOUT_MS,
      );
    } catch {
      // Timeout (PIX_CREATION_TIMEOUT_MS) ou qualquer rejeição inesperada
      // -- nunca expõe detalhe técnico, sempre recuperável (o usuário pode
      // tentar de novo; nenhum estado quebrado fica para trás).
      setSubmitError('A geração do Pix demorou demais. Tente novamente em instantes.');
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    if (subscriptionResult.error) {
      setSubmitError('Não foi possível criar sua assinatura agora. Tente novamente em instantes.');
      return;
    }

    const { status, pix } = subscriptionResult.data ?? {};
    if (status === 'active') {
      clearPendingGa4SubscriptionActivation();
      setFlowState('active');
      markPersonalPlanCompleted(userId);
      subscriptionActivationLifecycle.markWitnessedActivation();
      return;
    }
    // GUARD FIX: só entra em 'pending' com um payload Pix real e completo
    // (QR Code + copia-e-cola) -- nunca abre o modal "Gerando QR Code..."
    // para sempre quando a Asaas não devolveu os dados a tempo. O usuário
    // já sabe que pode tentar de novo (billing-create-subscription reusa a
    // mesma cobrança pendente, nunca cria uma duplicada).
    if (!isValidPixPayload(pix)) {
      setSubmitError('Não foi possível gerar o QR Code Pix agora. Tente novamente em instantes.');
      return;
    }
    // Fase 4B Lite: pix_generated só aqui -- um Pix real e completo acabou
    // de chegar da Asaas para ESTA tentativa (nunca na restauração via
    // getSubscription no mount, nem antes da resposta/em erro).
    clearPendingGa4SubscriptionActivation();
    checkoutEventLifecycle.markPixGenerated();
    setPixData(pix);
    setPixModalDismissed(false);
    setFlowState('pending');
  }

  function handleGoHome() {
    navigate(SIMPLIFIED_ROUTES.HOME);
  }

  function handleBeginCheckout() {
    checkoutEventLifecycle.begin();
    setFlowState('method_modal');
  }

  function handleCloseCheckout() {
    checkoutEventLifecycle.close();
    setFlowState('idle');
  }

  // HOTFIX (botão "Voltar para entrar ou criar conta" voltava sozinho para
  // /plano-pessoal): CAUSA RAIZ -- /login é rota pública, e o guard em
  // App.jsx redireciona QUALQUER usuário autenticado que caia numa rota
  // pública (/, /welcome, /login) de volta para onde ele "pertence" no
  // funil (aqui, de volta para /plano-pessoal, já que a sessão continuava
  // ativa e sem assinatura desbloqueada). Não há como um usuário
  // autenticado "visitar" /login sem sair da sessão primeiro -- por
  // desenho, é exatamente isso que esse botão pede ("voltar à
  // autenticação" = sair do fluxo atual). Encerra a sessão real (mesmo
  // signOut já usado em SimplifiedAccountPage.jsx) e só então navega --
  // depois do signOut, session vira null e /login deixa de ser
  // redirecionado pelo guard, renderizando normalmente (Entrar/Criar
  // conta/Google/e-mail-senha). Nenhum outro guard/redirect foi tocado.
  const [isReturningToAuth, setIsReturningToAuth] = useState(false);

  async function handleBackToAuth() {
    if (isReturningToAuth) return;
    setIsReturningToAuth(true);
    await signOut();
    navigate('/login');
  }

  // A barra fixa de assinatura só existe para quem PODE assinar. Nos estados
  // em que a assinatura já existe (ativa, pendente, a regularizar), a página
  // mostra o status real e nenhuma barra -- nunca um CTA que reabriria o
  // checkout de quem já pagou.
  const canSubscribe = flowState === 'idle'
    || flowState === 'checking'
    || flowState === 'method_modal';

  return (
    <main className={styles.page}>
      <header className={styles.topBar}>
        <button
          type="button"
          className={styles.backButton}
          onClick={handleBackToAuth}
          disabled={isReturningToAuth}
          aria-label="Voltar para entrar ou criar conta"
        >
          <BackChevron />
        </button>
        <h1 className={styles.topTitle}>Plano Pessoal</h1>
      </header>

      <PlanPromotionCard promotionEligibility={promotionEligibility} />

      <div className={styles.content}>
        {flowState === 'already_active' || flowState === 'active' ? (
          <section className={styles.statusCard} data-tone="ok">
            <p className={styles.subscriptionStatus} aria-live="polite">
              {flowState === 'active'
                ? 'Plano Pessoal ativado com sucesso.'
                : 'Seu Plano Pessoal já está ativo.'}
            </p>
            <Button type="button" variant="primary" fullWidth onClick={handleGoHome}>Ir para o início</Button>
          </section>
        ) : flowState === 'cancel_scheduled' ? (
          <section className={styles.statusCard} data-tone="warn">
            <p className={styles.subscriptionStatus} aria-live="polite">
              Seu acesso continua ativo até {initialSubscription?.current_period_ends_at
                ? new Date(initialSubscription.current_period_ends_at).toLocaleDateString('pt-BR')
                : 'o fim do período já pago'}.
            </p>
          </section>
        ) : flowState === 'needs_regularization' ? (
          <section className={styles.statusCard} data-tone="warn">
            <p className={styles.subscriptionStatus} role="alert">
              Há uma pendência no pagamento da sua assinatura. Fale com a Uni para regularizar.
            </p>
          </section>
        ) : flowState === 'pending' ? (
          <section className={styles.statusCard} data-tone="pending">
            <p className={styles.subscriptionStatus} aria-live="polite">
              Assinatura criada. Aguardando confirmação do pagamento Pix.
            </p>
            {pixModalDismissed ? (
              <Button type="button" variant="secondary" fullWidth onClick={() => setPixModalDismissed(false)}>
                Ver QR Code Pix
              </Button>
            ) : null}
          </section>
        ) : null}

        <section aria-labelledby="personal-plan-features">
          <h3 id="personal-plan-features" className={styles.sectionTitle}>Incluído no seu plano</h3>
          <ul className={styles.featureList}>
            {PERSONAL_PLAN_BENEFITS.map((benefit) => (
              <li key={benefit.id} className={styles.featureRow}>
                <span className={styles.featureIcon} aria-hidden="true">
                  <PlanBenefitIcon type={benefit.id} />
                </span>
                <span className={styles.featureText}>
                  <strong>{benefit.title}</strong>
                  <small>{benefit.description}</small>
                </span>
                <span className={styles.featureChevron} aria-hidden="true"><RowChevron /></span>
              </li>
            ))}
          </ul>
        </section>

        {/* Demonstração puramente visual: nenhum request, nenhuma chamada à
            Uni Engine, nenhum dado real do usuário -- só ilustra o fluxo. */}
        <section className={styles.demoCard} aria-label="Exemplo de como a Uni organiza um registro">
          <div className={styles.demoIntro}>
            <p className={styles.demoTitle}>
              Você fala.
              <br />
              A <span>Uni</span> organiza.
            </p>
            <span className={styles.demoWave} aria-hidden="true"><DemoWave /></span>
          </div>

          <div className={styles.demoSide}>
            <p className={styles.demoBubble}>
              <span className={styles.demoBubbleIcon} aria-hidden="true"><MicGlyph /></span>
              {PERSONAL_PLAN_VOICE_DEMO.utterance}
            </p>
            <div className={styles.demoResult}>
              <span className={styles.demoResultIcon} aria-hidden="true"><CheckCircleGlyph /></span>
              <span className={styles.demoResultText}>
                <span className={styles.demoDirection}>{PERSONAL_PLAN_VOICE_DEMO.direction}</span>
                <span className={styles.demoCategory}>{PERSONAL_PLAN_VOICE_DEMO.category}</span>
                <span className={styles.demoAmount}>{PERSONAL_PLAN_VOICE_DEMO.amount}</span>
              </span>
            </div>
          </div>
        </section>

        <section className={styles.assuranceCard}>
          <span className={styles.assuranceIcon} aria-hidden="true"><ShieldCheckGlyph /></span>
          <span className={styles.assuranceText}>
            <strong>Cancele quando quiser.</strong>
            <small>Pagamento seguro processado pelo Asaas.</small>
          </span>
        </section>

        <PlanBrandSignature />
      </div>

      {canSubscribe ? (
        <div className={styles.ctaBar}>
          <span className={styles.ctaHandle} aria-hidden="true" />
          <div className={styles.ctaBarInner}>
            <p className={styles.ctaPrice}>
              <strong>{PERSONAL_PLAN_PRICE_LABEL}</strong>
              <span>{PERSONAL_PLAN_PRICE_PERIOD}</span>
            </p>
            <button
              type="button"
              className={styles.ctaButton}
              onClick={handleBeginCheckout}
              disabled={flowState === 'checking'}
            >
              <CrownIcon />
              <span>ASSINAR AGORA</span>
            </button>
          </div>
        </div>
      ) : null}

      <SubscriptionMethodModal
        open={flowState === 'method_modal'}
        onClose={handleCloseCheckout}
        onConfirm={handleConfirmSubscription}
        isSubmitting={isSubmitting}
        submitError={submitError}
      />

      <PixPaymentModal
        open={(flowState === 'pending' || (flowState === 'active' && Boolean(pixData))) && !pixModalDismissed}
        onClose={() => setPixModalDismissed(true)}
        pixData={pixData}
        isActive={flowState === 'active'}
        onGoHome={handleGoHome}
      />
    </main>
  );
}

export default PersonalPlanPage;
