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

// Sprint 1 (IA Conversacional) — flags adicionais, também desligadas por
// padrão, seguindo exatamente o mesmo critério acima:
//   - VITE_UNI_LLM_TOOLS_ENABLED: envia os 6 tools de leitura (Fase 20.2)
//     para a OpenAI no modo financeiro. Sem ela, o payload nunca inclui
//     `tools` — comportamento idêntico ao de antes desta sprint.
//   - VITE_UNI_LLM_PHRASING_ENABLED: liga a ponte "fato estruturado → frase
//     natural" usada para perguntas de clarificação (ver phraseStructuredFact.js).
export const UNI_LLM_TOOLS_FLAG = 'VITE_UNI_LLM_TOOLS_ENABLED';
export const UNI_LLM_PHRASING_FLAG = 'VITE_UNI_LLM_PHRASING_ENABLED';
// Sprint 3 (Interpretação Semântica) — flag própria e nova (nunca reutiliza
// UNI_LLM_TOOLS_FLAG/UNI_LLM_PHRASING_FLAG, que têm responsabilidades
// diferentes): liga a camada de interpretação semântica de intenção
// financeira (interpretFinancialIntent.js / modo `financial_intent` da
// Edge Function). Desligada por padrão — com a flag off, o pipeline
// determinístico existente permanece byte-a-byte idêntico, nenhuma chamada
// extra à LLM é feita.
export const UNI_SEMANTIC_INTENT_FLAG = 'VITE_UNI_SEMANTIC_INTENT_ENABLED';

// Sprint 4 (Bloco 4.2/4.3) — três flags novas, todas desligadas por
// padrão, cada uma com responsabilidade própria (nunca reaproveitam as
// flags anteriores):
//   - VITE_UNI_FINANCIAL_ORCHESTRATOR_ENABLED: liga o orquestrador
//     semântico central (financialSemanticOrchestrator.js). Depende de
//     VITE_UNI_SEMANTIC_INTENT_ENABLED também estar ligada (o orquestrador
//     roda sobre a MESMA interpretação da Sprint 3 -- sem essa flag, não
//     há interpretação alguma para orquestrar). Com esta flag desligada,
//     o caminho semântico volta a ser exatamente o da Sprint 3
//     (attemptSemanticFinancialQuery -> resolveSemanticFinancialIntent),
//     sem nenhuma mudança de comportamento.
//   - VITE_UNI_COMPOUND_FINANCIAL_QUERIES_ENABLED: permite que o
//     orquestrador processe subIntents (consulta composta). Só tem efeito
//     quando VITE_UNI_FINANCIAL_ORCHESTRATOR_ENABLED também está ligada;
//     desligada, qualquer isCompound vindo da LLM é ignorado (tratado como
//     consulta simples do intent principal).
//   - VITE_UNI_LLM_RESPONSE_COMPOSER_ENABLED: liga a composição de resposta
//     natural REAL via LLM (Sprint 4 Ciclo 3, Bloco 4.4 --
//     composeFinancialResponseViaLlm.js / modo `financial_response_compose`
//     da Edge Function). Só tem efeito quando o orquestrador semântico já
//     produziu fatos estruturados válidos (status "handled"); desligada,
//     composeNaturalFinancialResponse.js (100% determinístico) continua
//     sendo o único caminho, byte-a-byte igual ao comportamento anterior.
export const UNI_FINANCIAL_ORCHESTRATOR_FLAG = 'VITE_UNI_FINANCIAL_ORCHESTRATOR_ENABLED';
export const UNI_COMPOUND_FINANCIAL_QUERIES_FLAG = 'VITE_UNI_COMPOUND_FINANCIAL_QUERIES_ENABLED';
export const UNI_LLM_RESPONSE_COMPOSER_FLAG = 'VITE_UNI_LLM_RESPONSE_COMPOSER_ENABLED';

// Sprint 4 Ciclo 4 (Bloco 4.10) — preparação para o composer via LLM se
// tornar o pipeline PRINCIPAL de composição de resposta (hoje ele já é
// tentado antes do texto determinístico ser publicado, sempre que a flag
// acima está ligada -- "promover" o composer não muda nenhum código,
// só a política operacional de qual ambiente liga a flag). O que falta
// para isso ser seguro em produção é um jeito de desligar
// INSTANTANEAMENTE, sem depender de rebuild/redeploy do frontend --
// `VITE_*` é resolvida em build time pelo Vite, então uma flag de env
// sozinha NUNCA permite "rollback imediato" de verdade.
//
// Este kill switch é um mecanismo de emergência ADITIVO: por padrão
// (nenhuma entrada em localStorage), o comportamento é idêntico ao que já
// existia -- só a flag de build decide. Quando setado, ele SÓ PODE
// restringir (nunca ligar algo que a flag de build não ligou), e some
// assim que a chave é removida. Uso operacional: no console do
// navegador, `localStorage.setItem('uni:disable_llm_response_composer',
// 'true')` desliga o composer para aquela sessão sem precisar de deploy;
// `localStorage.removeItem(...)` religa.
export const UNI_LLM_RESPONSE_COMPOSER_KILL_SWITCH_KEY = 'uni:disable_llm_response_composer';

export function isLlmResponseComposerKillSwitchActive() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return false;
    return localStorage.getItem(UNI_LLM_RESPONSE_COMPOSER_KILL_SWITCH_KEY) === 'true';
  } catch {
    // Ambiente sem localStorage (SSR/teste) ou acesso bloqueado -- nunca
    // quebra, apenas se comporta como se o kill switch não existisse.
    return false;
  }
}

function readEnv() {
  try {
    return import.meta.env ?? {};
  } catch {
    return {};
  }
}

export function isLlmToolsFlagEnabled(env = readEnv()) {
  return env?.[UNI_LLM_TOOLS_FLAG] === 'true';
}

export function isLlmPhrasingFlagEnabled(env = readEnv()) {
  return env?.[UNI_LLM_PHRASING_FLAG] === 'true';
}

export function isSemanticIntentFlagEnabled(env = readEnv()) {
  return env?.[UNI_SEMANTIC_INTENT_FLAG] === 'true';
}

// O orquestrador exige a interpretação semântica de base (Sprint 3) --
// nasce inútil sem ela, então a checagem é sempre cumulativa.
export function isFinancialOrchestratorFlagEnabled(env = readEnv()) {
  return env?.[UNI_FINANCIAL_ORCHESTRATOR_FLAG] === 'true' && isSemanticIntentFlagEnabled(env);
}

export function isCompoundFinancialQueriesFlagEnabled(env = readEnv()) {
  return env?.[UNI_COMPOUND_FINANCIAL_QUERIES_FLAG] === 'true' && isFinancialOrchestratorFlagEnabled(env);
}

export function isLlmResponseComposerFlagEnabled(env = readEnv()) {
  if (isLlmResponseComposerKillSwitchActive()) return false;
  return env?.[UNI_LLM_RESPONSE_COMPOSER_FLAG] === 'true';
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
