/**
 * HOME-INSTANT1 -- cache local do último estado financeiro já renderizado
 * na Home, para que reabrir o app pinte os números na PRIMEIRA renderização
 * em vez de esperar a API. Os dados frescos continuam sendo buscados em
 * segundo plano e substituem estes assim que chegam.
 *
 * ESCOPO E PRIVACIDADE: guarda valores financeiros reais, então a chave
 * inclui SEMPRE userId + workspaceId, e o logout apaga tudo do usuário
 * (ver clearHomeFinancialCacheForUser, chamado em SessionContext.signOut,
 * mesmo padrão já usado ali para as pending actions). Sem isso, um segundo
 * usuário no mesmo aparelho veria os números do primeiro piscarem na tela.
 *
 * O QUE É GUARDADO: apenas os campos que a Home realmente renderiza --
 * nunca o objeto derivado inteiro. `getMonthRange` devolve um `date` que é
 * um objeto Date, e Date não sobrevive a JSON.stringify/parse (volta como
 * string): guardar só o recorte abaixo elimina essa classe de bug e mantém
 * o payload pequeno no localStorage.
 */

const CACHE_VERSION = 'v1';
const CACHE_PREFIX = `uniflow.home-financial.${CACHE_VERSION}:`;

// Rede de segurança além do periodKey: um cache muito antigo (app parado
// por semanas) não deve pintar números velhos como se fossem atuais.
export const HOME_FINANCIAL_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function getBrowserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function buildHomeFinancialCacheKey(userId, workspaceId) {
  if (!userId || !workspaceId) return null;
  return `${CACHE_PREFIX}${userId}:${workspaceId}`;
}

/**
 * Recorte JSON-safe do que a Home pinta. Qualquer campo fora desta lista é
 * deliberadamente descartado.
 */
export function pickCacheableHomeFinancialData(graphData, transactionCount = 0) {
  if (!graphData) return null;
  return {
    periodLabel: graphData.periodLabel,
    monthTitle: graphData.monthTitle ?? null,
    usedShare: graphData.usedShare ?? null,
    hasMovements: graphData.hasMovements === true,
    incomeLabel: graphData.incomeLabel,
    expenseLabel: graphData.expenseLabel,
    chart: {
      data: graphData.chart?.data ?? [],
      todayDay: graphData.chart?.todayDay ?? 0,
    },
    recent: {
      income: graphData.recent?.income ?? [],
      expense: graphData.recent?.expense ?? [],
    },
    transactionCount,
  };
}

/**
 * Devolve o último estado salvo, ou null. Nunca devolve dados de OUTRO
 * período (`periodKey`, o mês corrente) nem de um cache expirado -- virar o
 * mês invalida sozinho, sem nenhuma limpeza explícita.
 */
export function readHomeFinancialCache({
  userId,
  workspaceId,
  periodKey,
  now = Date.now(),
  storage = getBrowserStorage(),
} = {}) {
  const key = buildHomeFinancialCacheKey(userId, workspaceId);
  if (!key || !storage || !periodKey) return null;

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const entry = JSON.parse(raw);
    if (!entry || entry.periodKey !== periodKey || !entry.data) return null;
    if (typeof entry.savedAt !== 'number') return null;
    if (now - entry.savedAt > HOME_FINANCIAL_CACHE_MAX_AGE_MS) return null;

    return entry.data;
  } catch {
    // JSON corrompido/storage indisponível nunca pode derrubar a Home --
    // simplesmente não há cache, e a tela cai no skeleton.
    return null;
  }
}

export function writeHomeFinancialCache({
  userId,
  workspaceId,
  periodKey,
  data,
  now = Date.now(),
  storage = getBrowserStorage(),
} = {}) {
  const key = buildHomeFinancialCacheKey(userId, workspaceId);
  if (!key || !storage || !periodKey || !data) return;

  try {
    storage.setItem(key, JSON.stringify({ periodKey, savedAt: now, data }));
  } catch {
    // Cota estourada/modo privado: seguir sem cache é degradação aceitável.
  }
}

/**
 * Apaga TODO cache financeiro do usuário (qualquer workspace) -- chamado no
 * logout. Varredura por prefixo, mesmo padrão já usado em
 * SessionContext.signOut para as pending actions.
 */
export function clearHomeFinancialCacheForUser(userId, storage = getBrowserStorage()) {
  if (!userId || !storage) return;

  try {
    const prefix = `${CACHE_PREFIX}${userId}:`;
    const keysToRemove = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && key.startsWith(prefix)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => storage.removeItem(key));
  } catch {
    // Nunca bloqueia o logout.
  }
}
