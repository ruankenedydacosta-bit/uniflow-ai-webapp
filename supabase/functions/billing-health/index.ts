// Edge Function: billing-health
//
// BILLING2 (Bloco Asaas 2): verificacao real de saude do subsistema de
// billing -- confirma que a configuracao existe e que a autenticacao
// contra o Sandbox da Asaas funciona, usando uma chamada NAO destrutiva
// (GET /v3/customers?limit=1 -- listagem, somente leitura, sem efeito
// colateral algum, documentada em
// https://docs.asaas.com/reference/list-customers). Nunca cria, altera ou
// cobra nada. Nunca retorna a API key, dados de conta, saldo ou qualquer
// informacao sensivel -- apenas { ok, environment, provider, authenticated }.

import {
  ASAAS_SANDBOX_BASE_URL,
  AsaasApiError,
  AsaasConfigurationError,
  AsaasNetworkError,
  AsaasTimeoutError,
  createAsaasClient,
} from '../_shared/asaasClient.ts';

function getAllowedOrigins() {
  return new Set(
    (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function isAllowedOrigin(origin: string) {
  if (!origin) return false;
  if (getAllowedOrigins().has(origin)) return true;
  return /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin);
}

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function jsonResponse(status: number, body: Record<string, unknown>, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

async function getAuthenticatedUserId(authorization: string, supabaseUrl: string, anonKey: string) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === 'string' ? user.id : null;
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') ?? '';
  if (!isAllowedOrigin(origin)) {
    return jsonResponse(403, errorBody('ORIGIN_NOT_ALLOWED', 'Origem nao autorizada.'), origin);
  }
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') {
    return jsonResponse(405, errorBody('METHOD_NOT_ALLOWED', 'Metodo nao permitido.'), origin);
  }

  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return jsonResponse(401, errorBody('AUTH_REQUIRED', 'Sessao obrigatoria.'), origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !anonKey) {
    return jsonResponse(503, errorBody('SERVICE_UNAVAILABLE', 'Servico indisponivel.'), origin);
  }

  const userId = await getAuthenticatedUserId(authorization, supabaseUrl, anonKey);
  if (!userId) return jsonResponse(401, errorBody('INVALID_SESSION', 'Sessao invalida.'), origin);

  const asaasApiKey = Deno.env.get('ASAAS_API_KEY') ?? '';
  const asaasBaseUrl = Deno.env.get('ASAAS_BASE_URL') ?? ASAAS_SANDBOX_BASE_URL;

  let client;
  try {
    client = createAsaasClient({ apiKey: asaasApiKey, baseUrl: asaasBaseUrl });
  } catch (error) {
    if (error instanceof AsaasConfigurationError) {
      // BILLING2: configuracao ausente/invalida e um estado ESPERADO nesta
      // fase (secrets ainda podem nao estar configurados) -- nunca um erro
      // 500 surpreendente, e nunca vaza detalhe do motivo exato ao cliente.
      return jsonResponse(200, {
        ok: false,
        environment: 'sandbox',
        provider: 'asaas',
        authenticated: false,
        reason: 'CONFIGURATION_MISSING',
      }, origin);
    }
    throw error;
  }

  try {
    // Chamada real, minima e nao destrutiva -- confirma autenticacao sem
    // criar/alterar nada. limit=1 minimiza o dado transitado (nunca
    // devolvido ao cliente de qualquer forma).
    await client.listCustomers({ limit: '1' });
    return jsonResponse(200, {
      ok: true,
      environment: asaasBaseUrl === ASAAS_SANDBOX_BASE_URL ? 'sandbox' : 'production',
      provider: 'asaas',
      authenticated: true,
    }, origin);
  } catch (error) {
    if (error instanceof AsaasTimeoutError) {
      return jsonResponse(200, {
        ok: false, environment: 'sandbox', provider: 'asaas', authenticated: false, reason: 'TIMEOUT',
      }, origin);
    }
    if (error instanceof AsaasNetworkError) {
      return jsonResponse(200, {
        ok: false, environment: 'sandbox', provider: 'asaas', authenticated: false, reason: 'PROVIDER_UNAVAILABLE',
      }, origin);
    }
    if (error instanceof AsaasApiError) {
      // BILLING2: 503 mapeado pelo cliente compartilhado significa
      // exatamente "credencial rejeitada pela Asaas" (401/403 originais) --
      // ver mapProviderStatusToSafeHttpStatus em _shared/asaasClient.ts.
      const reason = error.httpStatus === 503 ? 'INVALID_API_KEY' : 'PROVIDER_ERROR';
      console.log(JSON.stringify({
        at: 'billing-health', status: 'error', operationId: error.operationId,
        providerStatus: error.providerStatus, reason,
      }));
      return jsonResponse(200, {
        ok: false, environment: 'sandbox', provider: 'asaas', authenticated: false, reason,
      }, origin);
    }
    throw error;
  }
});
