// SUPORTE1: orquestrador do modo UNI_MODE.SUPPORT -- mesmo formato de
// src/features/uni-llm/uniLlmOrchestrator.js (financeiro), mas monta o
// payload via buildSupportRequestPayload em vez de buildLlmPayload. Reusa o
// MESMO guard de validacao de resposta (llmResponseGuard) -- nunca duplica
// a defesa contra acao financeira estruturada, so aplica ao texto de
// suporte tambem (defesa em profundidade, nao custa nada aqui).
//
// NUNCA lanca. Retorna null quando nao ha tentativa possivel ou a resposta
// e invalida (mesmo contrato de generateContextualResponse) -- o chamador
// cai no fallback local (FAQ/documento recuperado) exatamente como o chat
// financeiro cai no fallback deterministico.
import { validateLlmResponse } from '../uni-llm/llmResponseGuard.js';
import { buildSupportRequestPayload } from './uniSupportContext.js';

export function createUniSupportOrchestrator({ provider, logger = console } = {}) {
  async function generateSupportResponse(input = {}) {
    if (!provider || typeof provider.generateResponse !== 'function') {
      return null;
    }

    let payload;
    try {
      payload = buildSupportRequestPayload(input);
    } catch {
      return null;
    }

    if (!payload.messages.length) return null;

    let result;
    try {
      result = await provider.generateResponse({
        messages: payload.messages,
        mode: payload.mode,
        productContext: payload.productContext,
      });
    } catch {
      return null;
    }

    if (!result || result.error || !result.text) {
      if (result?.error?.code) {
        logger?.info?.(`[uni-support] fallback (motivo: ${result.error.code})`);
      }
      return null;
    }

    const validation = validateLlmResponse(result.text);
    if (!validation.valid) {
      logger?.warn?.(`[uni-support] resposta descartada (motivo: ${validation.reason})`);
      return null;
    }

    return {
      text: validation.text,
      usage: result.usage ?? null,
      knowledge: result.knowledge ?? null,
    };
  }

  return { generateSupportResponse };
}
