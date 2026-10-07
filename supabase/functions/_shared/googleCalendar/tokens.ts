// Access token do Google a partir do refresh token guardado no Vault.
//
// Contrato do épico #98:
// obterAccessTokenGoogle({supabaseUrl, serviceRoleKey, connectionId})
// -> {accessToken} ou {erro: 'conexao_revogada' | 'google_indisponivel' | 'sem_token'}.
// Nunca lança. Em invalid_grant grava status = 'error' e
// last_error_code = 'token_revogado' na conexão.
//
// Nenhum token vai para log nem para a resposta de quem chama a função.

import { chamarBanco, chamarRpc, ok } from './banco.ts';
import { GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL } from './oauth.js';

export type ErroDeToken = 'conexao_revogada' | 'google_indisponivel' | 'sem_token';

export function credenciaisDoCliente() {
  return {
    clientId: Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') ?? '',
    clientSecret: Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET') ?? '',
  };
}

export async function marcarTokenRevogado(
  { supabaseUrl, serviceRoleKey }: { supabaseUrl: string; serviceRoleKey: string },
  connectionId: string,
) {
  await chamarBanco({ supabaseUrl, serviceRoleKey }, {
    metodo: 'PATCH',
    caminho: '/rest/v1/calendar_connections',
    query: { id: `eq.${connectionId}` },
    corpo: { status: 'error', last_error_code: 'token_revogado', last_error_at: new Date().toISOString() },
    prefer: 'return=minimal',
  });
}

export async function obterAccessTokenGoogle({
  supabaseUrl,
  serviceRoleKey,
  connectionId,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  connectionId: string;
}): Promise<{ accessToken: string } | { erro: ErroDeToken }> {
  const { clientId, clientSecret } = credenciaisDoCliente();
  if (!clientId || !clientSecret) return { erro: 'google_indisponivel' };

  const config = { supabaseUrl, serviceRoleKey };
  const segredo = await chamarRpc(config, 'calendar_connection_get_refresh_token', { p_connection_id: connectionId });
  if (!ok(segredo.status)) return { erro: 'google_indisponivel' };
  const refreshToken = typeof segredo.json === 'string' ? segredo.json : '';
  if (!refreshToken) return { erro: 'sem_token' };

  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
  } catch {
    return { erro: 'google_indisponivel' };
  }

  let corpo: any = null;
  try {
    corpo = await response.json();
  } catch {
    corpo = null;
  }

  if (response.ok && typeof corpo?.access_token === 'string') {
    return { accessToken: corpo.access_token };
  }

  if (corpo?.error === 'invalid_grant') {
    await marcarTokenRevogado(config, connectionId);
    return { erro: 'conexao_revogada' };
  }

  return { erro: 'google_indisponivel' };
}

// Revoga o grant no Google. Revogar o refresh token derruba todos os tokens
// desta conta Google com este OAuth client.
export async function revogarTokenNoGoogle(token: string): Promise<boolean> {
  try {
    const response = await fetch(GOOGLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
    // 400 invalid_token: o token já não vale. Para o disconnect, dá no mesmo.
    return response.ok || response.status === 400;
  } catch {
    return false;
  }
}
