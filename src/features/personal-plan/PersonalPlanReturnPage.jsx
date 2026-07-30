import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/SessionContext';
import { resolvePresentationUserId } from '../presentation';
import { SIMPLIFIED_ROUTES } from '../simplified-app/index.js';
import Button from '../../components/ui/Button/Button.jsx';
import { PERSONAL_PLAN_ROUTE } from './personalPlanConfig.js';
import { useSubscriptionStatusPolling } from './useSubscriptionStatusPolling.js';
import { markPersonalPlanCompleted } from './personalPlanStorage.js';
import styles from './PersonalPlanReturn.module.css';

// BLOCO ASAAS CHECKOUT: rota de retorno do Asaas Checkout hospedado
// (cartão de crédito). O redirecionamento em si NUNCA significa que o
// plano está ativo -- esta tela sempre consulta billing-get-subscription
// de verdade (via o mesmo hook de polling já usado em PersonalPlanPage.jsx)
// e só mostra "ativo" quando o backend confirmar. O webhook continua sendo
// a fonte de verdade; esta tela só observa.
function PersonalPlanReturnPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, isSupabaseConfigured, workspace } = useSession();
  const userId = resolvePresentationUserId(session, isSupabaseConfigured);
  const workspaceId = workspace?.id;

  // status do redirecionamento (?status=success|cancel|expired) -- só um
  // hint de UX para a mensagem inicial, nunca a fonte de verdade do estado
  // do plano (isso é sempre consultado via polling abaixo).
  const redirectStatus = searchParams.get('status');

  const [resolvedState, setResolvedState] = useState(null); // 'active' | 'canceled' | 'expired' | null (ainda processando)

  const { status: polledSubscription, error: pollError, isPolling } = useSubscriptionStatusPolling({
    workspaceId,
    active: !resolvedState,
  });

  useEffect(() => {
    if (resolvedState || !polledSubscription?.exists) return undefined;
    const timeoutId = window.setTimeout(() => {
      if (polledSubscription.internal_status === 'active') {
        setResolvedState('active');
        markPersonalPlanCompleted(userId);
      } else if (['canceled', 'expired'].includes(polledSubscription.internal_status)) {
        setResolvedState(polledSubscription.internal_status);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [resolvedState, polledSubscription, userId]);

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

  let title;
  let description;
  let tone;
  if (resolvedState === 'active') {
    title = 'Plano Pessoal ativado com sucesso!';
    description = 'Seu pagamento foi confirmado. Você já pode aproveitar todos os benefícios.';
    tone = 'ok';
  } else if (resolvedState === 'canceled' || resolvedState === 'expired' || redirectStatus === 'cancel' || redirectStatus === 'expired') {
    title = redirectStatus === 'expired' || resolvedState === 'expired' ? 'O checkout expirou' : 'Pagamento não concluído';
    description = 'Nenhuma cobrança foi feita. Você pode tentar novamente quando quiser.';
    tone = 'warn';
  } else if (pollError && timedOut) {
    title = 'Não foi possível confirmar o pagamento agora';
    description = 'Isso não significa que o pagamento falhou -- pode levar alguns instantes a mais. Volte ao Plano Pessoal para conferir o status.';
    tone = 'warn';
  } else if (timedOut) {
    title = 'Ainda aguardando a confirmação';
    description = 'O pagamento pode levar mais alguns instantes para ser confirmado. Volte ao Plano Pessoal para conferir o status mais tarde.';
    tone = 'warn';
  } else {
    title = 'Processando seu pagamento...';
    description = 'Estamos aguardando a confirmação do Asaas. Esta tela atualiza sozinha.';
    tone = 'neutral';
  }

  return (
    <main className={styles.page}>
      <section className={`${styles.card} ${styles[`tone_${tone}`]}`} aria-live="polite">
        {tone === 'neutral' ? <span className={styles.spinner} aria-hidden="true" /> : null}
        <h1>{title}</h1>
        <p>{description}</p>
        {resolvedState === 'active' ? (
          <Button type="button" variant="primary" fullWidth onClick={handleGoHome}>Ir para o início</Button>
        ) : (
          <Button type="button" variant="secondary" fullWidth onClick={handleBackToPlan}>Voltar ao Plano Pessoal</Button>
        )}
      </section>
    </main>
  );
}

export default PersonalPlanReturnPage;
