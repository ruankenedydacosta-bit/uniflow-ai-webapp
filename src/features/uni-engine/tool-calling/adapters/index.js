// Uni Engine — Fase 20.1: Tool Calling — adaptadores.
//
// Adaptador puro de borda para o formato bruto de tool call da camada OpenAI
// existente. Não integra com rede, não cria cliente OpenAI e nunca acessa
// handlers diretamente — o único ponto de execução é o dispatcher da Fase 20.
export {
  parseOpenAiToolCall,
  runOpenAiToolCallAdapter,
  toolResultToPipeline,
} from './openAiToolCallAdapter.js';
