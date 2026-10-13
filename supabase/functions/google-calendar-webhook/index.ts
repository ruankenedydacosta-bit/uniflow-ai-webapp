// Edge Function: google-calendar-webhook (issue #101, épico #98)
//
// Recebe o aviso do events.watch do Google. verify_jwt = false: o Google não
// manda JWT. Quem autentica é o canal: X-Goog-Channel-ID precisa existir em
// calendar_connection_calendars, X-Goog-Channel-Token precisa bater com o
// channel_token guardado (comparação em tempo constante) e X-Goog-Resource-ID
// com o channel_resource_id. Canal desconhecido ou inválido recebe a mesma
// resposta vazia, sem dizer o motivo.
//
// O aviso não traz o evento: dispara o sync incremental daquele calendário
// depois da resposta (EdgeRuntime.waitUntil), para o Google não esperar.
// Pula conexão inativa, calendário que deixou de ser lido e dono fora do
// espaço. Calendário já em sync (sync_lock_until no futuro) espera 5 s e
// confere de novo, até três vezes, antes de pedir o access token: uma rajada
// de avisos não vira uma troca de token por aviso.

import { mesmoToken } from '../_shared/googleCalendar/canal.ts';
import { chamarBanco, ok, type ConfigDoBanco } from '../_shared/googleCalendar/banco.ts';
import {
  prepararConexao,
  sincronizarCalendario,
  type CalendarioParaSync,
  type ConexaoParaSync,
} from '../_shared/googleCalendar/sincronizarCalendario.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TENTATIVAS_COM_TRAVA = 3;
const ESPERA_ENTRE_TENTATIVAS_MS = 5000;

const CAMPOS = [
  'id', 'external_calendar_id', 'is_read', 'sync_token', 'sync_window_start', 'sync_window_end',
  'last_full_sync_at', 'channel_id', 'channel_resource_id', 'channel_token', 'channel_expires_at', 'sync_lock_until',
  'conexao:calendar_connections(id,user_id,workspace_id,status)',
].join(',');

type Linha = CalendarioParaSync & {
  channel_token: string | null;
  sync_lock_until: string | null;
  conexao: (ConexaoParaSync & { status: string }) | null;
};

function vazio(status = 200) {
  return new Response(null, { status });
}

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function travado(calendario: Linha) {
  const ate = Date.parse(calendario.sync_lock_until ?? '');
  return !Number.isNaN(ate) && ate > Date.now();
}

async function sincronizarDoAviso(config: ConfigDoBanco, linha: Linha) {
  const conexao = linha.conexao!;
  let accessToken: string | null = null;
  let calendario: Linha | null = linha;
  for (let tentativa = 1; tentativa <= TENTATIVAS_COM_TRAVA && calendario; tentativa += 1) {
    if (!travado(calendario)) {
      if (!accessToken) {
        const acesso = await prepararConexao(config, conexao);
        if ('erro' in acesso) {
          if (acesso.erro !== 'fora_do_espaco') console.error('google-calendar-webhook: conexão indisponível', acesso.erro);
          return;
        }
        accessToken = acesso.accessToken;
      }
      const resultado = await sincronizarCalendario({ config, accessToken, conexao, calendario });
      if (resultado.status === 'erro') console.error('google-calendar-webhook: sync falhou', resultado.erro);
      if (resultado.status !== 'skipped') return;
    }
    if (tentativa === TENTATIVAS_COM_TRAVA) return;
    await esperar(ESPERA_ENTRE_TENTATIVAS_MS);
    // O sync que segurava a trava pode ter trocado o syncToken.
    calendario = await lerCalendario(config, linha.id);
  }
}

async function lerCalendario(config: ConfigDoBanco, id: string) {
  const resposta = await chamarBanco(config, {
    caminho: '/rest/v1/calendar_connection_calendars',
    query: { select: CAMPOS, id: `eq.${id}`, limit: '1' },
  });
  if (!ok(resposta.status) || !Array.isArray(resposta.json)) return null;
  const linha = resposta.json[0] as Linha | undefined;
  return linha?.is_read ? linha : null;
}

function emSegundoPlano(tarefa: Promise<unknown>) {
  const segura = tarefa.catch((erro) => console.error('google-calendar-webhook: falha no sync', erro instanceof Error ? erro.message : 'desconhecida'));
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (typeof runtime?.waitUntil === 'function') {
    runtime.waitUntil(segura);
    return null;
  }
  return segura;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return vazio(405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceRoleKey) return vazio(503);
  const config = { supabaseUrl, serviceRoleKey };

  const channelId = request.headers.get('X-Goog-Channel-ID') ?? '';
  const channelToken = request.headers.get('X-Goog-Channel-Token') ?? '';
  const resourceId = request.headers.get('X-Goog-Resource-ID') ?? '';
  const estado = request.headers.get('X-Goog-Resource-State') ?? '';
  if (!UUID_RE.test(channelId) || !channelToken || !resourceId) return vazio();

  const busca = await chamarBanco(config, {
    caminho: '/rest/v1/calendar_connection_calendars',
    query: { select: CAMPOS, channel_id: `eq.${channelId}`, limit: '1' },
  });
  // Banco fora do ar: 503 faz o Google tentar de novo mais tarde.
  if (!ok(busca.status) || !Array.isArray(busca.json)) return vazio(503);
  const linha = busca.json[0] as Linha | undefined;

  if (!linha || !mesmoToken(linha.channel_token, channelToken) || linha.channel_resource_id !== resourceId) {
    return vazio();
  }

  // 'sync' é o aviso de canal criado; não há mudança para buscar.
  if (estado === 'sync') return vazio();
  if (!linha.is_read || linha.conexao?.status !== 'active') return vazio();

  const pendente = emSegundoPlano(sincronizarDoAviso(config, linha));
  if (pendente) await pendente;
  return vazio();
});
