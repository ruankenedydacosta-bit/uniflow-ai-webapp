// Uni Engine — Fase 20.1: Tool Calling — integração.
//
// Camada de integração isolada: registra apenas fixtures seguras de teste e
// conecta a tool call bruta da camada OpenAI à infraestrutura base da Fase 20
// via adaptador → dispatcher. Produção fica sem nenhuma ferramenta real e
// nunca ativa por acidente.
export { registerToolCallingFixtures, createToolCallingFixtureContext } from './fixtures.js';
export {
  runToolCallingIntegration,
  toolResultToPipelineSafe,
} from './runToolCallingIntegration.js';
