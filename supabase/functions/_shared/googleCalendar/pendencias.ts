// Pendências de conexão (status 'pending'): descarte e limpeza das vencidas.
// Sem cron: connect e confirm limpam as vencidas a cada chamada.

import { chamarBanco, chamarRpc, ok } from './banco.ts';
import { revogarSeNinguemMaisUsa } from './tokens.ts';

type Config = { supabaseUrl: string; serviceRoleKey: string };

// Apaga a pendência e revoga no Google o token que ela guardava. O token é
// lido antes do DELETE (o trigger apaga o segredo junto com a linha). O
// filtro status=pending impede apagar uma conexão que já foi ativada.
export async function descartarPendencia(config: Config, pendencia: { id: string; account_email: string | null }) {
  const segredo = await chamarRpc(config, 'calendar_connection_get_refresh_token', { p_connection_id: pendencia.id });
  const token = ok(segredo.status) && typeof segredo.json === 'string' ? segredo.json : '';

  const remocao = await chamarBanco(config, {
    metodo: 'DELETE',
    caminho: '/rest/v1/calendar_connections',
    query: { id: `eq.${pendencia.id}`, status: 'eq.pending', select: 'id' },
    prefer: 'return=representation',
  });
  const apagou = ok(remocao.status) && Array.isArray(remocao.json) && remocao.json.length === 1;
  if (!apagou) return false;

  await revogarSeNinguemMaisUsa(config, { token, email: pendencia.account_email, exceto: pendencia.id });
  return true;
}

export async function limparPendenciasVencidas(config: Config, limite = 20) {
  const vencidas = await chamarBanco(config, {
    caminho: '/rest/v1/calendar_connections',
    query: {
      select: 'id,account_email',
      status: 'eq.pending',
      confirmation_expires_at: `lt.${new Date().toISOString()}`,
      limit: String(limite),
    },
  });
  if (!ok(vencidas.status) || !Array.isArray(vencidas.json)) return;
  for (const pendencia of vencidas.json) {
    await descartarPendencia(config, pendencia);
  }
}
