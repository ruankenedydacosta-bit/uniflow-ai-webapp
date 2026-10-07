// Hook que expoe o orquestrador de LLM ja configurado para o chat.
//
// So tenta o LLM quando o Supabase esta configurado no frontend. Sem ele,
// `enabled` e false e `generateContextualResponse` resolve null, forcando o
// fluxo deterministico.

import { useMemo } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../../services/supabaseClient';
import { resolveLlmConfig } from './llmConfig.js';
import { createUniLlmProvider } from './uniLlmProvider.js';
import { createUniLlmOrchestrator } from './uniLlmOrchestrator.js';
import { createUniSupportOrchestrator } from '../product-knowledge/uniSupportOrchestrator.js';

export function useUniLlm() {
  return useMemo(() => {
    const config = resolveLlmConfig({ supabaseUrl, supabaseAnonKey });
    // SUPORTE1: MESMA instancia de provider para os dois modos -- um unico
    // AbortController/timeout/cancel compartilhado (nunca duas chamadas
    // reais em voo ao mesmo tempo, ja que a UI desabilita o input durante
    // isTyping em ambos os chats). A separacao entre financeiro e suporte
    // fica inteiramente na camada de orquestracao (payload/guard), nunca no
    // transporte.
    const provider = createUniLlmProvider({
      supabase,
      supabaseUrl,
      supabaseAnonKey,
      enabled: config.enabled,
    });
    const financialOrchestrator = createUniLlmOrchestrator({ provider });
    const supportOrchestrator = createUniSupportOrchestrator({ provider });

    return {
      enabled: config.enabled,
      async generateContextualResponse(input) {
        if (!config.enabled) return null;
        return financialOrchestrator.generateContextualResponse(input);
      },
      // SUPORTE1: mesma forma de uso de generateContextualResponse, mas
      // monta o payload do modo UNI_MODE.SUPPORT (buildSupportRequestPayload)
      // -- nunca recebe/envia financialContext.
      async generateSupportResponse(input) {
        if (!config.enabled) return null;
        return supportOrchestrator.generateSupportResponse(input);
      },
      // OPENAI1: checagem de disponibilidade (sem custo de chamada real) e
      // cancelamento explicito da requisicao em andamento -- ambos
      // repassados do provider, sem duplicar logica aqui.
      healthCheck: provider.healthCheck,
      cancel: provider.cancel,
    };
  }, []);
}
