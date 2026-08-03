// Uni Engine — Conversation Planner (Parte 7, Bloco Único).
//
// Camada estritamente observacional que determina QUAL deve ser o próximo
// passo lógico da conversa (NEXT_STEP_*), consumindo SOMENTE snapshots já
// existentes (Observation, Guidance, Decision, Capability Readiness,
// Execution Readiness e Application). Nunca gera texto, nunca responde,
// nunca executa e nunca altera o pipeline legado — o plano fica em memória
// para a FUTURA camada de ativação.
export {
  CONVERSATION_PLANNER_VERSION,
  CONVERSATION_PLANNER_MODES,
  NEXT_STEPS,
  PLANNER_STATUSES,
  PLANNER_REASONS,
  PLANNER_DIAGNOSTIC_CODES,
  isConversationPlannerMode,
  isNextStep,
  isPlannerStatus,
  isPlannerReason,
} from './conversationPlannerTypes.js';
export {
  CONVERSATION_PLANNER_POLICY,
  NEXT_STEP_PRIORITY,
  clamp01,
  getNextStepPriority,
} from './conversationPlannerPolicy.js';
export {
  deepFreeze,
  createEmptyConversationPlanSnapshot,
  createConversationPlanSnapshot,
  validateConversationPlanSnapshot,
  isConversationPlanSnapshotSerializable,
} from './conversationPlannerContracts.js';
export {
  buildConversationPlannerDiagnostics,
  createConversationPlannerDiagnostic,
} from './buildConversationPlannerDiagnostics.js';
export { buildConversationPlanSnapshot } from './buildConversationPlanSnapshot.js';
