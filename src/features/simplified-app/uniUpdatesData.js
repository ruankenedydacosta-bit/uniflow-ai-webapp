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

// ============================================================================
// UNIUPD2 -- versionamento semântico obrigatório. A mesma regra (patch
// 0-9, depois vira minor; minor 0-9, depois vira major -- odômetro, igual
// ao pedido: 1.0.9 -> 1.1.0 -> ... -> 1.9.9 -> 2.0.0) é replicada byte a
// byte na migration 046 (uni_updates_next_version, em SQL) -- esta versão
// em JS existe só para o front conseguir prever/exibir a próxima versão
// sem round-trip ao banco; quem DECIDE de fato a versão gravada é sempre
// o trigger no banco (fonte única real, nunca o cliente).
// ============================================================================

const SEMVER_SEGMENT_CAP = 9;

/** Converte "MAJOR.MINOR.PATCH" em {major, minor, patch}; null se inválido. */
export function parseSemver(version) {
  if (typeof version !== 'string') return null;
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** Compara duas versões semver numericamente (nunca como string -- "1.0.10" > "1.0.9" apesar de string comparar ao contrário). */
export function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

/**
 * Próxima versão obrigatória a partir da atual -- nunca uma escolha livre
 * (patch/minor/major não é decidido por quem publica). null se a versão
 * atual for inválida.
 */
export function getNextSemver(version) {
  const parsed = parseSemver(version);
  if (!parsed) return null;
  let { major, minor, patch } = parsed;

  if (patch < SEMVER_SEGMENT_CAP) {
    patch += 1;
  } else if (minor < SEMVER_SEGMENT_CAP) {
    minor += 1;
    patch = 0;
  } else {
    major += 1;
    minor = 0;
    patch = 0;
  }

  return `${major}.${minor}.${patch}`;
}

/**
 * Versão atual "oficial" do app = versão da novidade mais recente
 * publicada (updates já vem ordenado created_at desc pelo service) --
 * mesma fonte para Central de Novidades, Sobre a UniFlow AI, Conta e
 * notificações. `fallbackVersion` só é usado antes da primeira novidade
 * existir ou sem Supabase configurado (nunca diverge por si só depois
 * disso -- a partir da primeira publicação, a fonte é sempre `updates`).
 */
export function resolveCurrentVersion(updates = [], fallbackVersion) {
  return updates[0]?.version ?? fallbackVersion;
}
