import { findSubscriptionTier } from '../../services/billingTypes.js';
import { normalizeSearchText } from '../../utils/searchText.js';

// Dentro de /app/conta: o shell não desenha o próprio cabeçalho ali.
export const PLATFORM_ADMIN_ROUTE = '/app/conta/admin';

export const MANUAL_PLAN_MONTH_OPTIONS = Object.freeze([1, 3, 6, 12]);

// Teto de admin_list_users (migration 056): os cadastros mais recentes.
export const PLATFORM_USERS_LIST_LIMIT = 1000;

const CURRENT_STATUSES = new Set(['trialing', 'active', 'past_due', 'pending', 'suspended']);

const STATUS_LABELS = Object.freeze({
  active: 'Ativo',
  trialing: 'Em teste',
  pending: 'Aguardando pagamento',
  past_due: 'Pagamento atrasado',
  suspended: 'Suspenso',
  canceled: 'Cancelado',
  expired: 'Expirado',
});

// Busca sem acento e sem caixa nos dois lados: termo e nome/e-mail.
export function filterPlatformUsers(users, term) {
  const normalizedTerm = normalizeSearchText(term);
  if (!normalizedTerm) return users;
  return users.filter((user) => (
    normalizeSearchText(user.full_name).includes(normalizedTerm)
    || normalizeSearchText(user.email).includes(normalizedTerm)
  ));
}

// Resumo do plano de uma linha de admin_list_users para a lista e o modal.
export function resolveUserPlanSummary(user) {
  const status = user?.subscription_status ?? null;
  const isCurrent = CURRENT_STATUSES.has(status);
  const tierName = findSubscriptionTier(user?.tier_id)?.name ?? null;
  const isManual = user?.subscription_source === 'manual';

  if (!status || !isCurrent) {
    return {
      label: 'Sem plano',
      tone: 'neutral',
      tierName: null,
      isManual: false,
      canGrant: true,
      canRevoke: false,
      lastStatusLabel: status ? STATUS_LABELS[status] ?? status : null,
    };
  }

  return {
    label: STATUS_LABELS[status] ?? status,
    tone: status === 'active' || status === 'trialing' ? 'ok' : 'warn',
    tierName,
    isManual,
    // Assinatura ligada à Asaas muda pela cobrança, nunca por aqui. Linha da
    // Asaas sem assinatura lá não é cobrada: o banco a troca por um plano
    // manual. Pagamento pendente também passa: se for checkout de cartão
    // abandonado, o banco o cancela e concede; se não, recusa com o motivo.
    canGrant: isManual || status === 'pending' || user?.subscription_billed === false,
    canRevoke: isManual && status === 'active',
    lastStatusLabel: null,
  };
}

// Mesma regra de admin_set_user_plan (migration 057): plano manual ativo e
// ainda no prazo troca de nível e mantém a data de fim; o resto ganha 1 mês.
export function keepsManualPlanPeriod(user, now) {
  return user?.subscription_source === 'manual'
    && user.subscription_status === 'active'
    && new Date(user.current_period_ends_at).getTime() > now.getTime();
}

const ERROR_MESSAGES_BY_HINT = Object.freeze({
  admin_acesso_negado: 'Sua conta não tem acesso à administração.',
  admin_periodo_invalido: 'Escolha um período de 1 a 24 meses.',
  admin_plano_invalido: 'Escolha um dos planos da lista.',
  admin_sem_workspace: 'Essa pessoa ainda não concluiu o cadastro. Peça para ela entrar no app uma vez e tente de novo.',
  admin_assinatura_paga: 'Essa pessoa tem uma assinatura paga ou aguardando pagamento. Altere o plano dela pela cobrança, não por aqui.',
  admin_sem_plano_manual: 'Essa pessoa não tem plano manual ativo para encerrar.',
  admin_checkout_recente: 'Essa pessoa abriu o pagamento há menos de 2 horas. Tente de novo depois desse prazo.',
  admin_bloquear_a_si: 'Você não pode bloquear a própria conta.',
  admin_bloquear_admin: 'Essa pessoa é da equipe. Tire o acesso de admin dela antes de bloquear.',
  admin_usuario_inexistente: 'Usuário não encontrado. Atualize a lista e tente de novo.',
});

export function resolvePlatformAdminErrorMessage(error) {
  return ERROR_MESSAGES_BY_HINT[error?.hint]
    ?? 'Não foi possível concluir agora. Tente de novo em instantes.';
}
