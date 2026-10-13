// Edge Function: google-calendar-sync-dispatch (issue #101, épico #98)
//
// Sync de segurança e renovação dos canais. Chamada pelo pg_cron a cada 10
// minutos (migration 073), com o segredo de
// private.google_calendar_dispatch_secret no cabeçalho X-Dispatch-Secret.
// verify_jwt = false.
//
// Pega até 10 conexões ativas sem passada nos últimos 30 minutos, com o dono
// ainda no espaço (google_calendar_sync_candidatas). Para cada uma:
// atualiza a lista de calendários uma vez, encerra o canal do calendário que
// deixou de ser lido, cria ou renova o canal dos lidos e roda o sync.
// Para de pegar conexão nova depois de 60 s de execução.
//
// Nenhum token vai para log nem para a resposta.

import { chamarRpc, ok } from '../_shared/googleCalendar/banco.ts';
import { sincronizarConexao, type ConexaoParaSync } from '../_shared/googleCalendar/sincronizarCalendario.ts';

const CONEXOES_POR_EXECUCAO = 10;
const ORCAMENTO_MS = 60 * 1000;

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse(405, errorBody('METHOD_NOT_ALLOWED', 'Método não permitido.'));
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(503, errorBody('SERVICE_UNAVAILABLE', 'Google Agenda não configurado.'));
  }
  const config = { supabaseUrl, serviceRoleKey };

  const segredo = request.headers.get('X-Dispatch-Secret') ?? '';
  const verificacao = segredo
    ? await chamarRpc(config, 'verify_google_calendar_dispatch_secret', { candidate: segredo })
    : null;
  if (!verificacao || !ok(verificacao.status) || verificacao.json !== true) {
    return jsonResponse(401, errorBody('UNAUTHORIZED', 'Segredo de disparo inválido.'));
  }

  const busca = await chamarRpc(config, 'google_calendar_sync_candidatas', { p_limite: CONEXOES_POR_EXECUCAO });
  if (!ok(busca.status) || !Array.isArray(busca.json)) {
    return jsonResponse(502, errorBody('DATABASE_UNAVAILABLE', 'Banco indisponível.'));
  }

  const inicio = Date.now();
  let processadas = 0;
  let falhas = 0;
  const totais = { inseridos: 0, atualizados: 0, cancelados: 0 };

  for (const conexao of busca.json as ConexaoParaSync[]) {
    if (Date.now() - inicio > ORCAMENTO_MS) break;
    processadas += 1;
    const resultado = await sincronizarConexao({ config, conexao });
    if ('erro' in resultado) {
      falhas += 1;
      console.error('google-calendar-sync-dispatch: conexão não sincronizada', resultado.erro);
      continue;
    }
    for (const calendario of resultado.calendarios) {
      totais.inseridos += calendario.inseridos;
      totais.atualizados += calendario.atualizados;
      totais.cancelados += calendario.cancelados;
      if (calendario.status === 'erro') falhas += 1;
    }
  }

  return jsonResponse(200, { conexoes: processadas, falhas, ...totais });
});
