// Pendências de conexão (status 'pending'): linhas à parte, criadas pelo
// callback do OAuth, que não tocam a conexão que já existe no espaço.
// Descarte, limpeza das vencidas (sem cron) e leitura do token guardado.

import { chamarBanco, chamarRpc, ok } from './banco.ts';
import { revogarSeNinguemMaisUsa } from './tokens.ts';

type Config = { supabaseUrl: string; serviceRoleKey: string };

export async function lerTokenDaPendencia(config: Config, pendenciaId: string) {
  const segredo = await chamarRpc(config, 'calendar_connection_get_refresh_token', { p_connection_id: pendenciaId });
  return ok(segredo.status) && typeof segredo.json === 'string' ? segredo.json : '';
}

// Apaga a pendência e, se `revogar`, revoga no Google o token que ela
// guardava. O token é lido antes do DELETE (o trigger apaga o segredo junto
// com a linha). O filtro status=pending garante que só pendência sai daqui.
export async function descartarPendencia(
  config: Config,
  pendencia: { id: string; account_email: string | null },
  { revogar = true }: { revogar?: boolean } = {},
) {
  const token = revogar ? await lerTokenDaPendencia(config, pendencia.id) : '';

  const remocao = await chamarBanco(config, {
    metodo: 'DELETE',
    caminho: '/rest/v1/calendar_connections',
    query: { id: `eq.${pendencia.id}`, status: 'eq.pending', select: 'id' },
    prefer: 'return=representation',
  });
  const apagou = ok(remocao.status) && Array.isArray(remocao.json) && remocao.json.length === 1;
  if (!apagou) return false;

  if (revogar) {
    await revogarSeNinguemMaisUsa(config, { token, email: pendencia.account_email, exceto: pendencia.id });
  }
  return true;
}

export async function limparPendenciasVencidas(config: Config, limite = 5) {
  const vencidas = await chamarBanco(config, {
    caminho: '/rest/v1/calendar_connections',
    query: {
      select: 'id,account_email',
      status: 'eq.pending',
      // Mesma fronteira de classificarConfirmacao: vence <= agora.
      confirmation_expires_at: `lte.${new Date().toISOString()}`,
      limit: String(limite),
    },
  });
  if (!ok(vencidas.status) || !Array.isArray(vencidas.json)) return;
  await Promise.all(vencidas.json.map((pendencia) => descartarPendencia(config, pendencia)));
}

// Roda a limpeza depois da resposta quando o runtime permite
// (EdgeRuntime.waitUntil); senão, espera aqui mesmo.
export async function agendarLimpezaDePendencias(config: Config) {
  const tarefa = limparPendenciasVencidas(config).catch(() => {});
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (typeof runtime?.waitUntil === 'function') {
    runtime.waitUntil(tarefa);
    return;
  }
  await tarefa;
}
