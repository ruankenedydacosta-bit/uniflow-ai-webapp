import { findPersonalPlanTier, formatPlanPrice } from '../personal-plan/personalPlanConfig.js';
import { formatDate } from './subscriptionPresentation.js';

// Minutos inteiros para a tela; meio minuto que sobra não aparece.
export function formatVoiceMinutes(seconds) {
  const minutes = Math.floor(Math.max(0, Number(seconds) || 0) / 60);
  return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
}

export function describeVoiceBalance(balance) {
  if (!balance || balance.secondsGranted <= 0) return null;
  const remaining = formatVoiceMinutes(balance.remainingSeconds);
  const granted = Math.floor(balance.secondsGranted / 60);
  const renews = balance.cycleEndsAt ? ` Os minutos renovam em ${formatDate(balance.cycleEndsAt)}.` : '';
  return `Restam ${remaining} de ${granted} neste mês.${renews}`;
}

// O que acontece se a pessoa escolher o plano `targetTierId`, a partir do
// plano atual. Mesmos critérios de billing-change-plan.
export function describePlanChange({ currentTierId, targetTierId, renewsAt }) {
  const current = findPersonalPlanTier(currentTierId);
  const target = findPersonalPlanTier(targetTierId);
  if (current.id === target.id) {
    return { kind: 'same', confirmLabel: 'Manter este plano', text: 'Este é o seu plano atual.' };
  }
  const difference = Math.round((target.priceBrl - current.priceBrl) * 100) / 100;
  if (difference > 0) {
    return {
      kind: 'upgrade',
      differenceLabel: formatPlanPrice(difference),
      confirmLabel: `Pagar ${formatPlanPrice(difference)} por Pix`,
      text: `Pague a diferença de ${formatPlanPrice(difference)} por Pix. Os ${target.voiceMinutes} minutos do ${target.name} entram assim que o pagamento for confirmado. A partir da próxima cobrança, o valor mensal passa a ser ${target.priceLabel}.`,
    };
  }
  const when = renewsAt ? `em ${formatDate(renewsAt)}` : 'na próxima cobrança';
  return {
    kind: 'downgrade',
    confirmLabel: `Trocar para o ${target.name}`,
    text: `A troca vale a partir da próxima cobrança, ${when}. Até lá, você continua com os minutos do ${current.name}.`,
  };
}
