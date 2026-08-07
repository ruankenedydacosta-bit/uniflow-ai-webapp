// Sprint 4 Ciclo 3 (Bloco 4.6.3) — telemetria SOMENTE DEV do orquestrador
// semântico financeiro.
//
// Nunca registra: secrets, texto completo do usuário, dados financeiros
// brutos (valores/contas/categorias reais), conteúdo de outro workspace.
// Registra só metadados de execução (contagens, tempos, status), o mesmo
// padrão já usado em outras telemetrias DEV do projeto (ex.:
// toolCallingTelemetry.js).
export function buildFinancialOrchestratorTelemetryEntry({
  requestId,
  intent = null,
  source = null,
  llmCallCount = 0,
  modesUsed = [],
  durationsMs = {},
  totalDurationMs = null,
  inputTokens = null,
  outputTokens = null,
  composerUsed = false,
  toolCallCount = 0,
  subIntentCount = 0,
  status = null,
  fallbackReason = null,
} = {}) {
  return Object.freeze({
    requestId: typeof requestId === 'string' ? requestId : null,
    intent: typeof intent === 'string' ? intent : null,
    source: typeof source === 'string' ? source : null,
    llmCallCount: Number.isInteger(llmCallCount) ? llmCallCount : 0,
    modesUsed: Array.isArray(modesUsed) ? Object.freeze([...modesUsed]) : Object.freeze([]),
    durationsMs: Object.freeze({ ...durationsMs }),
    totalDurationMs: typeof totalDurationMs === 'number' ? totalDurationMs : null,
    inputTokens: Number.isFinite(inputTokens) ? inputTokens : null,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : null,
    composerUsed: composerUsed === true,
    toolCallCount: Number.isInteger(toolCallCount) ? toolCallCount : 0,
    subIntentCount: Number.isInteger(subIntentCount) ? subIntentCount : 0,
    status: typeof status === 'string' ? status : null,
    fallbackReason: typeof fallbackReason === 'string' ? fallbackReason : null,
  });
}

// Publica a entrada no console SOMENTE em ambiente DEV (mesmo guard já
// usado por outras telemetrias DEV do projeto -- import.meta.env.DEV).
// Nunca lança; falha de log nunca pode quebrar a resposta ao usuário.
export function logFinancialOrchestratorTelemetry(entry, { isDev = false } = {}) {
  if (!isDev || !entry) return;
  try {
    console.debug('[Uni Financial Orchestrator DEV]', entry);
  } catch {
    // nunca deixa telemetria quebrar o fluxo do usuário
  }
}
