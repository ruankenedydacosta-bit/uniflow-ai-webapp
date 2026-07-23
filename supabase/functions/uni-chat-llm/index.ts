// Edge Function: uni-chat-llm
//
// Ponte segura entre o chat da Uni e o provedor de LLM. A chave real do provedor
// (OPENAI_API_KEY) vive APENAS aqui, no ambiente da Edge Function, nunca no
// bundle Vite/frontend.
//
// Comportamento:
// - DESATIVADA/indisponivel quando a credencial nao esta configurada -> 503.
//   O frontend trata 503 como "indisponivel" e cai no fluxo deterministico.
// - Autenticacao obrigatoria (Bearer + verificacao do usuario no Supabase).
// - Sanitizacao/limites server-side (defesa em profundidade).
// - Timeout/cancelamento na chamada ao provedor.
// - Rate limit (429) e erros repassados como status tratados pelo frontend.
// - Adapter de provedor isolado (callOpenAiAdapter) = ponto unico de troca.

const PROVIDER_TIMEOUT_MS = 20000;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 800;
const MAX_SYSTEM_CHARS = 6000;
const MAX_OUTPUT_TOKENS = 500;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function clampText(value: unknown, max: number) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, max).trim();
}

const STRUCTURED_ACTION_PATTERNS = [
  /"?action"?\s*:\s*"?(create|update|delete|execute|registrar|criar|excluir|alterar)/i,
  /\bfunction_call\b|\btool_call\b/i,
];

function looksLikeStructuredFinancialAction(text: string) {
  return STRUCTURED_ACTION_PATTERNS.some((re) => re.test(text));
}

async function getAuthenticatedUserId(authorization: string, supabaseUrl: string, anonKey: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === 'string' ? user.id : null;
}

function normalizeMessages(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m === 'object')
    .map((m) => {
      const role = (m as Record<string, unknown>).role === 'assistant' ? 'assistant' : 'user';
      const content = clampText((m as Record<string, unknown>).content, MAX_MESSAGE_CHARS);
      return { role, content };
    })
    .filter((m) => m.content)
    .slice(-MAX_MESSAGES);
}

// Adapter OpenAI: unico ponto que conhece o provedor concreto. Para trocar de
// provedor no futuro, basta implementar outro adapter com a mesma assinatura.
async function callOpenAiAdapter(
  { apiKey, model, system, messages, signal }:
  { apiKey: string; model: string; system: string; messages: Array<{ role: string; content: string }>; signal: AbortSignal },
) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.5,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
    signal,
  });

  if (response.status === 429) {
    return { status: 429 as const, text: null, usage: null };
  }
  if (!response.ok) {
    return { status: 502 as const, text: null, usage: null };
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  const usage = data?.usage
    ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens }
    : null;
  return { status: 200 as const, text: typeof text === 'string' ? text : null, usage };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Metodo nao permitido.' });

  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'Entre novamente para usar a Uni.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const providerKey = Deno.env.get('OPENAI_API_KEY') ?? '';
  const model = Deno.env.get('UNI_LLM_MODEL') ?? 'gpt-4o-mini';

  // Sem credencial do provedor -> feature indisponivel. Frontend faz fallback.
  if (!supabaseUrl || !anonKey || !providerKey) {
    return jsonResponse(503, { error: 'A resposta por IA nao esta configurada neste ambiente.' });
  }

  const userId = await getAuthenticatedUserId(authorization, supabaseUrl, anonKey);
  if (!userId) return jsonResponse(401, { error: 'Entre novamente para usar a Uni.' });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Nao foi possivel ler esta solicitacao.' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return jsonResponse(400, { error: 'Nao foi possivel ler esta solicitacao.' });
  }

  const system = clampText(payload.system, MAX_SYSTEM_CHARS);
  const messages = normalizeMessages(payload.messages);
  if (!system || messages.length === 0) {
    return jsonResponse(400, { error: 'Contexto insuficiente para gerar uma resposta.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), PROVIDER_TIMEOUT_MS);

  try {
    const result = await callOpenAiAdapter({
      apiKey: providerKey,
      model,
      system,
      messages,
      signal: controller.signal,
    });

    if (result.status === 429) return jsonResponse(429, { error: 'Muitas solicitacoes. Tente em instantes.' });
    if (result.status !== 200 || !result.text) {
      return jsonResponse(502, { error: 'Nao consegui gerar uma resposta agora.' });
    }

    const text = clampText(result.text, 2000);
    if (!text || looksLikeStructuredFinancialAction(text)) {
      // Nunca repassar acao financeira estruturada. Forca fallback deterministico.
      return jsonResponse(422, { error: 'Resposta invalida.' });
    }

    return jsonResponse(200, { text, usage: result.usage });
  } catch (error) {
    const timedOut = controller.signal.reason === 'timeout'
      || (error instanceof DOMException && error.name === 'AbortError');
    return jsonResponse(timedOut ? 504 : 502, { error: 'Nao consegui gerar uma resposta agora.' });
  } finally {
    clearTimeout(timeout);
  }
});
