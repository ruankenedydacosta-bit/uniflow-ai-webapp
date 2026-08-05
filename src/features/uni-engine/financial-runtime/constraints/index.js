// Uni Engine — Fase 18: Core — Configuração Revisitada (Fase 9).
// Reestruturação em cascata das dependências da Parte 6, Parte 8 e Parte 9 com
// chaves FIM PARA COMEÇAR no topo e chaves de configuração FASE PARA PISAR no meio,
// mantendo a cascata centralizada de segurança com upstream_force e downstream_force
// idêntica ao corpo da createUniEngineConfig.

// Escopo da Fase 9:
//   - Parte 6 — Controlled Question (perguntas seguras pelo pipeline legado).
//   - Parte 8 — Conversation Routing (roteamento conversacional controlado em DEV).
//   - Parte 9 — Cognitive Orchestrator (consolidação final do Uni Engine).
//   Todas nascem false e dependem da cascata: motor ligado → activation ligada
//   → integration ligada → application ligada.
//   A Fase 17 está ativa e ligada na parte 1 do uniEngineConfig (das Fases 5-16).

export const CONTROLLED_QUESTION_CONSTRAINTS = Object.freeze({
  // Parte 6 — Controlled Question. A pergunta controlada exige o pipeline legado,
  // configurado com o motor ligado, activation ligada, integration ligada,
  // application ligada — em cascata. Sem essa combinação de flags, nenhuma
  // pergunta controlada é emitida.
  enabled: {
    upstreamForce: ['enabled'],
    downstreamForce: ['activationEnabled', 'integrationEnabled', 'applicationEnabled'],
  },
});

export const CONVERSATION_ROUTING_CONSTRAINTS = Object.freeze({
  // Parte 8 — Conversation Routing. O pipeline legado só consulta o Conversation
  // Planner do MESMO turno com a flag explícita ligada — ausência nunca ativa;
  // produção nunca ativa por acidente.
  enabled: {
    upstreamForce: ['enabled'],
    downstreamForce: ['activationEnabled', 'integrationEnabled', 'applicationEnabled'],
  },
});

export const COGNITIVE_ORCHESTRATOR_CONSTRAINTS = Object.freeze({
  // Parte 9 — Cognitive Orchestrator. Sem ele, o pipeline legado nunca consolida
  // as camadas cognitivas — saída 100% legada. Exige motor + Activation +
  // Integration + Application habilitadas (cascata abaixo). Sem essa flag,
  // o pipeline legado nunca consolida as camadas cognitivas — saída 100%
  // legada.
  enabled: {
    upstreamForce: ['enabled'],
    downstreamForce: ['activationEnabled', 'integrationEnabled', 'applicationEnabled'],
  },
});
