// Hook que expoe o orquestrador de LLM ja configurado para o chat.
//
// Desativado por padrao: so tenta o LLM quando a flag VITE_UNI_LLM_ENABLED
// estiver "true" E o Supabase estiver configurado no frontend. Em qualquer
// outro caso `enabled` e false e `generateContextualResponse` resolve null,
// forcando o fluxo deterministico.

import { useMemo } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../../services/supabaseClient';
import { resolveLlmConfig } from './llmConfig.js';
import { createUniLlmProvider } from './uniLlmProvider.js';
import { createUniLlmOrchestrator } from './uniLlmOrchestrator.js';

export function useUniLlm() {
  return useMemo(() => {
    const config = resolveLlmConfig({ supabaseUrl, supabaseAnonKey });
    const provider = createUniLlmProvider({
      supabase,
      supabaseUrl,
      supabaseAnonKey,
      enabled: config.enabled,
    });
    const orchestrator = createUniLlmOrchestrator({ provider });

    return {
      enabled: config.enabled,
      async generateContextualResponse(input) {
        if (!config.enabled) return null;
        return orchestrator.generateContextualResponse(input);
      },
    };
  }, []);
}
