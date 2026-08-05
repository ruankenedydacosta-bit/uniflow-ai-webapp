// Uni Engine — Motor de Raciocínio Financeiro (Fase 15). Bloco 7 (barrel).
export {
  FINANCIAL_TELEMETRY_VERSION,
  FINANCIAL_TELEMETRY_DEFAULT_MAX_ENTRIES,
  FINANCIAL_TELEMETRY_MAX_ENTRIES_LIMIT,
  createFinancialTelemetryStore,
  buildFinancialTelemetryEntry,
  recordFinancialTelemetry,
  getFinancialTelemetrySnapshot,
  resetFinancialTelemetry,
} from './financialTelemetry.js';