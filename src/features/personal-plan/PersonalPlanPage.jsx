import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import { resolvePresentationUserId } from '../presentation';
import { SIMPLIFIED_ROUTES } from '../simplified-app/index.js';
import { ensureAppFont } from '../simplified-app/appFont.js';
import ChoiceRow from '../../components/ui/ChoiceRow/ChoiceRow.jsx';
import Field from '../../components/ui/Field/Field.jsx';
import IconBox from '../../components/ui/IconBox/IconBox.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import OutlineButton from '../../components/ui/OutlineButton/OutlineButton.jsx';
import { UNI_RING_ORB_STATES } from '../../components/ui/UniRingOrb/uniRingOrbModel.js';
import {
  PhCaretLeftIcon,
  PhCheckCircleIcon,
  PhCheckIcon,
  PhCopyIcon,
  PhCreditCardIcon,
  PhCrownSimpleIcon,
  PhIdentificationCardIcon,
  PhInfoIcon,
  PhLockSimpleIcon,
  PhPixLogoIcon,
  PhShieldCheckIcon,
} from '../simplified-app/SimplifiedIcons.jsx';
import { createCheckout, createCustomer, createSubscription, getSubscription } from '../../services/billingService.js';
import { useSubscriptionStatusPolling } from './useSubscriptionStatusPolling.js';
import PlanBenefitIcon from './PlanBenefitIcon.jsx';
import PlanPromotionCard from './PlanPromotionCard.jsx';
import PlanResultScreen from './PlanResultScreen.jsx';
import {
  DEFAULT_PERSONAL_PLAN_TIER_ID,
  findPersonalPlanTier,
  formatPlanPrice,
  PERSONAL_PLAN_BENEFITS,
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
// comercial). Tela 21e: folha padrão com o preço, a forma de pagamento em
// linhas de seleção e o CPF ou CNPJ.
function SubscriptionMethodModal({
  open, onClose, onConfirm, isSubmitting, submitError, tier,
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
      title={`Assinar ${tier.name}`}
      description={tier.voiceMinutesLabel}
    >
      <div className={styles.checkoutContent}>
        <div className={styles.checkoutPriceCard}>
          <p className={styles.checkoutPrice}>
            <strong>{tier.priceLabel}</strong>
            <span>{PERSONAL_PLAN_PRICE_PERIOD}</span>
          </p>
          <p className={styles.checkoutPriceNote}>
            <PhCheckCircleIcon /> Cancele quando quiser
          </p>
        </div>

        <div className={styles.methodChoiceGroup} role="radiogroup" aria-labelledby="personal-plan-payment-method">
          <span id="personal-plan-payment-method" className={styles.fieldLabel}>Forma de pagamento</span>
          <ChoiceRow
            name="payment-method"
            value="pix"
            checked={paymentMethod === 'pix'}
            onChange={() => setPaymentMethod('pix')}
            icon={<PhPixLogoIcon />}
            iconTone="green"
            title="Pix"
            description="Aprovação em poucos segundos."
          />
          <ChoiceRow
            name="payment-method"
            value="credit_card"
            checked={paymentMethod === 'credit_card'}
            onChange={() => setPaymentMethod('credit_card')}
            icon={<PhCreditCardIcon />}
            iconTone="blue"
            title="Cartão de crédito"
            description="Você informa os dados do cartão na página do Asaas."
          />
        </div>

        <Field
          label="CPF ou CNPJ"
          icon={<PhIdentificationCardIcon />}
          helper="Usado para emitir a cobrança. A UniFlow não guarda seus dados bancários."
        >
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={cpfCnpj}
            onChange={(event) => setCpfCnpj(event.target.value)}
            placeholder="000.000.000-00"
            aria-invalid={cpfCnpj.length > 0 && !isValidCpfCnpjFormat(digits)}
          />
        </Field>

        {submitError ? <p className={styles.methodError} role="alert">{submitError}</p> : null}

        <div className={styles.checkoutFooter}>
          <div className={styles.checkoutActions}>
            <OutlineButton
              className={styles.checkoutCta}
              loading={isSubmitting}
              disabled={!canSubmit}
              onClick={() => onConfirm({ cpfCnpj: digits, paymentMethod })}
            >
              <PhLockSimpleIcon />
              {paymentMethod === 'credit_card' ? 'Continuar com cartão' : 'Continuar com Pix'}
            </OutlineButton>
            <OutlineButton variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </OutlineButton>
          </div>
          <p className={styles.checkoutTrust}>
            <PhShieldCheckIcon /> Pagamento processado pelo Asaas
          </p>
        </div>
      </div>
    </Modal>
  );
}

// CORRECAO FINAL PIX: modal simples de pagamento -- QR Code oficial +
// copia-e-cola da Asaas (nunca gerado/inventado pela UniFlow). Reaproveita
// o polling já ligado no componente pai (useSubscriptionStatusPolling);
// este modal só exibe o que já foi buscado, nunca chama billing* sozinho.
// Tela 21f: folha padrão que não fecha ao tocar fora. Quando o pagamento é
// confirmado, a página troca a folha pela tela de resultado (21g).
function PixPaymentModal({
  open, onClose, pixData, tier,
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
      title="Pagamento via Pix"
      description={`Plano Pessoal · ${tier.name}`}
    >
      <div className={styles.pixContent}>
        <div className={styles.pixStatusCard}>
          <span className={styles.pixStatusDot} aria-hidden="true" />
          <span className={styles.pixStatusText}>
            <strong className={styles.subscriptionStatus} aria-live="polite">Aguardando pagamento</strong>
            <small>O pagamento é identificado automaticamente em poucos segundos.</small>
          </span>
        </div>

        <div className={styles.pixValueRow}>
          <span>Valor da assinatura</span>
          {/* O valor da cobrança vem da Asaas; sem ele, o do plano escolhido. */}
          <strong>
            {formatPlanPrice(pixData?.value) || tier.priceLabel}
            <small> por mês</small>
          </strong>
        </div>

        <p className={styles.pixQrTitle}>Escaneie o QR Code com o app do seu banco</p>
        <span className={styles.pixQrFrame}>
          {pixData?.encoded_image ? (
            <img
              className={styles.pixQrImage}
              src={`data:image/png;base64,${pixData.encoded_image}`}
              alt="QR Code Pix para pagamento do Plano Pessoal"
            />
          ) : (
            <span className={styles.pixQrLoading}>Gerando QR Code…</span>
          )}
        </span>

        <p className={styles.pixSeparator}><span>ou</span></p>
        <OutlineButton
          className={styles.pixCopyButton}
          data-copied={copied ? 'true' : 'false'}
          onClick={handleCopyPixCode}
          disabled={!pixData?.payload}
        >
          {copied ? <PhCheckIcon /> : <PhCopyIcon />}
          {copied ? 'Código Pix copiado' : 'Copiar código Pix'}
        </OutlineButton>
        <p className={styles.pixCopyHint}>
          Cole o código no app do seu banco. Deixe esta tela aberta até o pagamento ser identificado.
        </p>
      </div>
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
  // Tela 21f: o plano do Pix em aberto (nome e preço na folha). Na retomada
  // vem da assinatura salva, não do plano marcado na tela.
  const [pixTier, setPixTier] = useState(null);
  // Épico #116: nível escolhido entre os três planos. O mesmo valor define o
  // preço na tela e o tier_id enviado ao checkout.
  const [selectedTierId, setSelectedTierId] = useState(DEFAULT_PERSONAL_PLAN_TIER_ID);
  const selectedTier = findPersonalPlanTier(selectedTierId);
  const [checkoutEventLifecycle] = useState(() => createGa4CheckoutEventLifecycle());
  // Fase 4B Lite: instância própria por montagem da página -- a leitura
  // inicial (already_active/pending restaurado) nunca chama
  // markWitnessedActivation, só as duas transições reais observadas abaixo.
  const [subscriptionActivationLifecycle] = useState(
    () => createGa4SubscriptionActivationLifecycle(),
  );

  // Tela 21d: a página usa a fonte do app (Inter), como o login.
  useEffect(() => {
    ensureAppFont(document);
  }, []);

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
          setPixTier(findPersonalPlanTier(data.tier_id));
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

      const checkoutResult = await createCheckout({ workspaceId: resolvedWorkspaceId, tierId: selectedTier.id })
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
          tierId: selectedTier.id,
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
    setPixTier(selectedTier);
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

  // Tela 21g: pagamento confirmado nesta tela (Pix aprovado ou ativação
  // imediata) troca a página inteira pelo resultado.
  if (flowState === 'active') {
    const activeVoiceMinutes = polledSubscription?.voice_minutes ?? (pixTier ?? selectedTier).voiceMinutes;
    return (
      <PlanResultScreen
        orbState={UNI_RING_ORB_STATES.SPEAKING}
        title="Pagamento confirmado"
        description={`Seu Plano Pessoal está ativo. Você tem ${activeVoiceMinutes} minutos de conversa por voz por mês.`}
        action={<OutlineButton onClick={handleGoHome}>Ir para o início</OutlineButton>}
      />
    );
  }

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
          <PhCaretLeftIcon />
        </button>
        <h1 className={styles.topTitle}>Plano Pessoal</h1>
      </header>

      <div className={styles.content}>
        {/* Tela 21d: quem já tem assinatura vê o status no topo, no estilo
            do aviso de minutos de voz (tela 19). */}
        {flowState === 'already_active' ? (
          <section className={styles.statusCard}>
            <div className={styles.statusBody}>
              <IconBox tone="green"><PhCheckIcon /></IconBox>
              <p className={styles.subscriptionStatus} aria-live="polite">Seu Plano Pessoal já está ativo.</p>
            </div>
            <div className={styles.statusActions}>
              <OutlineButton variant="secondary" onClick={handleGoHome}>Ir para o início</OutlineButton>
            </div>
          </section>
        ) : flowState === 'cancel_scheduled' ? (
          <section className={styles.statusCard}>
            <div className={styles.statusBody}>
              <IconBox tone="violet"><PhInfoIcon /></IconBox>
              <p className={styles.subscriptionStatus} aria-live="polite">
                Seu acesso continua ativo até {initialSubscription?.current_period_ends_at
                  ? new Date(initialSubscription.current_period_ends_at).toLocaleDateString('pt-BR')
                  : 'o fim do período já pago'}.
              </p>
            </div>
          </section>
        ) : flowState === 'needs_regularization' ? (
          <section className={styles.statusCard}>
            <div className={styles.statusBody}>
              <IconBox tone="violet"><PhInfoIcon /></IconBox>
              <p className={styles.subscriptionStatus} role="alert">
                Há uma pendência no pagamento da sua assinatura. Fale com a Uni para regularizar.
              </p>
            </div>
          </section>
        ) : flowState === 'pending' ? (
          <section className={styles.statusCard}>
            <div className={styles.statusBody}>
              <IconBox tone="green"><PhPixLogoIcon /></IconBox>
              <p className={styles.subscriptionStatus} aria-live="polite">
                Assinatura criada. Aguardando confirmação do pagamento Pix.
              </p>
            </div>
            {pixModalDismissed ? (
              <div className={styles.statusActions}>
                <OutlineButton variant="secondary" onClick={() => setPixModalDismissed(false)}>
                  Ver QR Code Pix
                </OutlineButton>
              </div>
            ) : null}
          </section>
        ) : null}

        <PlanPromotionCard
          selectedTierId={selectedTier.id}
          onSelectTier={setSelectedTierId}
          disabled={!canSubscribe || isSubmitting}
        />

        <section aria-labelledby="personal-plan-features">
          <h3 id="personal-plan-features" className={styles.sectionTitle}>Incluído em todos os planos</h3>
          <ul className={styles.featureList}>
            {PERSONAL_PLAN_BENEFITS.map((benefit) => (
              <li key={benefit.id} className={styles.featureRow}>
                <IconBox size={32} tone={benefit.tone}><PlanBenefitIcon type={benefit.id} /></IconBox>
                <span className={styles.featureText}>
                  <strong>{benefit.title}</strong>
                  <small>{benefit.description}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Demonstração puramente visual: nenhum request, nenhuma chamada à
            Uni Engine, nenhum dado real do usuário -- só ilustra o fluxo. */}
        <section className={styles.demoCard} aria-label="Exemplo de como a Uni organiza um registro">
          <p className={styles.demoTitle}>Você fala. A Uni organiza.</p>
          <p className={styles.demoUtterance}>“{PERSONAL_PLAN_VOICE_DEMO.utterance}”</p>
          <p className={styles.demoResult}>
            <span className={styles.demoResultIcon} aria-hidden="true"><PhCheckCircleIcon /></span>
            <span>
              {PERSONAL_PLAN_VOICE_DEMO.direction} · {PERSONAL_PLAN_VOICE_DEMO.category} ·{' '}
              <span className={styles.demoAmount}>{PERSONAL_PLAN_VOICE_DEMO.amount}</span>
            </span>
          </p>
        </section>
      </div>

      {canSubscribe ? (
        <div className={styles.ctaBar}>
          <div className={styles.ctaBarInner}>
            <p className={styles.ctaPrice}>
              <strong>
                {selectedTier.priceLabel}
                <span>{PERSONAL_PLAN_PRICE_PERIOD}</span>
              </strong>
              <small>{selectedTier.name} · {selectedTier.voiceMinutes} min de voz</small>
            </p>
            <OutlineButton
              className={styles.ctaButton}
              onClick={handleBeginCheckout}
              disabled={flowState === 'checking'}
            >
              <PhCrownSimpleIcon />
              Assinar
            </OutlineButton>
          </div>
          <p className={styles.ctaNote}>Cancele quando quiser. Pagamento processado pelo Asaas.</p>
        </div>
      ) : null}

      <SubscriptionMethodModal
        open={flowState === 'method_modal'}
        onClose={handleCloseCheckout}
        onConfirm={handleConfirmSubscription}
        isSubmitting={isSubmitting}
        submitError={submitError}
        tier={selectedTier}
      />

      <PixPaymentModal
        open={flowState === 'pending' && !pixModalDismissed}
        onClose={() => setPixModalDismissed(true)}
        pixData={pixData}
        tier={pixTier ?? selectedTier}
      />
    </main>
  );
}

export default PersonalPlanPage;
export { PixPaymentModal, SubscriptionMethodModal };
