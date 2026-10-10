import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import { resolvePresentationUserId } from '../presentation';
import { SIMPLIFIED_ROUTES } from '../simplified-app/index.js';
import OutlineButton from '../../components/ui/OutlineButton/OutlineButton.jsx';
import { UNI_RING_ORB_STATES } from '../../components/ui/UniRingOrb/uniRingOrbModel.js';
import { PERSONAL_PLAN_ROUTE } from './personalPlanConfig.js';
import { useSubscriptionStatusPolling } from './useSubscriptionStatusPolling.js';
import { markPersonalPlanCompleted } from './personalPlanStorage.js';
import { resolvePersonalWorkspaceId } from './resolvePersonalWorkspaceId.js';
import { createGa4SubscriptionActivationLifecycle } from '../analytics/ga4ProductEvents.js';
import {
  clearPendingGa4SubscriptionActivation,
  trackConfirmedGa4SubscriptionActivation,
} from '../analytics/ga4SubscriptionActivationOperation.js';
import PlanResultScreen from './PlanResultScreen.jsx';

// BLOCO ASAAS CHECKOUT: rota de retorno do Asaas Checkout hospedado
// (cartão de crédito). O redirecionamento em si NUNCA significa que o
// plano está ativo -- esta tela sempre consulta billing-get-subscription
// de verdade (via o mesmo hook de polling já usado em PersonalPlanPage.jsx)
// e só mostra "ativo" quando o backend confirmar. O webhook continua sendo
// a fonte de verdade; esta tela só observa.
function PersonalPlanReturnPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, isSupabaseConfigured, workspace, availableWorkspaces } = useSession();
  const userId = resolvePresentationUserId(session, isSupabaseConfigured);
  // GUARD FIX: resolver compartilhado com App.jsx/PersonalPlanPage.jsx --
  // usar workspace.id (o "atual/ativo") aqui podia consultar a assinatura
  // de um workspace diferente do que acabou de voltar do Checkout.
  const workspaceId = resolvePersonalWorkspaceId(availableWorkspaces, workspace);

  // status do redirecionamento (?status=success|cancel|expired) -- só um
  // hint de UX para a mensagem inicial, nunca a fonte de verdade do estado
  // do plano (isso é sempre consultado via polling abaixo).
  const redirectStatus = searchParams.get('status');

  const [resolvedState, setResolvedState] = useState(null); // 'active' | 'canceled' | 'expired' | null (ainda processando)
  const previousPolledStatusRef = useRef(null);
  const [subscriptionActivationLifecycle] = useState(
    () => createGa4SubscriptionActivationLifecycle(),
  );

  const { status: polledSubscription, error: pollError, isPolling } = useSubscriptionStatusPolling({
    workspaceId,
    active: !resolvedState,
  });

  useEffect(() => {
    if (resolvedState || !polledSubscription?.exists) return undefined;
    const currentStatus = polledSubscription.internal_status;
    const previousStatus = previousPolledStatusRef.current;
    previousPolledStatusRef.current = currentStatus;
    const timeoutId = window.setTimeout(() => {
      if (currentStatus === 'active') {
        trackConfirmedGa4SubscriptionActivation({
          previousStatus,
          currentStatus,
          trackActivated: () => subscriptionActivationLifecycle.markWitnessedActivation(),
        });
        setResolvedState('active');
        markPersonalPlanCompleted(userId);
      } else if (['canceled', 'expired'].includes(currentStatus)) {
        clearPendingGa4SubscriptionActivation();
        setResolvedState(currentStatus);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [resolvedState, polledSubscription, userId, subscriptionActivationLifecycle]);

  // Timeout do polling (limite máximo de tentativas atingido, sem nunca
  // chegar a um estado terminal) -- preserva o último estado conhecido,
  // nunca trava a tela num spinner infinito.
  const timedOut = !resolvedState && !isPolling && polledSubscription !== null;

  function handleBackToPlan() {
    navigate(PERSONAL_PLAN_ROUTE);
  }

  function handleGoHome() {
    navigate(SIMPLIFIED_ROUTES.HOME);
  }

  // Tela 21g–i: confirmado (orb falando, "Ir para o início"), processando
  // (orb pensando, sem botão) e não concluído ou tempo esgotado (orb parado,
  // "Voltar ao Plano Pessoal").
  const voiceMinutes = polledSubscription?.voice_minutes;
  let title;
  let description;
  let orbState;
  if (resolvedState === 'active') {
    title = 'Pagamento confirmado';
    description = Number.isFinite(voiceMinutes)
      ? `Seu Plano Pessoal está ativo. Você tem ${voiceMinutes} minutos de conversa por voz por mês.`
      : 'Seu Plano Pessoal está ativo.';
    orbState = UNI_RING_ORB_STATES.SPEAKING;
  } else if (resolvedState === 'canceled' || resolvedState === 'expired' || redirectStatus === 'cancel' || redirectStatus === 'expired') {
    title = redirectStatus === 'expired' || resolvedState === 'expired' ? 'O checkout expirou' : 'Pagamento não concluído';
    description = 'Nenhuma cobrança foi feita. Você pode tentar de novo quando quiser.';
    orbState = UNI_RING_ORB_STATES.IDLE;
  } else if (pollError && timedOut) {
    title = 'Não foi possível confirmar o pagamento agora';
    description = 'Isso não significa que o pagamento falhou -- pode levar alguns instantes a mais. Volte ao Plano Pessoal para conferir o status.';
    orbState = UNI_RING_ORB_STATES.IDLE;
  } else if (timedOut) {
    title = 'Ainda aguardando a confirmação';
    description = 'O pagamento pode levar mais alguns instantes para ser confirmado. Volte ao Plano Pessoal para conferir o status mais tarde.';
    orbState = UNI_RING_ORB_STATES.IDLE;
  } else {
    title = 'Processando seu pagamento';
    description = 'Esta tela atualiza sozinha quando o Asaas confirmar o pagamento.';
    orbState = UNI_RING_ORB_STATES.THINKING;
  }

  const isProcessing = orbState === UNI_RING_ORB_STATES.THINKING;

  return (
    <PlanResultScreen
      orbState={orbState}
      title={title}
      description={description}
      action={resolvedState === 'active' ? (
        <OutlineButton onClick={handleGoHome}>Ir para o início</OutlineButton>
      ) : isProcessing ? null : (
        <OutlineButton variant="secondary" onClick={handleBackToPlan}>Voltar ao Plano Pessoal</OutlineButton>
      )}
    />
  );
}

export default PersonalPlanReturnPage;
