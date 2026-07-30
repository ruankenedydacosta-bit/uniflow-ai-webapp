// Orquestrador da camada de LLM da Uni.
//
// Une: montagem de contexto sanitizado + provider + guarda de resposta.
// Retorna { text } quando ha uma resposta LLM valida, ou null quando deve-se
// cair no fluxo deterministico (desativado, sem credencial, timeout, erro,
// rate limit, resposta invalida ou tentativa de acao financeira).
//
// NUNCA lanca. Logs nunca incluem dados financeiros sensiveis (apenas codigos).

import { buildLlmPayload } from './llmContext.js';
import { validateLlmResponse } from './llmResponseGuard.js';
import { resolveConversationStyleCharBudget } from './conversationStyle.js';

export function createUniLlmOrchestrator({ provider, logger = console } = {}) {
  async function generateContextualResponse(input = {}) {
    if (!provider || typeof provider.generateResponse !== 'function') {
      return null;
    }

    let payload;
    try {
      payload = buildLlmPayload(input);
    } catch {
      return null;
    }

    if (!payload.messages.length) return null;

    let result;
    try {
      result = await provider.generateResponse({
        system: payload.system,
        messages: payload.messages,
        // BLOCO A1: repassa o orcamento de tokens resolvido a partir do
        // conversationStyle (ver conversationStyle.js) -- a Edge Function
        // sempre clampa este valor, nunca confia cegamente no cliente.
        maxOutputTokens: payload.meta?.maxOutputTokens,
      });
    } catch {
      // provider e desenhado para nao lancar, mas garantimos o fallback
      return null;
    }

    if (!result || result.error || !result.text) {
      if (result?.error?.code) {
        logger?.info?.(`[uni-llm] fallback deterministico (motivo: ${result.error.code})`);
      }
      return null;
    }

    // BLOCO A1: resumo (nao mais descarte binario) usa o orcamento de
    // caracteres do estilo resolvido -- respostas "simples" sao cortadas
    // bem mais cedo que "detalhadas". validateLlmResponse so descarta de
    // verdade se o resumo ficar vazio ou parecer uma acao financeira.
    const charBudget = resolveConversationStyleCharBudget(payload.meta?.conversationStyle);
    const validation = validateLlmResponse(result.text, { maxChars: charBudget });
    if (!validation.valid) {
      logger?.warn?.(`[uni-llm] resposta descartada (motivo: ${validation.reason})`);
      return null;
    }
    if (validation.summarized) {
      logger?.info?.('[uni-llm] resposta resumida por exceder o orcamento do estilo de conversa');
    }

    return { text: validation.text, usage: result.usage ?? null };
  }

  return { generateContextualResponse };
}
