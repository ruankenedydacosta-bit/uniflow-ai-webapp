import { FINANCIAL_DATA_CHANGED_EVENT } from '../services/financialDataEvents.js';

/**
 * Cache em memória das leituras financeiras (contas, categorias,
 * lançamentos, saldos). Voltar ao Financeiro mostra na hora o que já foi
 * lido. Dentro de 1 minuto não há nova leitura. Depois disso, o dado
 * guardado aparece e a leitura nova roda por trás, sem tela de carregando.
 *
 * Fica só na memória da aba: recarregar a página começa vazio, e o logout
 * apaga tudo (clearFinancialQueryCache em SessionContext.signOut).
 *
 * Qualquer gravação financeira dispara FINANCIAL_DATA_CHANGED_EVENT. O
 * evento marca todo o cache como vencido, e a próxima tela aberta busca de
 * novo, ainda mostrando o dado guardado enquanto isso.
 */

export const FINANCIAL_CACHE_FRESH_MS = 60 * 1000;

const entries = new Map();

export function buildFinancialCacheKey(resource, params = {}) {
  if (!params.workspaceId) return null;
  return JSON.stringify([resource, params]);
}

export function readFinancialCache(key) {
  if (!key) return null;
  return entries.get(key) ?? null;
}

export function isFinancialCacheFresh(entry, now = Date.now()) {
  return Boolean(entry) && now - entry.savedAt < FINANCIAL_CACHE_FRESH_MS;
}

// Resultado novo do servidor: renova o prazo de 1 minuto.
export function writeFinancialCache(key, data, now = Date.now()) {
  if (!key) return;
  entries.set(key, { data, savedAt: now });
}

// Mudança local (gravação feita pela própria tela): troca o dado e mantém o
// prazo da última leitura do servidor.
export function updateFinancialCacheData(key, data) {
  const entry = readFinancialCache(key);
  if (!entry) return;
  entries.set(key, { ...entry, data });
}

export function markFinancialCacheStale() {
  entries.forEach((entry, key) => {
    entries.set(key, { ...entry, savedAt: 0 });
  });
}

export function clearFinancialQueryCache() {
  entries.clear();
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, markFinancialCacheStale);
}
