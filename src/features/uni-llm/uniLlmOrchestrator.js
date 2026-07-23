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

    const validation = validateLlmResponse(result.text);
    if (!validation.valid) {
      logger?.warn?.(`[uni-llm] resposta descartada (motivo: ${validation.reason})`);
      return null;
    }

    return { text: validation.text, usage: result.usage ?? null };
  }

  return { generateContextualResponse };
}
