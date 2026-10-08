import { HOME_MONTH_READING_KINDS, BUDGET_SOURCES } from './homeMonthReading.js';

/**
 * Leitura do mês escrita pela Uni (#122). Este módulo é a ponte entre os
 * fatos da Home (buildHomeMonthFacts) e a Edge Function uni-insights:
 * monta o pedido, guarda a resposta no aparelho por dia e converte as frases
 * para as linhas da tela.
 *
 * Cache: uma entrada por usuário e espaço, válida só no dia em que foi
 * gerada. A impressão dos fatos muda com qualquer lançamento novo, e aí a Uni
 * escreve de novo. Limite do dia atingido ou função sem chave bloqueiam novas
 * tentativas até o dia seguinte; outra falha bloqueia só aqueles fatos.
 */

export const UNI_READING_CACHE_PREFIX = 'uniflow:leitura-do-mes:v1';

// Falha que não muda com fatos novos: tentar de novo hoje só gasta pedido.
const DAY_BLOCKING_ERRORS = new Set(['RATE_LIMIT', 'NOT_CONFIGURED', 'UNSUPPORTED']);

const KIND_BY_TIPO = Object.freeze({
  alerta: HOME_MONTH_READING_KINDS.OVER_BUDGET,
  atencao: HOME_MONTH_READING_KINDS.NEAR_BUDGET,
  elogio: HOME_MONTH_READING_KINDS.ON_TRACK,
  informacao: HOME_MONTH_READING_KINDS.TOP,
});

const ORIGEM_BY_SOURCE = Object.freeze({
  [BUDGET_SOURCES.LIMIT]: 'teto',
  [BUDGET_SOURCES.AVERAGE]: 'media',
});

function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Pedido da uni-insights. Só categorias com algo a dizer (gasto em algum dos
 * dois meses ou orçamento) e nunca o balaio "Outros", que não tem categoria
 * para a leitura apontar. null quando não há nada para a Uni ler.
 */
export function buildUniInsightsPayload(facts) {
  const categorias = facts.rows
    .filter((row) => row.id !== 'uncategorized' && (row.amount > 0 || row.previousAmount > 0 || row.budget))
    .map((row) => ({
      id: row.id,
      nome: row.name,
      gasto: round2(row.amount),
      gastoAnterior: round2(row.previousAmount),
      media: round2(row.average),
      orcamento: row.budget
        ? { valor: round2(row.budget.amount), origem: ORIGEM_BY_SOURCE[row.budget.source] }
        : null,
    }));
  if (categorias.length === 0 || !(facts.monthExpense > 0)) return null;

  return {
    fatos: {
      periodo: {
        mesAtual: facts.period.currentMonthName,
        mesAnterior: facts.period.previousMonthName,
        rotuloAtual: facts.period.currentLabel,
        rotuloAnterior: facts.period.previousLabel,
        dia: facts.period.day,
        diasNoMes: facts.period.daysInMonth,
      },
      saidasDoMes: round2(facts.monthExpense),
      categorias,
    },
  };
}

// Impressão curta e estável do pedido (djb2): só serve para saber se os
// fatos mudaram desde a última leitura.
export function fingerprintPayload(payload) {
  const text = JSON.stringify(payload);
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  }
  return `${text.length.toString(36)}-${hash.toString(36)}`;
}

export function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function uniReadingCacheKey(userId, workspaceId) {
  return `${UNI_READING_CACHE_PREFIX}:${userId}:${workspaceId}`;
}

function readEntry(storage, key) {
  try {
    const raw = storage?.getItem(key);
    const entry = raw ? JSON.parse(raw) : null;
    return entry && typeof entry === 'object' ? entry : null;
  } catch {
    return null;
  }
}

function writeEntry(storage, key, entry) {
  try {
    storage?.setItem(key, JSON.stringify(entry));
  } catch {
    // Sem armazenamento (aba anônima, cota cheia): a leitura só não fica guardada.
  }
}

/**
 * O que o cache diz sobre estes fatos hoje:
 * - { status: 'ready', readings, generatedAt }: frases da Uni para estes fatos;
 * - { status: 'blocked' }: não chamar a Uni (limite do dia ou falha nestes fatos);
 * - { status: 'stale', readings, generatedAt }: frases de hoje para fatos
 *   anteriores, boas para ficar na tela enquanto a Uni escreve de novo;
 * - { status: 'miss' }.
 */
export function readUniReadingCache(storage, { userId, workspaceId, fingerprint, now = new Date() }) {
  const entry = readEntry(storage, uniReadingCacheKey(userId, workspaceId));
  if (!entry || entry.date !== todayKey(now)) return { status: 'miss' };
  if (entry.blockedForDay) return { status: 'blocked', readings: entry.readings ?? null, generatedAt: entry.generatedAt ?? null };
  if (entry.fingerprint === fingerprint) {
    if (entry.failed) return { status: 'blocked', readings: null, generatedAt: null };
    return { status: 'ready', readings: entry.readings, generatedAt: entry.generatedAt };
  }
  if (Array.isArray(entry.readings) && entry.readings.length) {
    return { status: 'stale', readings: entry.readings, generatedAt: entry.generatedAt };
  }
  return { status: 'miss' };
}

export function writeUniReadingSuccess(storage, { userId, workspaceId, fingerprint, leituras, now = new Date() }) {
  writeEntry(storage, uniReadingCacheKey(userId, workspaceId), {
    date: todayKey(now),
    fingerprint,
    readings: leituras,
    generatedAt: now.toISOString(),
  });
}

export function writeUniReadingFailure(storage, { userId, workspaceId, fingerprint, errorCode, now = new Date() }) {
  const key = uniReadingCacheKey(userId, workspaceId);
  const previous = readEntry(storage, key);
  const keep = previous?.date === todayKey(now) ? previous : {};
  writeEntry(storage, key, {
    ...keep,
    date: todayKey(now),
    fingerprint,
    failed: true,
    blockedForDay: Boolean(keep.blockedForDay) || DAY_BLOCKING_ERRORS.has(errorCode),
    // Frases de fatos anteriores não valem mais: a leitura calculada assume.
    readings: null,
  });
}

/**
 * Frases da Uni → linhas da tela, no mesmo formato de buildHomeMonthReading.
 * A categoria (para o ícone e o filtro do Financeiro) vem dos fatos, pelo id.
 */
export function toUniReadingItems(leituras, facts) {
  const rowById = new Map(facts.rows.map((row) => [row.id, row]));
  return leituras.map((leitura, index) => {
    const row = leitura.categoriaId ? rowById.get(leitura.categoriaId) : null;
    return Object.freeze({
      id: `uni:${index}:${leitura.categoriaId ?? 'geral'}`,
      kind: KIND_BY_TIPO[leitura.tipo] ?? HOME_MONTH_READING_KINDS.TOP,
      categoryId: row ? row.id : null,
      category: row ? { name: row.name, category_type: row.category_type, icon: row.icon } : null,
      title: leitura.titulo,
      detail: leitura.detalhe,
    });
  });
}
