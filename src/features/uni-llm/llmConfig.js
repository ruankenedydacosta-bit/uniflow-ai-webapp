// Configuracao da camada de LLM da Uni.
//
// A camada fica ligada sempre que o Supabase esta configurado no frontend
// (URL + anon key), pois a chamada real ao provedor acontece dentro de uma
// Edge Function autenticada. A flag VITE_UNI_LLM_ENABLED que a desligava foi
// removida: sem IA, toda frase fora das regras fixas caia na mesma resposta
// generica.
//
// A chave real do provedor (ex.: OPENAI_API_KEY) NUNCA vive no frontend/bundle
// Vite. Ela existe apenas no ambiente da Edge Function `uni-chat-llm`, que
// responde 503 quando ela falta e 429 quando a pessoa atinge o teto diario;
// nos dois casos o frontend cai no fluxo deterministico.

// Sprint 1 (IA Conversacional) — flag adicional, desligada por padrão:
//   - VITE_UNI_LLM_PHRASING_ENABLED: liga a ponte "fato estruturado → frase
//     natural" usada para perguntas de clarificação (ver phraseStructuredFact.js).
export const UNI_LLM_PHRASING_FLAG = 'VITE_UNI_LLM_PHRASING_ENABLED';

function readEnv() {
  try {
    return import.meta.env ?? {};
  } catch {
    return {};
  }
}

export function isLlmPhrasingFlagEnabled(env = readEnv()) {
  return env?.[UNI_LLM_PHRASING_FLAG] === 'true';
}

// O backend (Edge Function) so pode ser chamado quando o Supabase esta
// configurado no frontend. A presenca da credencial do provedor e resolvida
// server-side; nao ha como (nem se deve) inspeciona-la no cliente.
export function isLlmBackendConfigured({ supabaseUrl, supabaseAnonKey } = {}) {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function resolveLlmConfig({ supabaseUrl, supabaseAnonKey } = {}) {
  const backend = isLlmBackendConfigured({ supabaseUrl, supabaseAnonKey });
  return {
    backendConfigured: backend,
    // "enabled" significa apenas que PODEMOS tentar. Falha/indisponibilidade
    // do provedor ainda cai no fallback deterministico.
    enabled: backend,
  };
}
