// PUSH1: mesmo padrao ja usado por billingService.js (createBillingService)
// -- fabrica testavel, contrato { data, error } sempre resolvido (nunca
// lanca), nunca conhece a VAPID private key (fica so no backend).
import { supabase, supabaseAnonKey, supabaseUrl } from '../../services/supabaseClient.js';

export function createPushService({
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

  async function invokePushFunction(functionName, body) {
    if (!supabaseClient || !baseUrl || !anonKey || !fetchImpl) {
      return { data: null, error: { code: 'BACKEND_NOT_CONFIGURED', message: 'push_unavailable' } };
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { data: null, error: { code: 'UNAUTHORIZED', message: 'push_auth_required' } };
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
      return { data: null, error: { code: 'NETWORK', message: 'push_request_failed' } };
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      return { data: null, error: { code: 'PARSE_ERROR', message: 'push_bad_response' } };
    }

    if (!response.ok) {
      return {
        data: null,
        error: payload?.error ?? { code: 'REQUEST_FAILED', message: 'push_request_rejected' },
      };
    }

    return { data: payload, error: null };
  }

  return {
    // PUSH1: unica notificacao permitida nesta fase. Nunca aceita titulo,
    // corpo ou alvo do cliente -- o backend envia SEMPRE para as proprias
    // subscriptions ativas do usuario autenticado, com o payload fixo
    // definido em push-send-test-notification/index.ts.
    sendTestNotification({ workspaceId } = {}) {
      return invokePushFunction('push-send-test-notification', { workspace_id: workspaceId });
    },
    // AGPUSH1: caminho autenticado (sessao do proprio usuario) de
    // agenda-push-decision -- usado pelo modal de escolha dentro do app
    // (fallback iPhone, ou reabrir a pergunta via deep link). offset deve
    // ser exatamente '30', '60' ou 'none'; a Edge Function reaplica essa
    // validacao no servidor, nunca confia so no cliente.
    sendAgendaReminderDecision({ agendaItemId, offset } = {}) {
      return invokePushFunction('agenda-push-decision', { agenda_item_id: agendaItemId, offset });
    },
  };
}

const defaultPushService = createPushService({
  supabase, supabaseUrl, supabaseAnonKey,
});

export const sendTestNotification = defaultPushService.sendTestNotification;
export const sendAgendaReminderDecision = defaultPushService.sendAgendaReminderDecision;
