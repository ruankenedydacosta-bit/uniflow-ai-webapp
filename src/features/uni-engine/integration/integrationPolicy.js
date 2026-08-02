// Integration — política central (Parte 1: integração segura e controlada).
//
// Aqui ficam: capacidades autorizadas, limites, templates SEGUROS de pergunta
// e esclarecimento (allowlist fechada) e o mapeamento de chaves. Regras:
//   - a integração só troca o TEXTO quando o texto legado bate EXATAMENTE com
//     um template conhecido — nunca inventa texto, nunca altera fatos;
//   - confirmação/erro/sucesso nunca são tocados;
//   - estilo e comprimento respeitam a preferência persistida
//     (conversation_style: simple | normal | detailed);
//   - nenhum template contém nomes, IDs ou valores financeiros.
import { INTEGRATION_QUESTION_KEYS, INTEGRATION_CLARIFICATION_KEYS } from './integrationTypes.js';

export const INTEGRATION_POLICY = Object.freeze({
  version: '1.0',

  // Flags de integração (nascem seguras).
  enabledByDefault: false,
  shadowByDefault: true,
  telemetryByDefault: false,
  legacyPreservedByDefault: true,
  requireActivation: true,
  requireAllowedCapability: true,
  requireClosedCircuitBreaker: true,
  requireValidContracts: true,
  requireSufficientData: true,
  allowProductionActivation: false,

  // Capacidades autorizadas exclusivamente na Parte 1.
  allowedCapabilities: Object.freeze([
    'QUESTION_GUIDANCE',
    'CLARIFICATION_GUIDANCE',
    'RESPONSE_STYLE_GUIDANCE',
    'RESPONSE_LENGTH_GUIDANCE',
    'METADATA_ONLY',
    'DIAGNOSTICS_ONLY',
  ]),

  // Capacidades permanentemente bloqueadas na Parte 1.
  blockedCapabilities: Object.freeze([
    'RESPONSE_CONTENT_INFLUENCE',
    'MEMORY_WRITE',
    'FINANCIAL_EXECUTION',
    'LEARNING_APPLICATION',
  ]),

  // Performance.
  latencyTargets: Object.freeze({
    medianMs: 5,
    p95Ms: 12,
  }),

  // Limites estruturais.
  maxCapabilitiesPerRun: 6,
  maxFieldsStillMissing: 8,
  maxDiagnostics: 12,

  // Limites de confiança e risco.
  minimumConfidence: 0.7,
  maximumRisk: 'LOW',

  // Comprimento: textos acima do limite só são encurtados quando o texto
  // legado é um template conhecido com forma curta segura.
  maximumQuestionLength: 160,
  maximumClarificationLength: 160,
  maximumSimpleResponseLength: 110,
  maximumNormalResponseLength: 240,
  maximumDetailedResponseLength: 480,
  maxTextLength: 240,
  shortTextLength: 110,

  // Telemetria e diagnóstico.
  maximumTelemetryItems: 20,
  maximumDiagnosticsItems: 12,

  // Estilo: a preferência persistida SEMPRE vence a sugestão do motor.
  styleKeys: Object.freeze(['simple', 'normal', 'detailed']),

  // Tipos de resposta que NUNCA têm texto alterado.
  protectedResponseTypes: Object.freeze([
    'confirmation',
    'error',
    'success',
  ]),

  // Ambientes permitidos por padrão (nunca produção sem flag explícita).
  allowedEnvironments: Object.freeze(['development']),
});

// Templates seguros de PERGUNTA por chave. Espelham as perguntas já
// autorizadas pelo pipeline (uniResponseBuilder.js) — a integração apenas
// SELECIONA entre elas; nunca cria pergunta nova.
export const QUESTION_TEMPLATES = Object.freeze({
  amount_required: 'Qual foi o valor dessa movimentação?',
  account_receipt: 'Em qual conta você recebeu esse valor?',
  account_payment: 'Em qual conta você fez esse pagamento?',
  transfer_origin: 'De qual conta o valor foi transferido?',
  transfer_destination: 'Para qual conta o valor foi transferido?',
  adjustment_account: 'Em qual conta você quer ajustar o saldo?',
  category_required: 'Em qual categoria essa movimentação se encaixa?',
  description_required: 'Como você quer identificar esse lançamento?',
  date_required: 'Qual é a data correta dessa movimentação?',
  generic_account: 'Qual conta você quer usar nesta movimentação?',
});

// Mapeamento determinístico: issueField + transactionType do pipeline legado
// → chave de pergunta. Campos fora do mapa não são orientáveis.
export function mapLegacyIssueToQuestionKey({ issueField, transactionType }) {
  const field = String(issueField ?? '');
  const type = String(transactionType ?? '');
  switch (field) {
    case 'amount':
      return 'amount_required';
    case 'category':
      return 'category_required';
    case 'description':
      return 'description_required';
    case 'date':
      return 'date_required';
    case 'destinationAccount':
      return 'transfer_destination';
    case 'intent':
      return 'amount_required';
    case 'account':
      if (type === 'income') return 'account_receipt';
      if (type === 'expense') return 'account_payment';
      if (type === 'transfer') return 'transfer_origin';
      if (type === 'adjustment') return 'adjustment_account';
      return 'generic_account';
    default:
      return null;
  }
}

// Campos ausentes reconhecidos pelo motor → chaves de pergunta seguras.
// O tipo de transação legada refina a chave (conta de recebimento vs.
// pagamento; origem vs. destino de transferência).
export function mapMissingFieldToQuestionKey(field, transactionType = null) {
  const type = String(transactionType ?? '');
  switch (String(field ?? '')) {
    case 'amount':
      return 'amount_required';
    case 'category':
      return 'category_required';
    case 'description':
      return 'description_required';
    case 'date':
      return 'date_required';
    case 'destinationAccount':
      return 'transfer_destination';
    case 'account':
      if (type === 'income') return 'account_receipt';
      if (type === 'expense') return 'account_payment';
      if (type === 'transfer') return 'transfer_origin';
      if (type === 'adjustment') return 'adjustment_account';
      return 'account_receipt';
    default:
      return null;
  }
}

export function getQuestionTemplate(key) {
  return INTEGRATION_QUESTION_KEYS.includes(key)
    ? QUESTION_TEMPLATES[key]
    : null;
}

// Templates seguros de ESCLARECIMENTO por chave. Seleção fechada; nunca
// transforma hipótese em fato nem decide silenciosamente.
export const CLARIFICATION_TEMPLATES = Object.freeze({
  balance_vs_income: 'Você quer registrar esse valor como receita ou ajustar o saldo?',
  ambiguous_account: 'Encontrei mais de uma conta parecida. Qual delas você quer usar?',
  ambiguous_category: 'Qual categoria você quer usar?',
  amount_missing: 'Qual foi o valor?',
  unknown_intent: 'Pode me dizer o que aconteceu, para eu registrar corretamente?',
  generic: 'Pode confirmar qual dos detalhes você quer informar?',
});

// Mapeamento determinístico: situação de ambiguidade legada → chave de
// esclarecimento. Situações fora do mapa não são orientáveis.
export function mapLegacyAmbiguityToClarificationKey({ issueField, transactionType, ambiguityType }) {
  const field = String(issueField ?? '');
  const type = String(transactionType ?? '');
  const ambiguity = String(ambiguityType ?? '');
  if (field === 'intent' || ambiguity === 'intent' || type === 'ambiguous_balance_or_income') {
    return 'balance_vs_income';
  }
  if (field === 'account' || ambiguity === 'account') return 'ambiguous_account';
  if (field === 'category' || ambiguity === 'category') return 'ambiguous_category';
  if (field === 'amount' || ambiguity === 'amount') return 'amount_missing';
  if (ambiguity === 'unknown_intent') return 'unknown_intent';
  if (ambiguity === 'unknown') return 'unknown_intent';
  return null;
}

export function getClarificationTemplate(key) {
  return INTEGRATION_CLARIFICATION_KEYS.includes(key)
    ? CLARIFICATION_TEMPLATES[key]
    : null;
}

// Formas curtas seguras: pares (texto legado → forma curta). Somente pares
// cuja forma curta preserva TODO o conteúdo essencial.
const SHORT_FORM_PAIRS = Object.freeze([
  {
    long: 'Entendi que pode ser um lançamento financeiro, mas não consegui identificar todos os detalhes. Pode reformular dizendo o valor e do que se trata? Por exemplo: "Gastei R$ 50 no mercado."',
    short: 'Não consegui identificar os detalhes desse lançamento. Pode informar o valor e do que se trata?',
  },
  {
    long: 'Não consegui identificar o saldo atual dessa conta para calcular o ajuste. Tente novamente em instantes.',
    short: 'Não consegui identificar o saldo dessa conta. Tente novamente em instantes.',
  },
]);

export function findShortForm(text) {
  const pair = SHORT_FORM_PAIRS.find((item) => item.long === text);
  return pair?.short ?? null;
}

// Sugestão de estilo do motor (styleKey) → chave de estilo da integração.
export function mapEngineStyleKey(styleKey) {
  const key = String(styleKey ?? '');
  if (key === 'concise' || key === 'simple') return 'simple';
  if (key === 'detailed') return 'detailed';
  return 'normal';
}

// Sugestão de comprimento do motor (lengthBand) → banda da integração.
export function mapEngineLengthBand(lengthBand) {
  const band = String(lengthBand ?? '');
  if (band === 'short') return 'short';
  if (band === 'detailed') return 'detailed';
  return 'normal';
}

// Funções de política determinísticas

export function getIntegrationPolicy() {
  return INTEGRATION_POLICY;
}

export function isIntegrationEnabledByPolicy(input) {
  if (!input || typeof input !== 'object') return false;
  if (input.enabled === false) return false;
  if (INTEGRATION_POLICY.enabledByDefault === false && input.enabled !== true) return false;
  return true;
}

export function isCapabilityAllowedByPolicy(capability) {
  if (typeof capability !== 'string') return false;
  return INTEGRATION_POLICY.allowedCapabilities.includes(capability);
}

export function isCapabilityBlockedByPolicy(capability) {
  if (typeof capability !== 'string') return false;
  return INTEGRATION_POLICY.blockedCapabilities.includes(capability);
}

export function isConfidenceAllowedByPolicy(confidence) {
  const value = Number(confidence);
  if (!Number.isFinite(value)) return false;
  return value >= INTEGRATION_POLICY.minimumConfidence;
}

export function isRiskAllowedByPolicy(risk) {
  if (typeof risk !== 'string') return false;
  const rank = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  const maxAllowed = rank[INTEGRATION_POLICY.maximumRisk] ?? 0;
  const actual = rank[risk] ?? 0;
  return actual <= maxAllowed;
}

export function isEnvironmentAllowedByPolicy(environment) {
  if (typeof environment !== 'string') return false;
  if (environment === 'production' && !INTEGRATION_POLICY.allowProductionActivation) return false;
  return INTEGRATION_POLICY.allowedEnvironments.includes(environment);
}

export function isDataSufficientByPolicy(input) {
  if (!input || typeof input !== 'object') return false;
  if (INTEGRATION_POLICY.requireSufficientData === false) return true;
  // Dados mínimos: engineResult e legacy devem existir
  return Boolean(input.engineResult && input.legacy);
}

export function shouldPreserveLegacyPipeline() {
  return INTEGRATION_POLICY.legacyPreservedByDefault === true;
}

export function shouldUseIntegrationFallback(input) {
  if (!input || typeof input !== 'object') return true;

  // Integração desabilitada
  if (!isIntegrationEnabledByPolicy(input)) return true;

  // Activation Engine desabilitado ou inválido
  if (INTEGRATION_POLICY.requireActivation) {
    if (!input.activation || typeof input.activation !== 'object') return true;
    if (input.activation.enabled === false) return true;
    if (input.activation.valid === false) return true;
  }

  // Capability não permitida
  if (INTEGRATION_POLICY.requireAllowedCapability) {
    const capabilities = Array.isArray(input.capabilities) ? input.capabilities : [];
    if (capabilities.some((c) => !isCapabilityAllowedByPolicy(c))) return true;
  }

  // Capability bloqueada
  if (INTEGRATION_POLICY.requireAllowedCapability) {
    const capabilities = Array.isArray(input.capabilities) ? input.capabilities : [];
    if (capabilities.some((c) => isCapabilityBlockedByPolicy(c))) return true;
  }

  // Contrato inválido
  if (INTEGRATION_POLICY.requireValidContracts) {
    if (input.contractValid === false) return true;
    if (input.validationErrors && input.validationErrors.length > 0) return true;
  }

  // Confiança insuficiente
  if (input.confidence !== undefined && !isConfidenceAllowedByPolicy(input.confidence)) return true;

  // Risco excessivo
  if (input.risk !== undefined && !isRiskAllowedByPolicy(input.risk)) return true;

  // Dados insuficientes
  if (!isDataSufficientByPolicy(input)) return true;

  // Circuit breaker aberto
  if (INTEGRATION_POLICY.requireClosedCircuitBreaker) {
    if (input.circuitBreakerOpen === true) return true;
  }

  // Ambiente não autorizado
  if (input.environment !== undefined && !isEnvironmentAllowedByPolicy(input.environment)) return true;

  // Erro do adapter
  if (input.adapterError === true) return true;

  return false;
}