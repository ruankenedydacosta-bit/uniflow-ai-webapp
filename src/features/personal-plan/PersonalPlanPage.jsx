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
import PlanBrandHeader from './PlanBrandHeader.jsx';
import {
  PERSONAL_PLAN_BENEFITS,
  PERSONAL_PLAN_TRUST_SEALS,
} from './personalPlanConfig.js';
import { markPersonalPlanCompleted } from './personalPlanStorage.js';
import styles from './PersonalPlan.module.css';

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

function SecureIcon() {
  return (
    <svg viewBox="0 0 32 36" aria-hidden="true">
      <path d="m16 3 11 5v8c0 8-4 13-11 17C9 29 5 24 5 16V8Z" />
      <path d="m11 17 4 4 7-9" />
    </svg>
  );
}

function TrustSealIcon({ type }) {
  if (type === 'protected') return <span aria-hidden="true">▣</span>;
  if (type === 'technology') return <span aria-hidden="true">◇</span>;
  if (type === 'support') return <span aria-hidden="true">✓</span>;
  return <span aria-hidden="true">♡</span>;
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
  // BLOCO ASAAS CHECKOUT: CPF só é exigido pelo Pix (billing-create-customer
  // precisa dele). O cartão usa o Checkout hospedado da Asaas, que coleta
  // CPF/nome/endereço do pagador na própria página dele -- nunca solicitado
  // aqui (Asaas rejeita customerData parcial sem endereço, que a UniFlow
  // nunca coletou).
  const canSubmit = paymentMethod === 'credit_card'
    ? !isSubmitting
    : isValidCpfCnpjFormat(digits) && !isSubmitting;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assinar Plano Pessoal"
      description="R$ 29,90/mês. Cancele quando quiser."
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={isSubmitting}
            disabled={!canSubmit}
            onClick={() => onConfirm({ cpfCnpj: digits, paymentMethod })}
          >
            Confirmar assinatura
          </Button>
        </>
      )}
    >
      <div className={styles.methodChoiceGroup} role="radiogroup" aria-label="Forma de pagamento">
        <label className={styles.methodOption} data-selected={paymentMethod === 'pix' ? 'true' : 'false'}>
          <input
            type="radio"
            name="payment-method"
            value="pix"
            checked={paymentMethod === 'pix'}
            onChange={() => setPaymentMethod('pix')}
          />
          <span>Pix</span>
        </label>
        <label className={styles.methodOption} data-selected={paymentMethod === 'credit_card' ? 'true' : 'false'}>
          <input
            type="radio"
            name="payment-method"
            value="credit_card"
            checked={paymentMethod === 'credit_card'}
            onChange={() => setPaymentMethod('credit_card')}
          />
          <span>Cartão de crédito <small>— pagamento seguro no Asaas</small></span>
        </label>
      </div>
      {paymentMethod === 'pix' ? (
        <label className={styles.cpfField}>
          <span>CPF ou CNPJ (exigido pela Asaas para criar sua cobrança)</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={cpfCnpj}
            onChange={(event) => setCpfCnpj(event.target.value)}
            placeholder="Somente números"
            aria-invalid={cpfCnpj.length > 0 && !isValidCpfCnpjFormat(digits)}
          />
        </label>
      ) : (
        <p className={styles.hint}>
          Você informará seus dados (CPF, nome e endereço) diretamente na página segura do Asaas.
        </p>
      )}
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
      window.setTimeout(() => setCopied(false), 2500);
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
      title="Pagamento Pix"
      footer={isActive ? (
        <Button type="button" variant="primary" fullWidth onClick={onGoHome}>Ir para o início</Button>
      ) : null}
    >
      {isActive ? (
        <>
          <p className={styles.subscriptionStatus} aria-live="polite">Pagamento confirmado.</p>
          <p className={styles.subscriptionStatus}>Seu Plano Pessoal está ativo.</p>
        </>
      ) : (
        <>
          <p className={styles.subscriptionStatus} aria-live="polite">Aguardando pagamento</p>
          {pixData?.encoded_image ? (
            <img
              className={styles.pixQrImage}
              src={`data:image/png;base64,${pixData.encoded_image}`}
              alt="QR Code Pix para pagamento do Plano Pessoal"
            />
          ) : (
            <p className={styles.hint}>Gerando QR Code...</p>
          )}
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={handleCopyPixCode}
            disabled={!pixData?.payload}
          >
            {copied ? 'Código copiado!' : 'Copiar código Pix'}
          </Button>
          <p className={styles.hint}>
            Assim que o Pix for confirmado, esta tela será atualizada automaticamente.
          </p>
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
} = useSession();
  const userId = resolvePresentationUserId(session, isSupabaseConfigured);
  const personalWorkspace = availableWorkspaces?.find(
  (item) => item?.workspace_type === 'personal',
);

const workspaceId = personalWorkspace?.id ?? workspace?.id ?? null;

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
        } else if (data.internal_status === 'pending') {
          setPixData(data.pix ?? null);
          setPixModalDismissed(false);
          setFlowState('pending');
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
      } else if (['canceled', 'expired'].includes(polledSubscription.internal_status)) {
        setFlowState('idle');
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [flowState, polledSubscription, userId]);

  async function handleConfirmSubscription({ cpfCnpj, paymentMethod }) {
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
    // BLOCO ASAAS CHECKOUT: cartão nunca passa por createCustomer/
    // createSubscription -- o Checkout hospedado cria cliente e assinatura
    // do lado da Asaas. Redireciona na MESMA aba para checkout_url; nunca
    // considera o plano ativo só por isso (a rota de retorno consulta
    // billing-get-subscription de verdade).
    if (paymentMethod === 'credit_card') {
      const checkoutResult = await createCheckout({ workspaceId: resolvedWorkspaceId })
      if (checkoutResult.error || !checkoutResult.data?.checkout_url) {
        setSubmitError('Não foi possível iniciar o pagamento por cartão agora. Tente novamente em instantes.');
        setIsSubmitting(false);
        return;
      }
      window.location.href = checkoutResult.data.checkout_url;
      return;
    }

    const customerResult = await createCustomer({
  workspaceId: resolvedWorkspaceId,
  cpfCnpj,
});

    if (customerResult.error) {
      setSubmitError('Não foi possível preparar seu cadastro de pagamento. Tente novamente.');
      setIsSubmitting(false);
      return;
    }

    const subscriptionResult = await createSubscription({
  workspaceId: resolvedWorkspaceId,
  planId: BILLING_PLAN_ID,
  paymentMethod: 'pix',
});
    setIsSubmitting(false);
    if (subscriptionResult.error) {
      setSubmitError('Não foi possível criar sua assinatura agora. Tente novamente em instantes.');
      return;
    }

    const { status, pix } = subscriptionResult.data ?? {};
    if (status === 'active') {
      setFlowState('active');
      markPersonalPlanCompleted(userId);
      return;
    }
    // pending (novo ou reaproveitado): liga o polling para detectar a
    // ativação automaticamente, sem exigir refresh manual. QR Code/copia-e-
    // cola vêm prontos da Asaas via billing-create-subscription -- nunca
    // gerados aqui.
    setPixData(pix ?? null);
    setPixModalDismissed(false);
    setFlowState('pending');
  }

  function handleGoHome() {
    navigate(SIMPLIFIED_ROUTES.HOME);
  }

  return (
    <main className={styles.page}>
      <div className={styles.pageGlow} aria-hidden="true" />
      <PlanBrandHeader />

      <div className={styles.brandWave} aria-hidden="true">
        <svg viewBox="0 0 1200 180" preserveAspectRatio="none">
          <defs>
            <linearGradient id="personal-plan-wave" x1="0" y1="0" x2="1" y2="0">
              <stop stopColor="#6d28d9" />
              <stop offset=".45" stopColor="#2563eb" />
              <stop offset=".54" stopColor="#22d3ee" />
              <stop offset="1" stopColor="#10b981" />
            </linearGradient>
            <filter id="personal-plan-glow" x="-20%" y="-80%" width="140%" height="260%">
              <feGaussianBlur stdDeviation="7" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <path className={styles.waveGhost} d="M-20 95c160-75 270 57 440-8s230-62 347-5 246 62 453-4" />
          <path
            className={styles.waveLine}
            d="M-20 95c160-75 270 57 440-8s230-62 347-5 246 62 453-4"
            stroke="url(#personal-plan-wave)"
            filter="url(#personal-plan-glow)"
          />
          <circle cx="600" cy="59" r="4" fill="#67e8f9" filter="url(#personal-plan-glow)" />
        </svg>
      </div>

      <section className={styles.hero} aria-labelledby="personal-plan-title">
        <h1 id="personal-plan-title">PLANO PESSOAL</h1>
        <p>Organize sua vida financeira conversando com a <strong>Uni.</strong></p>
      </section>

      <section className={styles.premiumCard} aria-label="Plano Pessoal completo">
        <span className={styles.accessBadge}>ACESSO COMPLETO</span>

        <div className={styles.price}>
          <span className={styles.currency}>R$</span>
          <strong>29,90</strong>
          <span className={styles.period}>/mês</span>
        </div>

        <p className={styles.planTerms}>
          <span aria-hidden="true"><SecureIcon /></span>
          <span>Cancelamento fácil.<br />Sem taxas. Sem burocracia.</span>
        </p>

        <h2 className={styles.benefitsHeading}>
          <span aria-hidden="true" />
          O QUE VOCÊ GANHA:
          <span aria-hidden="true" />
        </h2>

        <div className={styles.benefitsGrid}>
          {PERSONAL_PLAN_BENEFITS.map((benefit) => (
            <article key={benefit.id} className={styles.benefitCard}>
              <span className={styles.benefitIcon}>
                <PlanBenefitIcon type={benefit.id} />
              </span>
              <h3>{benefit.title}</h3>
              {benefit.description ? <p>{benefit.description}</p> : null}
              {benefit.lines ? (
                <ul>
                  {benefit.lines.map((line) => <li key={line}>{line}</li>)}
                </ul>
              ) : null}
            </article>
          ))}
        </div>

        {flowState === 'already_active' ? (
          <>
            <p className={styles.subscriptionStatus} aria-live="polite">Seu Plano Pessoal já está ativo.</p>
            <Button type="button" variant="primary" fullWidth onClick={handleGoHome}>Ir para o início</Button>
          </>
        ) : flowState === 'cancel_scheduled' ? (
          <p className={styles.subscriptionStatus} aria-live="polite">
            Seu acesso continua ativo até {initialSubscription?.current_period_ends_at
              ? new Date(initialSubscription.current_period_ends_at).toLocaleDateString('pt-BR')
              : 'o fim do período já pago'}.
          </p>
        ) : flowState === 'needs_regularization' ? (
          <p className={styles.subscriptionStatus} role="alert">
            Há uma pendência no pagamento da sua assinatura. Fale com a Uni para regularizar.
          </p>
        ) : flowState === 'pending' ? (
          <>
            <p className={styles.subscriptionStatus} aria-live="polite">
              Assinatura criada. Aguardando confirmação do pagamento Pix.
            </p>
            {pixModalDismissed ? (
              <Button type="button" variant="secondary" fullWidth onClick={() => setPixModalDismissed(false)}>
                Ver QR Code Pix
              </Button>
            ) : null}
          </>
        ) : flowState === 'active' ? (
          <>
            <p className={styles.subscriptionStatus} aria-live="polite">Plano Pessoal ativado com sucesso.</p>
            <Button type="button" variant="primary" fullWidth onClick={handleGoHome}>Ir para o início</Button>
          </>
        ) : (
          <button
            type="button"
            className={styles.subscribeButton}
            onClick={() => setFlowState('method_modal')}
            disabled={flowState === 'checking'}
          >
            <CrownIcon />
            <span>ASSINAR PLANO PESSOAL</span>
            <span className={styles.buttonArrow} aria-hidden="true">›</span>
          </button>
        )}

        <p className={styles.paymentSecurity}>
          <span aria-hidden="true"><SecureIcon /></span>
          Pagamento 100% seguro via <strong>Asaas</strong>
        </p>
      </section>

      <footer className={styles.footer}>
        <div className={styles.trustGrid}>
          {PERSONAL_PLAN_TRUST_SEALS.map((seal) => (
            <div key={seal.id} className={styles.trustSeal}>
              <TrustSealIcon type={seal.id} />
              <span>{seal.label}</span>
            </div>
          ))}
        </div>
        <p className={styles.partnershipFooter}>UNIFLOW AI <span>+</span> SMARTTECH</p>
        <p className={styles.footerValues}>INOVAÇÃO • CONEXÃO • CONFIANÇA • FUTURO</p>
      </footer>

      <SubscriptionMethodModal
        open={flowState === 'method_modal'}
        onClose={() => setFlowState('idle')}
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
