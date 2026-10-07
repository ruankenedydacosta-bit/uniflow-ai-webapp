// Orquestrador da camada de LLM da Uni.
//
// Une: montagem de contexto sanitizado + provider + guarda de resposta.
// Retorna { text } quando ha uma resposta LLM valida, ou null quando deve-se
// cair no fluxo deterministico (desativado, sem credencial, timeout, erro,
// rate limit, resposta invalida ou tentativa de acao financeira). No teto
// diario, retorna { text: null, dailyLimitReached: true }, para o chat dizer
// o motivo em vez da resposta generica.
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
        // Sprint 1 (IA Conversacional): `undefined` quando a flag de tools
        // está desligada -- payload.tools já vem undefined nesse caso
        // (buildLlmPayload), então esta chamada fica idêntica à de antes.
        tools: payload.tools,
      });
    } catch {
      // provider e desenhado para nao lancar, mas garantimos o fallback
      return null;
    }

    // Sprint 1: uma resposta só com tool_calls (sem texto) NUNCA pode ser
    // tratada como "sem resposta válida" -- é exatamente o caso em que a
    // OpenAI decidiu usar uma ferramenta em vez de responder em texto.
    const hasToolCalls = Array.isArray(result?.tool_calls) && result.tool_calls.length > 0;
    if (result?.error?.code === 'DAILY_LIMIT') {
      return { text: null, usage: null, tool_calls: null, dailyLimitReached: true };
    }
    if (!result || result.error || (!result.text && !hasToolCalls)) {
      if (result?.error?.code) {
        logger?.info?.(`[uni-llm] fallback deterministico (motivo: ${result.error.code})`);
      }
      return null;
    }

    if (!result.text) {
      // Só tool_calls, sem texto para validar/resumir -- repassa como está.
      return { text: null, usage: result.usage ?? null, tool_calls: result.tool_calls };
    }

    // BLOCO A1: resumo (nao mais descarte binario) usa o orcamento de
    // caracteres do estilo resolvido -- respostas "simples" sao cortadas
    // bem mais cedo que "detalhadas". validateLlmResponse so descarta de
    // verdade se o resumo ficar vazio ou parecer uma acao financeira.
    const charBudget = resolveConversationStyleCharBudget(payload.meta?.conversationStyle);
    const validation = validateLlmResponse(result.text, { maxChars: charBudget });
    if (!validation.valid) {
      if (hasToolCalls) {
        // Texto inválido/descartado, mas o tool_calls continua legítimo --
        // não é motivo para jogar fora a ferramenta que a OpenAI pediu.
        return { text: null, usage: result.usage ?? null, tool_calls: result.tool_calls };
      }
      logger?.warn?.(`[uni-llm] resposta descartada (motivo: ${validation.reason})`);
      return null;
    }
    if (validation.summarized) {
      logger?.info?.('[uni-llm] resposta resumida por exceder o orcamento do estilo de conversa');
    }

    return { text: validation.text, usage: result.usage ?? null, tool_calls: hasToolCalls ? result.tool_calls : null };
  }

  return { generateContextualResponse };
}
