// Configuracao da camada de LLM da Uni.
//
// A camada e DESATIVADA POR PADRAO. Para ser usada exige, de forma cumulativa:
//   1. A feature flag `VITE_UNI_LLM_ENABLED` estar explicitamente em "true".
//   2. O Supabase estar configurado no frontend (URL + anon key), pois a chamada
//      real ao provedor acontece dentro de uma Edge Function autenticada.
//
// A chave real do provedor (ex.: OPENAI_API_KEY) NUNCA vive no frontend/bundle
// Vite. Ela existe apenas no ambiente da Edge Function `uni-chat-llm`. Por isso
// aqui so verificamos flag + presenca do backend Supabase; a existencia real da
// credencial e verificada pela Edge Function (que responde 503 quando ausente),
// e o frontend trata esse 503 como "indisponivel" e cai no fluxo deterministico.

export const UNI_LLM_FLAG = 'VITE_UNI_LLM_ENABLED';

function readEnv() {
  try {
    return import.meta.env ?? {};
  } catch {
    return {};
  }
}

export function isLlmFlagEnabled(env = readEnv()) {
  return env?.[UNI_LLM_FLAG] === 'true';
}

// O backend (Edge Function) so pode ser chamado quando o Supabase esta
// configurado no frontend. A presenca da credencial do provedor e resolvida
// server-side; nao ha como (nem se deve) inspeciona-la no cliente.
export function isLlmBackendConfigured({ supabaseUrl, supabaseAnonKey } = {}) {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function resolveLlmConfig({ supabaseUrl, supabaseAnonKey, env } = {}) {
  const flag = isLlmFlagEnabled(env);
  const backend = isLlmBackendConfigured({ supabaseUrl, supabaseAnonKey });
  return {
    flagEnabled: flag,
    backendConfigured: backend,
    // "enabled" significa apenas que PODEMOS tentar. Falha/indisponibilidade
    // do provedor ainda cai no fallback deterministico.
    enabled: flag && backend,
  };
}
