// Uni Engine — Fase 20.2: Tool Calling — registry real de leitura financeira.
//
// Registry isolado com as seis primeiras ferramentas reais da Uni, todas de
// leitura (reads=true, writes=false). Consomem exclusivamente o snapshot
// canônico do turno — nenhuma busca a banco/rede, nenhuma escrita.
//
// Garantias:
//   - handlers nunca são expostos em listagem pública (apenas metadados);
//   - escreve=false em todas as definições;
//   - enabled controlado por configuração (não registra desligada);
//   - timeout padrão (2s) e requiresAuthorization=true em todas;
//   - integração com o fluxo da Fase 20.1 via runToolCallingIntegration
//     (registry + dispatcher são passados como entradas).
import { createToolCallingRegistry } from '../registry/index.js';
import { createToolCallingDispatcher } from '../dispatcher/index.js';
import { createIdempotencyStore } from '../idempotency/index.js';
import { createToolCallingTelemetryStore } from '../telemetry/index.js';
import { buildFinancialToolHandlers } from './handlers.js';

export const FINANCIAL_READ_TOOL_NAMES = Object.freeze([
  'get_financial_summary',
  'get_expense_breakdown',
  'compare_financial_periods',
  'get_goal_progress',
  'get_account_summary',
  'get_recurring_expenses',
]);

// Metadados públicos (sem handlers) usados em schemas de argumentos.
export const FINANCIAL_READ_TOOL_META = Object.freeze({
  get_financial_summary: {
    description: 'Resumo financeiro do período atual: saldo, receitas, despesas e fluxo líquido.',
    schema: { period: { type: 'period', required: false } },
    reads: true,
    writes: false,
  },
  get_expense_breakdown: {
    description: 'Despesas agrupadas por categoria, com período seguro e validado.',
    schema: {
      period: { type: 'period', required: false },
      category: { type: 'category', required: false },
    },
    reads: true,
    writes: false,
  },
  compare_financial_periods: {
    description: 'Compara dois períodos disponíveis no snapshot: diferenças e tendências.',
    schema: {
      periodA: { type: 'period', required: true },
      periodB: { type: 'period', required: true },
      compare_type: { type: 'string', required: false },
    },
    reads: true,
    writes: false,
  },
  get_goal_progress: {
    description: 'Progresso das metas existentes; estado vazio válido quando não há metas.',
    schema: { status: { type: 'status', required: false } },
    reads: true,
    writes: false,
  },
  get_account_summary: {
    description: 'Visão agregada das contas, sem identificadores internos nem dados sensíveis.',
    schema: { type: { type: 'string', required: false } },
    reads: true,
    writes: false,
  },
  get_recurring_expenses: {
    description: 'Despesas recorrentes detectadas (somente leitura, sem mutação).',
    schema: {},
    reads: true,
    writes: false,
  },
});

export function createFinancialReadToolsRegistry({
  snapshot = null,
  config = {},
  allowWrites = false,
} = {}) {
  const registry = createToolCallingRegistry({ allowWrites });
  const handlers = buildFinancialToolHandlers(snapshot);
  const enabled = config.enabled !== false;

  for (const name of FINANCIAL_READ_TOOL_NAMES) {
    const meta = FINANCIAL_READ_TOOL_META[name];
    registry.registerTool({
      name,
      description: meta.description,
      handler: handlers[name],
      reads: meta.reads,
      writes: meta.writes,
      enabled,
      requiresAuthorization: true,
      timeoutMs: 2000,
      metadata: {
        tool: name,
        reads: meta.reads,
        writes: meta.writes,
        schema: meta.schema,
        description: meta.description,
      },
    });
  }
  return registry;
}

// Listagem pública: apenas metadados, NUNCA handlers.
export function listFinancialToolDefinitions(registry) {
  const names = registry && typeof registry.list === 'function' ? registry.list() : [];
  return names.map((name) => {
    const definition = registry.get(name);
    return {
      name,
      description: definition?.metadata?.description ?? null,
      reads: definition?.metadata?.reads === true,
      writes: definition?.metadata?.writes === false,
      schema: definition?.metadata?.schema ?? {},
    };
  });
}

// Contexto completo para a Fase 20.1 (registry real + dispatcher + stores) —
// pronto para ser passado a runToolCallingIntegration.
export function createFinancialDataToolsContext({
  snapshot = null,
  config = {},
  telemetryEnabled = false,
  allowWrites = false,
} = {}) {
  const registry = createFinancialReadToolsRegistry({ snapshot, config, allowWrites });
  const idempotency = createIdempotencyStore();
  const telemetry = createToolCallingTelemetryStore({ enabled: telemetryEnabled });
  const dispatcher = createToolCallingDispatcher({ idempotency, telemetry });
  return { registry, dispatcher, idempotency, telemetry };
}