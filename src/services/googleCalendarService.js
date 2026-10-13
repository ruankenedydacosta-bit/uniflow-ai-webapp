// Google Agenda (épico #98). Cliente das Edge Functions google-calendar-* e
// leitura da conexão pela RLS (calendar_connections_select_own).
//
// Mesmo contrato de billingService.js: cada método resolve com
// { data, error }, nunca lança. `error` é { code, message }.
//
// O token do Google nunca chega aqui: a conexão é lida sem
// refresh_token_secret_id, que nem tem grant para authenticated.
//
// O callback do OAuth deixa a conexão pendente; confirmarConexao a ativa.
//
// #101 acrescenta sincronizarAgora e #102 acrescenta salvarPreferencias.

import { isSupabaseConfigured, supabase, supabaseAnonKey, supabaseUrl } from './supabaseClient.js';

export const GOOGLE_AGENDA_RETURN_PATH = '/app/conta/google-agenda';

// Sem refresh_token_secret_id: a coluna não tem grant de leitura.
export const CONNECTION_FIELDS = [
  'id',
  'workspace_id',
  'provider',
  'account_email',
  'status',
  'last_error_code',
  'last_error_at',
  'last_synced_at',
  'app_calendar_id',
  'destination_calendar_id',
  'connected_at',
].join(', ');

export function createGoogleCalendarService({
  supabase: supabaseClient,
  supabaseUrl: baseUrl,
  supabaseAnonKey: anonKey,
  fetchImpl = globalThis.fetch,
} = {}) {
  async function getAccessToken() {
    if (!supabaseClient) return null;
    try {
      const { data } = await supabaseClient.auth.getSession();
      return data?.session?.access_token ?? null;
    } catch {
      return null;
    }
  }

  async function invokeFunction(functionName, body) {
    if (!supabaseClient || !baseUrl || !anonKey || !fetchImpl) {
      return { data: null, error: { code: 'BACKEND_NOT_CONFIGURED', message: 'google_calendar_unavailable' } };
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { data: null, error: { code: 'UNAUTHORIZED', message: 'google_calendar_auth_required' } };
    }

    let response;
    try {
      response = await fetchImpl(`${baseUrl}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body ?? {}),
      });
    } catch {
      return { data: null, error: { code: 'NETWORK', message: 'google_calendar_request_failed' } };
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      return { data: null, error: { code: 'PARSE_ERROR', message: 'google_calendar_bad_response' } };
    }

    if (!response.ok) {
      return {
        data: null,
        error: payload?.error ?? { code: 'REQUEST_FAILED', message: 'google_calendar_request_rejected' },
      };
    }

    return { data: payload, error: null };
  }

  return {
    // Devolve { authorization_url }. Quem chama redireciona a página para lá.
    iniciarConexao({ workspaceId, returnPath = GOOGLE_AGENDA_RETURN_PATH } = {}) {
      if (!workspaceId) {
        return Promise.resolve({ data: null, error: { code: 'INVALID_WORKSPACE', message: 'workspace_required' } });
      }
      return invokeFunction('google-calendar-connect', { workspace_id: workspaceId, return_path: returnPath });
    },
    // Ativa a conexão deixada pendente pelo callback do OAuth. Só funciona
    // com a sessão de quem iniciou a conexão.
    confirmarConexao({ pendente } = {}) {
      if (typeof pendente !== 'string' || !pendente) {
        return Promise.resolve({ data: null, error: { code: 'CONFIRMATION_INVALID', message: 'pending_id_required' } });
      }
      return invokeFunction('google-calendar-confirm', { pendente });
    },
    desconectar({ workspaceId } = {}) {
      if (!workspaceId) {
        return Promise.resolve({ data: null, error: { code: 'INVALID_WORKSPACE', message: 'workspace_required' } });
      }
      return invokeFunction('google-calendar-disconnect', { workspace_id: workspaceId });
    },
    // Traz agora os eventos dos calendários lidos. data: { sincronizado_em,
    // calendarios: [{ external_calendar_id, inseridos, atualizados,
    // cancelados, status: 'ok' | 'skipped' | 'erro' }] }. Erros:
    // NOT_CONNECTED, RECONNECT_REQUIRED e GOOGLE_UNAVAILABLE.
    sincronizarAgora({ workspaceId } = {}) {
      if (!workspaceId) {
        return Promise.resolve({ data: null, error: { code: 'INVALID_WORKSPACE', message: 'workspace_required' } });
      }
      return invokeFunction('google-calendar-sync-now', { workspace_id: workspaceId });
    },
    // data: a conexão da pessoa neste espaço, ou null quando não há.
    async obterConexao({ workspaceId } = {}) {
      if (!supabaseClient) {
        return { data: null, error: { code: 'SUPABASE_NOT_CONFIGURED', message: 'google_calendar_unavailable' } };
      }
      if (!workspaceId) return { data: null, error: null };

      try {
        const { data, error } = await supabaseClient
          .from('calendar_connections')
          .select(CONNECTION_FIELDS)
          .eq('workspace_id', workspaceId)
          .eq('provider', 'google')
          .maybeSingle();
        if (error) {
          return { data: null, error: { code: 'CONNECTION_QUERY_FAILED', message: 'google_calendar_connection_unavailable' } };
        }
        return { data: data ?? null, error: null };
      } catch {
        return { data: null, error: { code: 'CONNECTION_QUERY_FAILED', message: 'google_calendar_connection_unavailable' } };
      }
    },
  };
}

const defaultGoogleCalendarService = createGoogleCalendarService({
  supabase: isSupabaseConfigured ? supabase : null,
  supabaseUrl,
  supabaseAnonKey,
});

export const iniciarConexao = defaultGoogleCalendarService.iniciarConexao;
export const confirmarConexao = defaultGoogleCalendarService.confirmarConexao;
export const desconectar = defaultGoogleCalendarService.desconectar;
export const obterConexao = defaultGoogleCalendarService.obterConexao;
export const sincronizarAgora = defaultGoogleCalendarService.sincronizarAgora;
