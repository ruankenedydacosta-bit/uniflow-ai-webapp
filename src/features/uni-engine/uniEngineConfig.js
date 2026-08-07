// Configuração e feature flags do Uni Engine (Fase 1 — Shadow Mode).
//
// Padrão de produção é SEGURO: `enabled` nasce falso e só é ativado por
// variável explícita. Nenhuma variável ausente ativa o motor acidentalmente.
//
// Variáveis de ambiente suportadas (apenas booleanas explícitas):
//   - VITE_UNI_ENGINE_ENABLED            → enabled (default: false)
//   - VITE_UNI_ENGINE_SHADOW_MODE         → shadowMode (default: true)
//   - VITE_UNI_ENGINE_TELEMETRY_ENABLED   → telemetryEnabled (default: DEV)
//
// Fase 3 — Memória Inteligente Persistente (separada do motor cognitivo):
//   - VITE_UNI_ENGINE_MEMORY_ENABLED          → memoryEnabled (default: false)
//   - VITE_UNI_ENGINE_MEMORY_READ_ENABLED     → memoryReadEnabled (default: false)
//   - VITE_UNI_ENGINE_MEMORY_WRITE_ENABLED    → memoryWriteEnabled (default: false)
//   - VITE_UNI_ENGINE_MEMORY_SHADOW_MODE      → memoryShadowMode (default: true)
//
// Fase 4 — Modelo Epistêmico (Shadow Mode puro):
//   - VITE_UNI_ENGINE_EPISTEMIC_ENABLED           → epistemicEnabled (default: false)
//   - VITE_UNI_ENGINE_EPISTEMIC_SHADOW_MODE        → epistemicShadowMode (default: true)
//   - VITE_UNI_ENGINE_EPISTEMIC_TELEMETRY_ENABLED  → epistemicTelemetryEnabled (default: DEV)
//
// Fase 5 — Camada de Decisão Cognitiva (Shadow Mode puro). TODAS as flags
// nascem DESLIGADAS por padrão:
//   - VITE_UNI_ENGINE_DECISION_ENABLED     → decisionEnabled (default: false)
//   - VITE_UNI_ENGINE_DECISION_SHADOW      → decisionShadowMode (default: false)
//   - VITE_UNI_ENGINE_DECISION_TELEMETRY   → decisionTelemetryEnabled (default: false)
//
// Fase 6 — Planning Engine (Shadow Mode puro):
//   - VITE_UNI_ENGINE_PLANNING_ENABLED     → planningEnabled (default: false)
//   - VITE_UNI_ENGINE_PLANNING_SHADOW      → planningShadowMode (default: false)
//   - VITE_UNI_ENGINE_PLANNING_TELEMETRY   → planningTelemetryEnabled (default: false)
//
// Fase 7 — Goal Engine (Shadow Mode puro):
//   - VITE_UNI_ENGINE_GOALS_ENABLED        → goalsEnabled (default: false)
//   - VITE_UNI_ENGINE_GOALS_SHADOW         → goalsShadowMode (default: true)
//   - VITE_UNI_ENGINE_GOALS_TELEMETRY      → goalsTelemetryEnabled (default: false)
//
// Fase 8 — Reflection & Learning Engine (Shadow Mode puro):
//   - VITE_UNI_ENGINE_REFLECTION_ENABLED            → reflectionEnabled (default: false)
//   - VITE_UNI_ENGINE_REFLECTION_SHADOW             → reflectionShadowMode (default: true)
//   - VITE_UNI_ENGINE_REFLECTION_TELEMETRY          → reflectionTelemetryEnabled (default: false)
//   - VITE_UNI_ENGINE_LEARNING_CANDIDATES_ENABLED   → learningCandidatesEnabled (default: false)
//
// Fase 9 — Activation Engine (ativação gradual):
//   - VITE_UNI_ENGINE_ACTIVATION_ENABLED              → activationEnabled (default: false)
//   - VITE_UNI_ENGINE_ACTIVATION_SHADOW               → activationShadowMode (default: true)
//   - VITE_UNI_ENGINE_ACTIVATION_TELEMETRY            → activationTelemetryEnabled (default: false)
//   - VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS         → activationEnvironments (default: ['development'])
//   - VITE_UNI_ENGINE_ACTIVATION_TEST_USER_IDS        → activationTestUserIds (default: [])
//   - VITE_UNI_ENGINE_ACTIVATION_ROLLOUT_PERCENT      → activationRolloutPercent (default: 0, clamp 0–100)
//
// Parte 1 — Integration (integração segura e controlada ao pipeline real):
//   - VITE_UNI_ENGINE_INTEGRATION_ENABLED             → integrationEnabled (default: false)
//   - VITE_UNI_ENGINE_INTEGRATION_SHADOW              → integrationShadowMode (default: true)
//   - VITE_UNI_ENGINE_INTEGRATION_TELEMETRY           → integrationTelemetryEnabled (default: false)
//
// Parte 5 — Application (primeira ativação controlada):
//   - VITE_UNI_ENGINE_APPLICATION_ENABLED             → applicationEnabled (default: false)
//   - VITE_UNI_ENGINE_APPLICATION_TELEMETRY           → applicationTelemetryEnabled (default: false)
//
// Fase 15 — Motor de Raciocínio Financeiro (Shadow Mode puro):
//   - VITE_UNI_ENGINE_FINANCIAL_REASONING_ENABLED     → financialReasoningEnabled (default: false)
//   - VITE_UNI_ENGINE_FINANCIAL_REASONING_SHADOW      → financialReasoningShadowMode (default: true)
//   - VITE_UNI_ENGINE_FINANCIAL_REASONING_TELEMETRY   → financialReasoningTelemetryEnabled (default: false)
//
// Fase 20 — Tool Calling (base + adaptador OpenAI). Tudo nasce desligado:
//   - VITE_UNI_ENGINE_TOOL_CALLING_ENABLED      → toolCallingEnabled (default: false)
//   - VITE_UNI_ENGINE_TOOL_CALLING_SHADOW       → toolCallingShadowMode (default: true)
//   - VITE_UNI_ENGINE_TOOL_CALLING_TELEMETRY    → toolCallingTelemetryEnabled (default: false)
//   - VITE_UNI_ENGINE_TOOL_CALLING_REQUIRED     → toolCallingRequired (default: false)
//   - VITE_UNI_ENGINE_TOOL_CALLING_EXECUTION_ALLOWED → toolCallingExecutionAllowed (default: false)
//
// Regras da Fase 20:
//   - Tool Calling exige o motor cognitivo ligado (`enabled`); desligado,
//     nenhum dispatcher roda e a saída é 100% legada;
//   - nenhuma execução sem autorização explícita e executionAllowed;
//   - Pending Action / confirmação pendente sempre bloqueiam execução;
//   - ferramentas writes=true exigem allowWrites explícito do registry;
//   - nenhuma ferramenta real é registrada em produção — apenas fixtures
//     seguras de teste na pasta de integração;
//   - produção nunca ativa por acidente.
//
// Regras da Parte 5:
//   - a aplicação exige motor ligado E Activation ligada E Integration ligada;
//   - RESPONSE_STYLE_GUIDANCE e RESPONSE_LENGTH_GUIDANCE podem ser APLICADAS
//     (texto); QUESTION_GUIDANCE (Bloco 2) e CLARIFICATION_GUIDANCE (Bloco 3)
//     produzem APENAS decisões observacionais (questionDecision /
//     clarificationDecision) — nunca texto de pergunta/esclarecimento; a Uni
//     nunca gera automaticamente;
//   - aplicação desligada → pipeline 100% legado (fallback ao texto legado);
//   - produção não ativa acidentalmente; nenhum ID em logs/telemetria.
//
// Regras da Parte 1:
//   - integração exige motor ligado E Activation ligada (cada capacidade
//     precisa da autorização da Activation Engine);
//   - integração desligada → pipeline 100% legado;
//   - integração em Shadow Mode avalia, mas NUNCA aplica;
//   - produção não ativa acidentalmente; nenhum ID em logs/telemetria.
//
// Flags por capacidade (Fase 9), todas false por padrão:
//   - VITE_UNI_ENGINE_CAP_METADATA_ONLY               → activationCapabilities.METADATA_ONLY
//   - VITE_UNI_ENGINE_CAP_DIAGNOSTICS_ONLY            → activationCapabilities.DIAGNOSTICS_ONLY
//   - VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE           → activationCapabilities.QUESTION_GUIDANCE
//   - VITE_UNI_ENGINE_CAP_CLARIFICATION_GUIDANCE      → activationCapabilities.CLARIFICATION_GUIDANCE
//   - VITE_UNI_ENGINE_CAP_RESPONSE_STYLE_GUIDANCE     → activationCapabilities.RESPONSE_STYLE_GUIDANCE
//   - VITE_UNI_ENGINE_CAP_RESPONSE_LENGTH_GUIDANCE    → activationCapabilities.RESPONSE_LENGTH_GUIDANCE
//   - VITE_UNI_ENGINE_CAP_CATEGORY_SUGGESTION         → activationCapabilities.CATEGORY_SUGGESTION
//   - VITE_UNI_ENGINE_CAP_ACCOUNT_SUGGESTION          → activationCapabilities.ACCOUNT_SUGGESTION
//   - VITE_UNI_ENGINE_CAP_GOAL_SUGGESTION             → activationCapabilities.GOAL_SUGGESTION
//   - VITE_UNI_ENGINE_CAP_PLANNING_SUGGESTION         → activationCapabilities.PLANNING_SUGGESTION
//   - VITE_UNI_ENGINE_CAP_RISK_WARNING                → activationCapabilities.RISK_WARNING
//   - VITE_UNI_ENGINE_CAP_CONFIDENCE_DISCLOSURE       → activationCapabilities.CONFIDENCE_DISCLOSURE
//   - VITE_UNI_ENGINE_CAP_MEMORY_READ_GUIDANCE        → activationCapabilities.MEMORY_READ_GUIDANCE
//   - VITE_UNI_ENGINE_CAP_EPISTEMIC_CAUTION           → activationCapabilities.EPISTEMIC_CAUTION
//   - VITE_UNI_ENGINE_CAP_DECISION_RECOMMENDATION     → activationCapabilities.DECISION_RECOMMENDATION
//
// Regras da Fase 9:
//   - motor desligado → activation desligada;
//   - activation desligada → shadow/telemetria desligados e TODAS as
//     capacidades false;
//   - capacidades proibidas (RESPONSE_CONTENT_INFLUENCE, MEMORY_WRITE,
//     FINANCIAL_EXECUTION, LEARNING_APPLICATION) NÃO têm flag — bloqueio
//     absoluto na política;
//   - produção não ativa por acidente;
//   - IDs de teste nunca entram na telemetria.
//
// Regras da Fase 8:
//   - motor desligado → reflexão desligada;
//   - reflexão desligada → telemetria desligada;
//   - learning candidates desligado → pode refletir, mas não gerar candidatos;
//   - variável ausente nunca ativa;
//   - produção nunca ativa acidentalmente.
//
// Padrões seguros: leitura desligada, escrita desligada, shadow ligado.
// Nenhuma variável ausente ativa memória. A memória depende do motor ligado
// (`enabled`), e leitura/escrita dependem de `memoryEnabled` — cascata
// segura contra ativação acidental em produção. O modelo epistêmico segue a
// MESMA cascata: exige o motor ligado e o próprio `epistemicEnabled`;
// telemetria epistêmica exige o modelo ligado.
//
// Nesta fase `learningEnabled` permanece SEMPRE falso.
//
// A configuração é testável: `createUniEngineConfig({ env })` recebe um mapa
// de variáveis sem depender do ambiente global; o fallback para
// import.meta.env só acontece quando nenhum mapa é informado.
import { UNI_ENGINE_VERSION } from './uniEngineContracts.js';

export const UNI_ENGINE_DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  shadowMode: true,
  telemetryEnabled: false,
  learningEnabled: false,
  memoryEnabled: false,
  memoryReadEnabled: false,
  memoryWriteEnabled: false,
  memoryShadowMode: true,
  epistemicEnabled: false,
  epistemicShadowMode: true,
  epistemicTelemetryEnabled: false,
  decisionEnabled: false,
  decisionShadowMode: false,
  decisionTelemetryEnabled: false,
  planningEnabled: false,
  planningShadowMode: false,
  planningTelemetryEnabled: false,
  goalsEnabled: false,
  goalsShadowMode: true,
  goalsTelemetryEnabled: false,
  reflectionEnabled: false,
  reflectionShadowMode: true,
  reflectionTelemetryEnabled: false,
  learningCandidatesEnabled: false,
  activationEnabled: false,
  activationShadowMode: true,
  activationTelemetryEnabled: false,
  activationEnvironments: ['development'],
  activationTestUserIds: [],
  activationRolloutPercent: 0,
  activationCapabilities: Object.freeze({
    METADATA_ONLY: false,
    DIAGNOSTICS_ONLY: false,
    QUESTION_GUIDANCE: false,
    CLARIFICATION_GUIDANCE: false,
    RESPONSE_STYLE_GUIDANCE: false,
    RESPONSE_LENGTH_GUIDANCE: false,
    CATEGORY_SUGGESTION: false,
    ACCOUNT_SUGGESTION: false,
    GOAL_SUGGESTION: false,
    PLANNING_SUGGESTION: false,
    RISK_WARNING: false,
    CONFIDENCE_DISCLOSURE: false,
    MEMORY_READ_GUIDANCE: false,
    EPISTEMIC_CAUTION: false,
    DECISION_RECOMMENDATION: false,
  }),
  // Parte 1 — Integration. Tudo nasce desligado; shadow ligado por padrão
  // (avaliar é seguro); telemetria sempre desligada por padrão.
  integrationEnabled: false,
  integrationShadowMode: true,
  integrationTelemetryEnabled: false,
  // Parte 5 — Application (primeira ativação controlada). Tudo nasce
  // desligado; aplicação exige motor + Activation + Integration ligadas.
  applicationEnabled: false,
  applicationTelemetryEnabled: false,
  // Fase 15 — Motor de Raciocínio Financeiro (Shadow Mode puro). Tudo nasce
  // desligado; shadow ligado por padrão (observar é seguro); telemetria
  // sempre desligada por padrão. O motor NUNCA aplica, NUNCA executa e NUNCA
  // escreve — produz apenas inteligência descartável.
  financialReasoningEnabled: false,
  financialReasoningShadowMode: true,
  financialReasoningTelemetryEnabled: false,
  // Parte 6 — Controlled Question (perguntas seguras pelo pipeline legado).
  // Interruptor MESTRE da parte: sem ele, NENHUMA pergunta controlada é
  // emitida, mesmo com as flags das capacidades autorizadas.
  controlledQuestionsEnabled: false,
// Parte 8 — Conversation Routing (roteamento conversacional controlado em
// DEV). Interruptor MESTRE da parte: sem ele, o pipeline legado NUNCA
// consulta o Conversation Planner para selecionar rota — a saída é sempre
// 100% legada. Exige motor + Activation + Integration + Application.
conversationRoutingEnabled: false,
  // Parte 9 — Cognitive Orchestrator (consolidação final do Uni Engine).
  // Interruptor MESTRE da parte: sem ele, o pipeline legado nunca consolida
  // as camadas cognitivas — a saída é sempre 100% legada. Exige motor +
  // Activation + Integration + Application.
cognitiveOrchestratorEnabled: false,
  // Parte 10 — Controlled Rollout (rollout operacional, gates e auditoria).
  // Interruptor MESTRE da parte: sem ele, o pipeline legado nunca aplica
  // nenhuma capability permitida por rollout — a saída é sempre 100% legada.
  // Exige motor + Activation + Integration + Application.
  rolloutEnabled: false,
  // Fase 20 — Tool Calling. Tudo nasce desligado; shadow ligado por padrão
  // (avaliar é seguro); telemetria sempre desligada por padrão; nenhuma
  // execução é obrigatória por padrão.
  toolCallingEnabled: false,
  toolCallingShadowMode: true,
  toolCallingTelemetryEnabled: false,
  toolCallingRequired: false,
  toolCallingExecutionAllowed: false,
});

const BOOLEAN_VALUES = new Set(['true', '1', 'false', '0']);

function parseBooleanEnv(source, name, fallback) {
  const raw = source?.[name];
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string' && BOOLEAN_VALUES.has(raw.trim().toLowerCase())) {
    return raw.trim().toLowerCase() === 'true' || raw.trim() === '1';
  }
  return fallback;
}

// Lista de ambientes permitidos: string separada por vírgula. Somente
// ambientes do enum são aceitos; valor inválido nunca ativa.
const VALID_ENVIRONMENTS = new Set(['development', 'staging', 'production', 'test']);

function parseActivationEnvironments(source, name) {
  const raw = source?.[name];
  if (Array.isArray(raw)) {
    return raw.filter((item) => typeof item === 'string' && VALID_ENVIRONMENTS.has(item.trim()));
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => VALID_ENVIRONMENTS.has(item));
  }
  return [];
}

// Lista de IDs de usuário de teste. Nunca vai para a telemetria.
function parseTestUserIds(source, name) {
  const raw = source?.[name];
  if (Array.isArray(raw)) {
    return raw.filter((item) => typeof item === 'string' && item.trim());
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

// Percentual de rollout (canary): inteiro clampado entre 0 e 100; inválido → 0.
function parseRolloutPercent(source, name) {
  const raw = source?.[name];
  let value = 0;
  if (typeof raw === 'number') {
    value = raw;
  } else if (typeof raw === 'string') {
    value = Number.parseInt(raw, 10);
  }
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

export function resolveUniEngineEnv(source) {
  return (source && typeof source === 'object') ? source : {};
}

export function createUniEngineConfig(overrides = {}) {
  const safeOverrides = overrides && typeof overrides === 'object' ? overrides : {};
  const env =
    resolveUniEngineEnv(safeOverrides.env)
    ?? (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {});
  const isDev =
    typeof env.DEV === 'boolean'
      ? env.DEV
      : env.MODE === 'development';

  const config = {
    enabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_ENABLED', false),
    shadowMode: parseBooleanEnv(env, 'VITE_UNI_ENGINE_SHADOW_MODE', true),
    telemetryEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_TELEMETRY_ENABLED',
      isDev,
    ),
    // Fase 1: aprendizado assistido ainda não existe — nunca ativável.
    learningEnabled: false,
    // Fase 3 — Memória Inteligente Persistente. Separada do motor: leitura e
    // escrita têm flags próprias e nascem desligadas.
    memoryEnabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_MEMORY_ENABLED', false),
    memoryReadEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_MEMORY_READ_ENABLED',
      false,
    ),
    memoryWriteEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_MEMORY_WRITE_ENABLED',
      false,
    ),
    memoryShadowMode: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_MEMORY_SHADOW_MODE',
      true,
    ),
    // Fase 4 — Modelo Epistêmico em Shadow Mode. Nasce desligado; sombreia
    // por padrão quando ligado; telemetria apenas em desenvolvimento.
    epistemicEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_EPISTEMIC_ENABLED',
      false,
    ),
    epistemicShadowMode: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_EPISTEMIC_SHADOW_MODE',
      true,
    ),
    epistemicTelemetryEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_EPISTEMIC_TELEMETRY_ENABLED',
      isDev,
    ),
    // Fase 5 — Camada de Decisão Cognitiva. TODAS as flags nascem
    // DESLIGADAS por padrão (shadow mode de decisão incluído).
    decisionEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_DECISION_ENABLED',
      false,
    ),
    decisionShadowMode: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_DECISION_SHADOW',
      false,
    ),
    decisionTelemetryEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_DECISION_TELEMETRY',
      false,
    ),
    planningEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_PLANNING_ENABLED',
      false,
    ),
    planningShadowMode: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_PLANNING_SHADOW',
      false,
    ),
    planningTelemetryEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_PLANNING_TELEMETRY',
      false,
    ),
    // Fase 7 — Goal Engine. Nasce desligado; shadow ligado por padrão
    // (sombrear é seguro); telemetria sempre desligada por padrão.
    goalsEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_GOALS_ENABLED',
      false,
    ),
    goalsShadowMode: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_GOALS_SHADOW',
      true,
    ),
    goalsTelemetryEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_GOALS_TELEMETRY',
      false,
    ),
    // Fase 8 — Reflection & Learning Engine. Nasce desligado; shadow ligado
    // por padrão (refletir é seguro); telemetria sempre desligada por padrão.
    reflectionEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_REFLECTION_ENABLED',
      false,
    ),
    reflectionShadowMode: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_REFLECTION_SHADOW',
      true,
    ),
    reflectionTelemetryEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_REFLECTION_TELEMETRY',
      false,
    ),
    learningCandidatesEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_LEARNING_CANDIDATES_ENABLED',
      false,
    ),
    // Fase 9 — Activation Engine (ativação gradual). Tudo nasce desligado;
    // ambiente permite apenas desenvolvimento por padrão; teste nunca entra
    // na telemetria; rollout percentual clampado entre 0 e 100.
    activationEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_ACTIVATION_ENABLED',
      false,
    ),
    activationShadowMode: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_ACTIVATION_SHADOW',
      true,
    ),
    activationTelemetryEnabled: parseBooleanEnv(
      env,
      'VITE_UNI_ENGINE_ACTIVATION_TELEMETRY',
      false,
    ),
    activationEnvironments: parseActivationEnvironments(
      env,
      'VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS',
    ),
    activationTestUserIds: parseTestUserIds(
      env,
      'VITE_UNI_ENGINE_ACTIVATION_TEST_USER_IDS',
    ),
    activationRolloutPercent: parseRolloutPercent(
      env,
      'VITE_UNI_ENGINE_ACTIVATION_ROLLOUT_PERCENT',
    ),
    activationCapabilities: {
      METADATA_ONLY: parseBooleanEnv(env, 'VITE_UNI_ENGINE_CAP_METADATA_ONLY', false),
      DIAGNOSTICS_ONLY: parseBooleanEnv(env, 'VITE_UNI_ENGINE_CAP_DIAGNOSTICS_ONLY', false),
      QUESTION_GUIDANCE: parseBooleanEnv(env, 'VITE_UNI_ENGINE_CAP_QUESTION_GUIDANCE', false),
      CLARIFICATION_GUIDANCE: parseBooleanEnv(env, 'VITE_UNI_ENGINE_CAP_CLARIFICATION_GUIDANCE', false),
      RESPONSE_STYLE_GUIDANCE: parseBooleanEnv(env, 'VITE_UNI_ENGINE_CAP_RESPONSE_STYLE_GUIDANCE', false),
      RESPONSE_LENGTH_GUIDANCE: parseBooleanEnv(env, 'VITE_UNI_ENGINE_CAP_RESPONSE_LENGTH_GUIDANCE', false),
      CATEGORY_SUGGESTION: parseBooleanEnv(env, 'VITE_UNI_ENGINE_CAP_CATEGORY_SUGGESTION', false),
      ACCOUNT_SUGGESTION: parseBooleanEnv(env, 'VITE_UNI_ENGINE_CAP_ACCOUNT_SUGGESTION', false),
      GOAL_SUGGESTION: parseBooleanEnv(env, 'VITE_UNI_ENGINE_CAP_GOAL_SUGGESTION', false),
      PLANNING_SUGGESTION: parseBooleanEnv(env, 'VITE_UNI_ENGINE_CAP_PLANNING_SUGGESTION', false),
      RISK_WARNING: parseBooleanEnv(env, 'VITE_UNI_ENGINE_CAP_RISK_WARNING', false),
      CONFIDENCE_DISCLOSURE: parseBooleanEnv(env, 'VITE_UNI_ENGINE_CAP_CONFIDENCE_DISCLOSURE', false),
      MEMORY_READ_GUIDANCE: parseBooleanEnv(env, 'VITE_UNI_ENGINE_CAP_MEMORY_READ_GUIDANCE', false),
      EPISTEMIC_CAUTION: parseBooleanEnv(env, 'VITE_UNI_ENGINE_CAP_EPISTEMIC_CAUTION', false),
      DECISION_RECOMMENDATION: parseBooleanEnv(env, 'VITE_UNI_ENGINE_CAP_DECISION_RECOMMENDATION', false),
    },
    // Parte 1 — Integration. Nasce desligada; exige motor + Activation.
    integrationEnabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_INTEGRATION_ENABLED', false),
    integrationShadowMode: parseBooleanEnv(env, 'VITE_UNI_ENGINE_INTEGRATION_SHADOW', true),
    integrationTelemetryEnabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_INTEGRATION_TELEMETRY', false),
    // Parte 5 — Application. Nasce desligada; exige motor + Activation +
    // Integration; telemetria sempre desligada por padrão.
    applicationEnabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_APPLICATION_ENABLED', false),
    applicationTelemetryEnabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_APPLICATION_TELEMETRY', false),
    // Parte 6 — Controlled Question (perguntas seguras pelo pipeline legado).
    // Interruptor mestre; false por padrão. Usuário nunca é autorizado por
    // ausência de configuração.
    controlledQuestionsEnabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_CONTROLLED_QUESTIONS_ENABLED', false),
    // Parte 8 — Conversation Routing (roteamento conversacional controlado em
    // DEV). Interruptor mestre; false por padrão. O pipeline legado NUNCA
    // consulta o Conversation Planner para selecionar rota — a saída é sempre
    // 100% legada. Exige motor + Activation + Integration + Application.
    conversationRoutingEnabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_CONVERSATION_ROUTING_ENABLED', false),
    // Parte 9 — Cognitive Orchestrator (consolidação final do Uni Engine).
    // Interruptor mestre da parte: sem ele, o pipeline legado nunca consolida
    // as camadas cognitivas — a saída é sempre 100% legada. Exige motor +
    // Activation + Integration + Application.
    cognitiveOrchestratorEnabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_COGNITIVE_ORCHESTRATOR_ENABLED', false),
    // Fase 15 — Motor de Raciocínio Financeiro. Nasce desligado; shadow ligado
    // por padrão (observar é seguro); telemetria sempre desligada por padrão.
    financialReasoningEnabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_FINANCIAL_REASONING_ENABLED', false),
    financialReasoningShadowMode: parseBooleanEnv(env, 'VITE_UNI_ENGINE_FINANCIAL_REASONING_SHADOW', true),
    financialReasoningTelemetryEnabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_FINANCIAL_REASONING_TELEMETRY', false),
    // Fase 18 — Runtime Financeiro Visível. Nasce desligado; shadow mode visível
    // nasce desligado (requer opt-in explícito); telemetria sempre desligada por padrão.
    // Resposta visível controlada: exige intenção allowlisted, confiança >= 0.90,
    // validação factual, feature flag explícita, ambiente autorizado.
    financialRuntimeVisibleEnabled: parseBooleanEnv(env, 'VITE_UNI_FINANCIAL_RUNTIME_VISIBLE_ENABLED', false),
    financialRuntimeVisibleCanaryEnabled: parseBooleanEnv(env, 'VITE_UNI_FINANCIAL_RUNTIME_VISIBLE_CANARY_ENABLED', false),
    financialRuntimeVisibleTelemetryEnabled: parseBooleanEnv(env, 'VITE_UNI_FINANCIAL_RUNTIME_VISIBLE_TELEMETRY', false),
    financialRuntimeVisibleMinConfidence: parseFloat(env?.VITE_UNI_FINANCIAL_RUNTIME_VISIBLE_MIN_CONFIDENCE ?? '0.90'),
    // Allowlist de intenções permitidas para resposta visível (string separada por vírgula).
    financialRuntimeVisibleAllowedIntents: (() => {
      const raw = env?.VITE_UNI_FINANCIAL_RUNTIME_VISIBLE_ALLOWED_INTENTS;
      if (typeof raw === 'string' && raw.trim()) {
        return raw.split(',').map(s => s.trim()).filter(Boolean);
      }
      return [
        'balance_query',
        'income_query',
        'expense_query',
        'savings_query',
        'net_worth_query',
        'cashflow_query',
        'category_breakdown_query',
        'account_query',
        'period_comparison_query',
        'projection_query',
        'goals_query',
        'credit_query',
        'investments_query',
        'recurring_query',
        'installments_query',
      ];
    })(),
    // Fase 19 — Rollout Control Determínstico. Tudo nasce DESLIGADO por padrão;
// Canary percent 0 seleciona ninguém; produção bloqueada até flag explícita true;
// Cascade seguro: motor/engine desligado ⇒ rollout desligado;
// Shadow mode nunca aprova influência;
// Telemetria só ligada quando explicitamente configurada.
// Allowlist de intenções permitidas para rollout (string separada por vírgula).
financialRolloutEnabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_FINANCIAL_ROLLOUT_ENABLED', false),
  financialRolloutShadowMode: parseBooleanEnv(env, 'VITE_UNI_ENGINE_FINANCIAL_ROLLOUT_SHADOW_MODE', true),
  financialRolloutVisibleEnabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_FINANCIAL_ROLLOUT_VISIBLE_ENABLED', false),
  financialRolloutProductionEnabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_FINANCIAL_ROLLOUT_PRODUCTION_ENABLED', false),
  financialRolloutCanaryEnabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_FINANCIAL_ROLLOUT_CANARY_ENABLED', false),
  financialRolloutCanaryPercentage: parseInt(env?.VITE_UNI_ENGINE_FINANCIAL_ROLLOUT_CANARY_PERCENTAGE ?? '0', 10),
  financialRolloutMinimumConfidence: parseFloat(env?.VITE_UNI_ENGINE_FINANCIAL_ROLLOUT_MIN_CONFIDENCE ?? '0.90'),
  financialRolloutTelemetryEnabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_FINANCIAL_ROLLOUT_TELEMETRY_ENABLED', false),
  financialRolloutEmergencyRollback: parseBooleanEnv(env, 'VITE_UNI_ENGINE_FINANCIAL_ROLLOUT_EMERGENCY_ROLLBACK', false),
  financialRolloutRequireEligibility: parseBooleanEnv(env, 'VITE_UNI_ENGINE_FINANCIAL_ROLLOUT_REQUIRE_ELIGIBILITY', true),
  financialRolloutRequireFactualValidation: parseBooleanEnv(env, 'VITE_UNI_ENGINE_FINANCIAL_ROLLOUT_REQUIRE_FACTUAL_VALIDATION', true),
  financialRolloutRequireIdentityMatch: parseBooleanEnv(env, 'VITE_UNI_ENGINE_FINANCIAL_ROLLOUT_REQUIRE_IDENTITY_MATCH', true),
  financialRolloutRequireConversationMatch: parseBooleanEnv(env, 'VITE_UNI_ENGINE_FINANCIAL_ROLLOUT_REQUIRE_CONVERSATION_MATCH', true),
  financialRolloutRequireWorkspaceMatch: parseBooleanEnv(env, 'VITE_UNI_ENGINE_FINANCIAL_ROLLOUT_REQUIRE_WORKSPACE_MATCH', true),
  // FASE 19.1: turnId/messageId são strings simples reais no contrato do
  // runtime -- gates de turno/mensagem comparam identity.turnId/messageId
  // (turno atual) contra runtimeResult.turnId/messageId (turno de produção).
  financialRolloutRequireTurnMatch: parseBooleanEnv(env, 'VITE_UNI_ENGINE_FINANCIAL_ROLLOUT_REQUIRE_TURN_MATCH', true),
  financialRolloutRequireMessageMatch: parseBooleanEnv(env, 'VITE_UNI_ENGINE_FINANCIAL_ROLLOUT_REQUIRE_MESSAGE_MATCH', true),
  financialRolloutAllowedIntents: (() => {
    const raw = env?.VITE_UNI_ENGINE_FINANCIAL_ROLLOUT_ALLOWED_INTENTS;
    if (typeof raw === 'string' && raw.trim()) {
      return raw.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  })(),
  financialRolloutDeniedIntents: (() => {
    const raw = env?.VITE_UNI_ENGINE_FINANCIAL_ROLLOUT_DENIED_INTENTS;
    if (typeof raw === 'string' && raw.trim()) {
      return raw.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  })(),
  // Fase 20 — Tool Calling. Nasce desligado; shadow ligado por padrão
  // (avaliar é seguro); telemetria sempre desligada por padrão; nenhuma
  // execução é obrigatória por padrão. Variável ausente nunca ativa.
  toolCallingEnabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_TOOL_CALLING_ENABLED', false),
  toolCallingShadowMode: parseBooleanEnv(env, 'VITE_UNI_ENGINE_TOOL_CALLING_SHADOW', true),
  toolCallingTelemetryEnabled: parseBooleanEnv(env, 'VITE_UNI_ENGINE_TOOL_CALLING_TELEMETRY', false),
  toolCallingRequired: parseBooleanEnv(env, 'VITE_UNI_ENGINE_TOOL_CALLING_REQUIRED', false),
  toolCallingExecutionAllowed: parseBooleanEnv(env, 'VITE_UNI_ENGINE_TOOL_CALLING_EXECUTION_ALLOWED', false),
  };

  // Segurança: shadowMode só faz sentido com o motor ligado; o motor nunca
  // roda com enabled=false, independentemente do restante.
  if (!config.enabled) {
    config.shadowMode = false;
  }

  // Fase 3 — cascata de segurança da memória: memória exige motor ligado;
  // leitura/escrita exigem memória ligada; shadow de memória exige memória.
  if (!config.enabled) {
    config.memoryEnabled = false;
  }
  if (!config.memoryEnabled) {
    config.memoryReadEnabled = false;
    config.memoryWriteEnabled = false;
    config.memoryShadowMode = false;
  }

  // Fase 4 — cascata de segurança do modelo epistêmico: exige o motor
  // ligado; shadow e telemetria epistêmicos exigem o modelo ligado.
  if (!config.enabled) {
    config.epistemicEnabled = false;
  }
  if (!config.epistemicEnabled) {
    config.epistemicShadowMode = false;
    config.epistemicTelemetryEnabled = false;
  }

  // Fase 5 — cascata de segurança da camada de decisão: exige o motor
  // ligado; shadow e telemetria de decisão exigem a camada ligada. Nada
  // liga a camada acidentalmente — todas as flags nascem false.
  if (!config.enabled) {
    config.decisionEnabled = false;
  }
  if (!config.decisionEnabled) {
    config.decisionShadowMode = false;
    config.decisionTelemetryEnabled = false;
  }

  // Fase 6 — Planning Engine exige motor e flag própria. A execução segue
  // impossível: somente a combinação enabled + planning + shadow produz
  // uma representação descartável.
  if (!config.enabled) config.planningEnabled = false;
  if (!config.planningEnabled) {
    config.planningShadowMode = false;
    config.planningTelemetryEnabled = false;
  }

  // Fase 7 — Goal Engine exige o motor ligado; shadow e telemetria exigem o
  // engine ligado. Nada liga objetivos acidentalmente.
  if (!config.enabled) config.goalsEnabled = false;
  if (!config.goalsEnabled) {
    config.goalsShadowMode = false;
    config.goalsTelemetryEnabled = false;
  }

  // Fase 8 — Reflection & Learning Engine exige o motor ligado; shadow e
  // telemetria exigem a reflexão ligada; learning candidates exigem a
  // reflexão ligada. Nada liga reflexão acidentalmente — todas as flags
  // nascem false, exceto reflectionShadowMode (true quando ligada).
  if (!config.enabled) config.reflectionEnabled = false;
  if (!config.reflectionEnabled) {
    config.reflectionShadowMode = false;
    config.reflectionTelemetryEnabled = false;
    config.learningCandidatesEnabled = false;
  }

  // Fase 9 — Activation Engine exige o motor ligado; shadow, telemetria,
  // ambientes, test users, rollout e TODAS as capacidades exigem a
  // activation ligada. Activation desligada força tudo para false —
  // variável ausente ou inválida nunca ativa.
  if (!config.enabled) config.activationEnabled = false;
  if (!config.activationEnabled) {
    config.activationShadowMode = false;
    config.activationTelemetryEnabled = false;
    config.activationEnvironments = [];
    config.activationTestUserIds = [];
    config.activationRolloutPercent = 0;
    for (const capability of Object.keys(config.activationCapabilities)) {
      config.activationCapabilities[capability] = false;
    }
  }

  // Parte 1 — Integration exige o motor ligado E a Activation ligada
  // (cada capacidade precisa ser autorizada pela Activation Engine).
  // Integration desligada força shadow e telemetria para false — variável
  // ausente ou inválida nunca ativa; produção nunca ativa por acidente.
  if (!config.enabled) config.integrationEnabled = false;
  if (!config.activationEnabled) config.integrationEnabled = false;
  if (!config.integrationEnabled) {
    config.integrationShadowMode = false;
    config.integrationTelemetryEnabled = false;
  }

  // Parte 5 — Application exige motor + Activation + Integration ligadas.
  // Application desligada força telemetria para false — variável ausente ou
  // inválida nunca ativa; produção nunca ativa por acidente.
  if (!config.enabled) config.applicationEnabled = false;
  if (!config.activationEnabled) config.applicationEnabled = false;
  if (!config.integrationEnabled) config.applicationEnabled = false;
  if (!config.applicationEnabled) {
    config.applicationTelemetryEnabled = false;
  }

  // Parte 6 — Controlled Question exige motor + Activation + Integration +
  // Application ligadas. Interruptor desligado (ou qualquer dependência
  // desligada) força false — pergunta controlada nunca liga por acidente.
  if (!config.enabled) config.controlledQuestionsEnabled = false;
  if (!config.activationEnabled) config.controlledQuestionsEnabled = false;
  if (!config.integrationEnabled) config.controlledQuestionsEnabled = false;
  if (!config.applicationEnabled) config.controlledQuestionsEnabled = false;

  // Parte 8 — Conversation Routing exige motor + Activation + Integration +
  // Application ligadas (mesma cascata da Parte 6). Interruptor desligado
  // (ou qualquer dependência desligada) força false — o roteamento controlado
  // nunca liga por acidente; produção nunca ativa por acidente.
  if (!config.enabled) config.conversationRoutingEnabled = false;
  if (!config.activationEnabled) config.conversationRoutingEnabled = false;
  if (!config.integrationEnabled) config.conversationRoutingEnabled = false;
  if (!config.applicationEnabled) config.conversationRoutingEnabled = false;

  // Parte 9 — Cognitive Orchestrator exige motor + Activation + Integration +
  // Application ligadas. Interruptor desligado (ou qualquer dependência desligada)
  // força false — orquestração nunca liga por acidente; produção nunca ativa por acidente.
  if (!config.enabled) config.cognitiveOrchestratorEnabled = false;
  if (!config.activationEnabled) config.cognitiveOrchestratorEnabled = false;
  if (!config.integrationEnabled) config.cognitiveOrchestratorEnabled = false;
  if (!config.applicationEnabled) config.cognitiveOrchestratorEnabled = false;

  // Fase 15 — Motor de Raciocínio Financeiro exige o motor cognitivo ligado;
  // shadow e telemetria do motor financeiro exigem o próprio motor ligado.
  // Variável ausente ou inválida nunca ativa — produção nunca ativa por
  // acidente.
  if (!config.enabled) config.financialReasoningEnabled = false;
  if (!config.financialReasoningEnabled) {
    config.financialReasoningShadowMode = false;
    config.financialReasoningTelemetryEnabled = false;
  }

  // Fase 18 — Runtime Financeiro Visível exige o Motor de Raciocínio
  // Financeiro ligado (financialReasoningEnabled); canary e telemetria
  // exigem o runtime visível ligado. Variável ausente ou inválida nunca
  // ativa — produção nunca ativa por acidente.
  if (!config.enabled) config.financialRuntimeVisibleEnabled = false;
  if (!config.financialReasoningEnabled) config.financialRuntimeVisibleEnabled = false;
  if (!config.financialRuntimeVisibleEnabled) {
    config.financialRuntimeVisibleCanaryEnabled = false;
    config.financialRuntimeVisibleTelemetryEnabled = false;
  }

  // Fase 19 — Rollout Control Determínstico exige o Motor de Raciocínio
  // Financeiro ligado (financialReasoningEnabled); produção, canary e
  // telemetria exigem o rollout ligado. Cascata segura: motor/engine
  // desligado ⇒ rollout desligado, conforme o próprio contrato da Fase 19.
  if (!config.enabled) config.financialRolloutEnabled = false;
  if (!config.financialReasoningEnabled) config.financialRolloutEnabled = false;
  if (!config.financialRolloutEnabled) {
    config.financialRolloutVisibleEnabled = false;
    config.financialRolloutProductionEnabled = false;
    config.financialRolloutCanaryEnabled = false;
    config.financialRolloutTelemetryEnabled = false;
  }

  // Fase 20 — Tool Calling exige o motor cognitivo ligado; shadow, telemetria
  // e required exigem o Tool Calling ligado. Desligado → nenhum dispatcher,
  // nenhuma execução, saída 100% legada. Variável ausente ou inválida nunca
  // ativa — produção nunca ativa por acidente.
  if (!config.enabled) config.toolCallingEnabled = false;
  if (!config.toolCallingEnabled) {
    config.toolCallingShadowMode = false;
    config.toolCallingTelemetryEnabled = false;
    config.toolCallingRequired = false;
    config.toolCallingExecutionAllowed = false;
  }
  if (config.toolCallingShadowMode) config.toolCallingExecutionAllowed = false;

  return Object.freeze({ ...config, activationCapabilities: Object.freeze(config.activationCapabilities) });
}

export function isUniEngineShadowEnabled(config) {
  const safeConfig = config ?? UNI_ENGINE_DEFAULT_CONFIG;
  return Boolean(safeConfig.enabled) && Boolean(safeConfig.shadowMode);
}

export function getUniEngineVersion() {
  return UNI_ENGINE_VERSION;
}
