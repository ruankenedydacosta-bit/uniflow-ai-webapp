// Acesso ao banco com service_role pelas Edge Functions do Google Agenda.
// Nunca lança: devolve { status, json }, com status 0 em falha de rede.
// O corpo das respostas não vai para log (pode conter dado da conta).

export interface ConfigDoBanco {
  supabaseUrl: string;
  serviceRoleKey: string;
}

export interface PedidoAoBanco {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  caminho: string;
  query?: Record<string, string>;
  corpo?: unknown;
  prefer?: string;
}

export async function chamarBanco(config: ConfigDoBanco, pedido: PedidoAoBanco) {
  const url = new URL(`${config.supabaseUrl}${pedido.caminho}`);
  for (const [chave, valor] of Object.entries(pedido.query ?? {})) url.searchParams.set(chave, valor);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.serviceRoleKey}`,
    apikey: config.serviceRoleKey,
  };
  if (pedido.corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (pedido.prefer) headers.Prefer = pedido.prefer;

  try {
    const response = await fetch(url, {
      method: pedido.metodo ?? 'GET',
      headers,
      body: pedido.corpo === undefined ? undefined : JSON.stringify(pedido.corpo),
    });
    const texto = await response.text();
    let json: unknown = null;
    if (texto) {
      try {
        json = JSON.parse(texto);
      } catch {
        json = null;
      }
    }
    return { status: response.status, json };
  } catch {
    return { status: 0, json: null };
  }
}

export function ok(status: number) {
  return status >= 200 && status < 300;
}

// A pessoa é membro ativo do espaço? Mesma regra no callback e no confirm.
export async function membroAtivoDoEspaco(config: ConfigDoBanco, userId: string, workspaceId: string) {
  const resposta = await chamarBanco(config, {
    caminho: '/rest/v1/workspace_members',
    query: {
      select: 'workspace_id',
      workspace_id: `eq.${workspaceId}`,
      user_id: `eq.${userId}`,
      status: 'eq.active',
      limit: '1',
    },
  });
  return ok(resposta.status) && Array.isArray(resposta.json) && resposta.json.length === 1;
}

export function chamarRpc(config: ConfigDoBanco, nome: string, parametros: Record<string, unknown>) {
  return chamarBanco(config, { metodo: 'POST', caminho: `/rest/v1/rpc/${nome}`, corpo: parametros });
}
