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

// Mesma regra de admin_set_user_plan (migration 058): plano manual ativo e
// ainda no prazo troca de nível e mantém a data de fim; o resto ganha 1 mês.
export function keepsManualPlanPeriod(user, now) {
  return user?.subscription_source === 'manual'
    && user.subscription_status === 'active'
    && new Date(user.current_period_ends_at).getTime() > now.getTime();
}

// Períodos do relatório de uso, em dias com hoje incluído. O banco aceita até
// 60; app_usage_days guarda 62 (migration 068).
export const USAGE_PERIOD_OPTIONS = Object.freeze([
  { value: 1, label: 'Hoje' },
  { value: 2, label: 'Ontem e hoje' },
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
]);

export const USAGE_RANKING_LIMIT = 25;

export const UNI_RANKING_OPTIONS = Object.freeze([
  { value: 'prompts', label: 'Prompts' },
  { value: 'voice', label: 'Minutos de voz' },
]);

// "45 s", "12 min", "1 h 05 min". Abaixo de um minuto mostra segundos, para
// uma visita curta não aparecer como zero.
export function formatUsageDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, '0')} min`;
}

// Quem abriu o app no período, do maior tempo para o menor. Acesso sem tempo
// medido (só uma chamada) fica no fim, pelo número de acessos.
export function rankByAppTime(rows) {
  return rows
    .filter((row) => row.visits > 0)
    .sort((a, b) => b.active_seconds - a.active_seconds || b.visits - a.visits);
}

// Top 25 da Uni pela métrica escolhida; a outra desempata.
export function rankUniUsage(rows, metric) {
  const primary = metric === 'voice' ? 'voice_seconds' : 'prompts';
  const secondary = metric === 'voice' ? 'prompts' : 'voice_seconds';
  return rows
    .filter((row) => row.prompts > 0 || row.voice_seconds > 0)
    .sort((a, b) => b[primary] - a[primary] || b[secondary] - a[secondary])
    .slice(0, USAGE_RANKING_LIMIT);
}

export function summarizeUsage(rows) {
  return rows.reduce((summary, row) => ({
    appUsers: summary.appUsers + (row.visits > 0 ? 1 : 0),
    appSeconds: summary.appSeconds + row.active_seconds,
    uniUsers: summary.uniUsers + (row.prompts > 0 || row.voice_seconds > 0 ? 1 : 0),
    prompts: summary.prompts + row.prompts,
    voiceSeconds: summary.voiceSeconds + row.voice_seconds,
  }), { appUsers: 0, appSeconds: 0, uniUsers: 0, prompts: 0, voiceSeconds: 0 });
}

const ERROR_MESSAGES_BY_HINT = Object.freeze({
  admin_periodo_relatorio_invalido: 'Escolha um dos períodos da lista.',
  admin_acesso_negado: 'Sua conta não tem acesso à administração.',
  admin_periodo_invalido: 'Escolha um período de 1 a 24 meses.',
  admin_plano_invalido: 'Escolha um dos planos da lista.',
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
