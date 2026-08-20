import { ACCOUNT_SUBROUTE_IDS, ACCOUNT_SUBROUTES } from './simplifiedAccountRoutes.js';

/**
 * UNIUPD1 -- lógica pura de "qual novidade está pendente", extraída para
 * cá para ser testável sem Supabase/React (mesmo padrão de
 * notificationFormatting.js). Nenhuma função aqui faz I/O.
 */

/**
 * Deep-link para uma novidade específica dentro de "Sobre a UniFlow AI" --
 * mesmo destino usado pela notificação (action_url) e pelo botão "Ver
 * novidades" da Home, para nunca haver dois lugares divergentes.
 */
export function buildNovidadeUrl(updateId) {
  return `${ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.ABOUT].path}?novidade=${updateId}`;
}

/**
 * A novidade pendente é a mais recente `active` que o usuário ainda não
 * marcou como vista E que foi publicada DEPOIS do cadastro dele --
 * usuário novo nunca é "incomodado" com destaque de versões antigas que
 * ele nunca usou (ele já começa na versão atual). `now` é injetável
 * (mesmo padrão de formatNotificationDate) para permitir testes
 * determinísticos e ignorar publicações futuras agendadas.
 */
export function resolvePendingUpdate({
  updates = [],
  seenUpdateIds = [],
  userCreatedAt = null,
  now = new Date(),
} = {}) {
  const seen = new Set(seenUpdateIds);
  const userCreatedAtTime = userCreatedAt ? new Date(userCreatedAt).getTime() : null;
  const nowTime = now.getTime();

  let pending = null;
  for (const update of updates) {
    if (!update?.id || !update.active) continue;
    if (seen.has(update.id)) continue;

    const createdAtTime = new Date(update.created_at).getTime();
    if (Number.isNaN(createdAtTime)) continue;
    if (createdAtTime > nowTime) continue;
    if (userCreatedAtTime !== null && createdAtTime <= userCreatedAtTime) continue;

    if (!pending || createdAtTime > new Date(pending.created_at).getTime()) {
      pending = update;
    }
  }

  return pending;
}

/**
 * Data completa (dd/mm/aaaa) para cada entrada do histórico -- diferente
 * de formatNotificationDate (que é relativa/curta): o changelog precisa
 * da data real de publicação, sempre visível, nunca "hoje/ontem".
 */
export function formatUpdateDate(createdAt) {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function isUpdateSeen(update, seenUpdateIds = []) {
  if (!update?.id) return false;
  return seenUpdateIds.includes(update.id);
}
