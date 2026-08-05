// Uni Engine — Motor de Raciocínio Financeiro (Fase 15). Bloco 7: Telemetria.
//
// Telemetria técnica do motor financeiro, TEMPORÁRIA, sanitizada e
// EXCLUSIVAMENTE em memória (dura apenas enquanto a página está carregada):
//   - buffer limitado (ring buffer — descarta o registro mais antigo);
//   - NUNCA valores monetários, nomes de contas/categorias/metas, descrições,
//     CPF/CNPJ, e-mails, tokens ou IDs brutos (IDs viram fingerprints curtos);
//   - sem Supabase, sem localStorage, sem sessionStorage, sem banco, sem rede;
//   - reset controlado e snapshot de diagnóstico serializável.
import { FINANCIAL_REASONING_VERSION, FINANCIAL_REASONING_STAGES } from '../types/financialReasoningTypes.js';

export const FINANCIAL_TELEMETRY_VERSION = '1.0';
export const FINANCIAL_TELEMETRY_DEFAULT_MAX_ENTRIES = 32;
export const FINANCIAL_TELEMETRY_MAX_ENTRIES_LIMIT = 256;

const PRIORITY_ORDER = Object.freeze({ high: 0, medium: 1, low: 2, info: 3 });

function fingerprint(value) {
  const input = String(value ?? '');
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(index)) >>> 0;
  }
  return (hash >>> 0).toString(16).slice(0, 8);
}

export function createFinancialTelemetryStore(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const requested = Number(safe.maxEntries ?? FINANCIAL_TELEMETRY_DEFAULT_MAX_ENTRIES);
  const maxEntries = Number.isFinite(requested)
    ? Math.max(1, Math.min(FINANCIAL_TELEMETRY_MAX_ENTRIES_LIMIT, Math.round(requested)))
    : FINANCIAL_TELEMETRY_DEFAULT_MAX_ENTRIES;

  const store = {
    entries: [],
    maxEntries,
    enabled: safe.enabled !== false,
  };

  return store;
}

function sanitizePriorityCounts(entries) {
  const counts = {};
  for (const priority of Object.keys(PRIORITY_ORDER)) {
    counts[priority] = 0;
  }
  for (const entry of entries) {
    const pc = entry.summary?.priorityCounts;
    if (pc && typeof pc === 'object') {
      for (const priority of Object.keys(PRIORITY_ORDER)) {
        counts[priority] += Number(pc[priority]) || 0;
      }
    }
  }
  return counts;
}

export function buildFinancialTelemetryEntry({
  status,
  turnKey,
  stages,
  diagnostics = [],
  inferences = [],
  comparison,
  flags,
}) {
  const safeFlags = flags && typeof flags === 'object' ? flags : {};
  const diagnosticTypes = diagnostics.map((item) => item.type);
  const inferenceTypes = inferences.map((item) => item.type);
  const priorities = diagnostics
    .map((item) => item.priority)
    .filter((priority) => PRIORITY_ORDER[priority] !== undefined);

  const maxPriority = priorities.length > 0
    ? priorities.sort((a, b) => PRIORITY_ORDER[a] - PRIORITY_ORDER[b])[0]
    : null;

  const priorityCounts = {};
  for (const p of Object.keys(PRIORITY_ORDER)) {
    priorityCounts[p] = 0;
  }
  for (const p of priorities) {
    priorityCounts[p] += 1;
  }

  const stagesArray = [];
  if (typeof stages === 'object' && stages !== null) {
    for (const stageName of FINANCIAL_REASONING_STAGES) {
      if (stages[stageName] && typeof stages[stageName] === 'object') {
        stagesArray.push(stages[stageName]);
      }
    }
  }

  return {
    version: FINANCIAL_TELEMETRY_VERSION,
    turnKey: typeof turnKey === 'string' ? fingerprint(turnKey) : null,
    status: typeof status === 'string' ? status : 'shadow_fallback',
    stages: Object.freeze(stagesArray),
    summary: {
      diagnosticsCount: diagnostics.length,
      inferencesCount: inferences.length,
      maxPriority,
      priorityCounts: Object.freeze({ ...priorityCounts }),
      divergenceCount: Number(comparison?.divergences?.length ?? 0),
      comparisonStatus: comparison?.status ?? null,
    },
    signalTypes: Object.freeze(diagnosticTypes),
    inferenceTypes: Object.freeze(inferenceTypes),
    flags: Object.freeze({
      financialReasoningEnabled: Boolean(safeFlags.financialReasoningEnabled),
      financialReasoningShadowMode: Boolean(safeFlags.financialReasoningShadowMode),
      financialReasoningTelemetryEnabled: Boolean(safeFlags.financialReasoningTelemetryEnabled),
    }),
    safety: Object.freeze({
      influenceApplied: false,
      executed: false,
      persisted: false,
      networkAccessed: false,
    }),
  };
}

export function recordFinancialTelemetry(store, entry) {
  if (!store || !store.enabled) return null;
  if (!entry || typeof entry !== 'object') return null;
  if (store.entries.length >= store.maxEntries) {
    store.entries.shift();
  }
  store.entries.push(entry);
  return entry;
}

export function getFinancialTelemetrySnapshot(store) {
  if (!store) return null;
  const entries = [...store.entries];
  const counts = sanitizePriorityCounts(entries);
  return {
    version: FINANCIAL_TELEMETRY_VERSION,
    total: entries.length,
    maxEntries: store.maxEntries,
    byPriority: counts,
    entries,
  };
}

export function resetFinancialTelemetry(store) {
  if (!store) return null;
  store.entries = [];
  return store;
}