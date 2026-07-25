// OPENAI3: monta o payload do modo UNI_MODE.SUPPORT para a Edge Function
// uni-chat-llm -- recupera um numero limitado de trechos relevantes do
// conhecimento de produto (nunca o manual inteiro) e reaproveita a MESMA
// sanitizacao/historico ja usados no modo financeiro (uni-llm/llmContext.js),
// em vez de duplicar essa logica.
//
// Nao e chamado por nenhuma tela ainda -- a Central de Suporte final nao
// e implementada nesta fase. Esta funcao e a fundacao que ela vai consumir.
import { retrieveProductKnowledge } from './productKnowledgeRetrieval.js';
import { UNI_MODE } from './uniMode.js';
import { sanitizeText, buildSanitizedHistory } from '../uni-llm/llmContext.js';

const MAX_KNOWLEDGE_RESULTS = 3;

/**
 * @param {object} params
 * @param {string} params.text - pergunta atual do usuario.
 * @param {Array} [params.messages] - historico curto existente da conversa.
 * @param {string} [params.workspace] - 'personal' | 'business', se souber o espaço ativo.
 * @returns {{ mode: string, messages: Array, productContext: Array }}
 */
export function buildSupportRequestPayload({ text, messages, workspace } = {}) {
  const { results } = retrieveProductKnowledge(text, { workspace, limit: MAX_KNOWLEDGE_RESULTS });
  const productContext = results.map((entry) => ({
    id: entry.id,
    title: entry.title,
    content: entry.content,
  }));

  const history = buildSanitizedHistory(messages);
  const userText = sanitizeText(text);

  return {
    mode: UNI_MODE.SUPPORT,
    messages: [...history, { role: 'user', content: userText }].filter((m) => m.content),
    productContext,
  };
}
