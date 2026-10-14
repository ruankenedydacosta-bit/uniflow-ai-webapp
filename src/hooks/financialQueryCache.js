import { FINANCIAL_DATA_CHANGED_EVENT } from '../services/financialDataEvents.js';

/**
 * Cache em memória das leituras financeiras (contas, categorias,
 * lançamentos, saldos). Voltar a uma tela financeira mostra na hora o que
 * já foi lido. Dentro de 1 minuto não há nova leitura. Depois disso, o dado
 * guardado aparece e a leitura nova roda por trás, sem tela de carregando.
 *
 * Guarda só resposta do servidor, nunca a lista mexida localmente.
 * Gravação feita pelos hooks apaga o cache inteiro (um lançamento muda
 * saldo, mês e categoria de uma vez). Gravação feita fora deles avisa por
 * FINANCIAL_DATA_CHANGED_EVENT, que só vence o cache: o dado continua para
 * pintar a tela enquanto a leitura nova chega.
 *
 * Fica só na memória da aba. A troca de usuário apaga tudo
 * (SessionContext).
 */

export const FINANCIAL_CACHE_FRESH_MS = 60 * 1000;
// Depois disso a entrada sai: tela aberta muito depois começa do zero.
export const FINANCIAL_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
export const FINANCIAL_CACHE_MAX_ENTRIES = 40;

const entries = new Map();

export function buildFinancialCacheKey(resource, params = {}) {
  if (!params.workspaceId) return null;
  return JSON.stringify([resource, params]);
}

export function readFinancialCache(key, now = Date.now()) {
  if (!key) return null;
  const entry = entries.get(key);
  if (!entry) return null;
  if (now - entry.savedAt >= FINANCIAL_CACHE_MAX_AGE_MS) {
    entries.delete(key);
    return null;
  }
  return entry;
}

export function isFinancialCacheFresh(entry, now = Date.now()) {
  return Boolean(entry) && !entry.stale && now - entry.savedAt < FINANCIAL_CACHE_FRESH_MS;
}

export function writeFinancialCache(key, data, now = Date.now()) {
  if (!key) return;
  // Reinserir põe a chave no fim: a primeira do Map é a lida há mais tempo.
  entries.delete(key);
  entries.set(key, { data, savedAt: now, stale: false });
  while (entries.size > FINANCIAL_CACHE_MAX_ENTRIES) {
    entries.delete(entries.keys().next().value);
  }
}

export function markFinancialCacheStale() {
  entries.forEach((entry) => {
    entry.stale = true;
  });
}

export function clearFinancialQueryCache() {
  entries.clear();
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, markFinancialCacheStale);
}
