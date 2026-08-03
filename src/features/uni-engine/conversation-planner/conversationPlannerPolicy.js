// Uni Engine — Conversation Planner: políticas (Parte 7, Bloco Único).
//
// Política pura da camada de planejamento observacional da conversa. Define
// os limites do snapshot, a confiança padrão do plano e a ordem
// determinística entre os próximos passos (quanto MENOR o número, MAIOR a
// prioridade). Nada aqui executa: apenas modela a decisão observacional.
export const CONVERSATION_PLANNER_POLICY = Object.freeze({
  version: '1.0',
  maxDiagnostics: 12,
  maxSources: 8,
  // Confiança mínima para um passo planejado ser considerado firme.
  minimumConfidence: 0.7,
  // Confiança padrão quando nenhuma camada fornece uma (0 para NEXT_STEP_NONE).
  defaultConfidence: 0.8,
  defaultNoneConfidence: 0,
});

export function clamp01(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

// Prioridade determinística entre os próximos passos. Segurança primeiro:
// confirmação > clarificação > pergunta > espera > resposta > nenhum.
export const NEXT_STEP_PRIORITY = Object.freeze({
  NEXT_STEP_CONFIRMATION: 1,
  NEXT_STEP_CLARIFICATION: 2,
  NEXT_STEP_QUESTION: 3,
  NEXT_STEP_WAIT: 4,
  NEXT_STEP_ANSWER: 5,
  NEXT_STEP_NONE: 6,
});

export function getNextStepPriority(step) {
  const priority = NEXT_STEP_PRIORITY[step];
  return typeof priority === 'number' ? priority : Number.MAX_SAFE_INTEGER;
}
