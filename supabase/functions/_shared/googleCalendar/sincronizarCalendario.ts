// Importação do Google Agenda (#101, épico #98).
//
// sincronizarCalendario: um calendário lido, sob a trava sync_lock_until.
// - Incremental com o syncToken guardado. 410 (token vencido) vira sync
//   completo da janela, sem duplicar: o vínculo é a chave.
// - Completo (sem token, ou o último completo tem mais de 7 dias): lista a
//   janela now() - 30 dias a now() + 365 dias e, no fim, cancela o item vindo
//   do Google cujo evento não apareceu (google_calendar_import_varrer). O
//   completo semanal também traz as ocorrências de série que entraram na
//   janela sem mudar no Google.
// - Cada página: estado atual (RPC) -> planejarLote (mapearEvento.js) ->
//   google_calendar_import_aplicar (RPC, com a variável anti-loop).
//
// sincronizarConexao: usado pelo sync-dispatch e pelo sync-now. Atualiza a
// lista de calendários uma vez, encerra o canal de quem deixou de ser lido,
// garante o canal e sincroniza cada calendário lido.
//
// Nunca lança. Nenhum token vai para log.

import { chamarGoogleAgenda, registrarFalhaDoGoogle } from './api.ts';
import { chamarBanco, chamarRpc, ok, type ConfigDoBanco } from './banco.ts';
import { atualizarListaDeCalendarios } from './calendarios.ts';
import { encerrarLeitura, garantirCanal, type CalendarioComCanal } from './canal.ts';
import { janelaDeImportacao, planejarLote } from './mapearEvento.js';
import { obterAccessTokenGoogle } from './tokens.ts';

export const COMPLETO_A_CADA_MS = 7 * 24 * 60 * 60 * 1000;
const MAXIMO_DE_PAGINAS = 40;
const TRAVA_S = 300;
// Folga contra diferença de relógio entre o Edge e o banco na varredura.
const FOLGA_DA_VARREDURA_MS = 5 * 60 * 1000;

const CAMPOS_DO_CALENDARIO = [
  'id', 'external_calendar_id', 'is_read', 'sync_token', 'sync_window_start', 'sync_window_end',
  'last_full_sync_at', 'channel_id', 'channel_resource_id', 'channel_expires_at',
].join(',');

export interface ConexaoParaSync {
  id: string;
  user_id: string;
  workspace_id: string;
  app_calendar_id?: string | null;
}

export interface CalendarioParaSync extends CalendarioComCanal {
  sync_token: string | null;
  sync_window_start?: string | null;
  sync_window_end?: string | null;
  last_full_sync_at: string | null;
}

export type StatusDoCalendario = 'ok' | 'skipped' | 'erro';

export interface ResultadoDoCalendario {
  external_calendar_id: string;
  inseridos: number;
  atualizados: number;
  cancelados: number;
  status: StatusDoCalendario;
  erro?: string;
}

export type ErroDaConexao =
  | 'fora_do_espaco'
  | 'conexao_revogada'
  | 'sem_token'
  | 'escopo_insuficiente'
  | 'google_indisponivel'
  | 'banco_indisponivel';

type Contagem = { inseridos: number; atualizados: number; cancelados: number };

export function precisaDeSyncCompleto(calendario: CalendarioParaSync, agora = Date.now()) {
  if (!calendario.sync_token) return true;
  const ultimo = Date.parse(calendario.last_full_sync_at ?? '');
  return Number.isNaN(ultimo) || agora - ultimo > COMPLETO_A_CADA_MS;
}

function resultadoVazio(calendario: { external_calendar_id: string }, status: StatusDoCalendario, erro?: string): ResultadoDoCalendario {
  return { external_calendar_id: calendario.external_calendar_id, inseridos: 0, atualizados: 0, cancelados: 0, status, ...(erro ? { erro } : {}) };
}

function erroDaListagem(resposta: Awaited<ReturnType<typeof chamarGoogleAgenda>>) {
  if (resposta.status === 410) return 'sync_token_vencido';
  if (resposta.status === 401) return 'conexao_revogada';
  if (resposta.status === 404) return 'calendario_ausente';
  if (registrarFalhaDoGoogle('google-calendar-sync: listar eventos', resposta)) return 'escopo_insuficiente';
  return 'google_indisponivel';
}

async function passada({
  config,
  accessToken,
  conexao,
  calendario,
  completo,
  janela,
}: {
  config: ConfigDoBanco;
  accessToken: string;
  conexao: ConexaoParaSync;
  calendario: CalendarioParaSync;
  completo: boolean;
  janela: { inicio: string; fim: string };
}): Promise<{ contagem: Contagem; syncToken: string | null } | { erro: string }> {
  const contagem: Contagem = { inseridos: 0, atualizados: 0, cancelados: 0 };
  const caminho = `/calendars/${encodeURIComponent(calendario.external_calendar_id)}/events`;
  let pageToken: string | undefined;

  for (let pagina = 0; pagina < MAXIMO_DE_PAGINAS; pagina += 1) {
    const resposta = await chamarGoogleAgenda(accessToken, {
      caminho,
      query: {
        singleEvents: true,
        maxResults: 250,
        pageToken,
        ...(completo ? { timeMin: janela.inicio, timeMax: janela.fim } : { syncToken: calendario.sync_token }),
      },
    });
    if (resposta.status !== 200) return { erro: erroDaListagem(resposta) };

    const eventos = Array.isArray(resposta.json?.items) ? resposta.json.items : [];
    if (eventos.length > 0) {
      const ids = eventos.map((evento: { id?: unknown }) => evento?.id).filter((id: unknown) => typeof id === 'string' && id);
      const estado = await chamarRpc(config, 'google_calendar_import_estado', {
        p_connection_id: conexao.id,
        p_calendar_id: calendario.external_calendar_id,
        p_external_ids: ids,
      });
      if (!ok(estado.status) || !Array.isArray(estado.json)) return { erro: 'banco_indisponivel' };

      const operacoes = planejarLote({ eventos, estado: estado.json, workspaceId: conexao.workspace_id, janela });
      if (operacoes.length > 0) {
        const aplicacao = await chamarRpc(config, 'google_calendar_import_aplicar', {
          p_connection_id: conexao.id,
          p_calendar_id: calendario.external_calendar_id,
          p_operacoes: operacoes,
        });
        if (!ok(aplicacao.status) || !aplicacao.json || typeof aplicacao.json !== 'object') return { erro: 'banco_indisponivel' };
        const parcial = aplicacao.json as Partial<Contagem>;
        contagem.inseridos += Number(parcial.inseridos) || 0;
        contagem.atualizados += Number(parcial.atualizados) || 0;
        contagem.cancelados += Number(parcial.cancelados) || 0;
      }
    }

    pageToken = typeof resposta.json?.nextPageToken === 'string' ? resposta.json.nextPageToken : undefined;
    if (!pageToken) {
      const syncToken = typeof resposta.json?.nextSyncToken === 'string' ? resposta.json.nextSyncToken : null;
      return { contagem, syncToken };
    }
  }
  return { erro: 'paginas_demais' };
}

export async function sincronizarCalendario({
  config,
  accessToken,
  conexao,
  calendario,
  agora = Date.now(),
}: {
  config: ConfigDoBanco;
  accessToken: string;
  conexao: ConexaoParaSync;
  calendario: CalendarioParaSync;
  agora?: number;
}): Promise<ResultadoDoCalendario> {
  const trava = await chamarRpc(config, 'google_calendar_sync_travar', { p_calendario_id: calendario.id, p_segundos: TRAVA_S });
  if (!ok(trava.status)) return resultadoVazio(calendario, 'erro', 'banco_indisponivel');
  if (trava.json !== true) return resultadoVazio(calendario, 'skipped');

  const janela = janelaDeImportacao(new Date(agora));
  let completo = precisaDeSyncCompleto(calendario, agora);
  let execucao = await passada({ config, accessToken, conexao, calendario, completo, janela });
  if ('erro' in execucao && execucao.erro === 'sync_token_vencido' && !completo) {
    completo = true;
    execucao = await passada({ config, accessToken, conexao, calendario, completo, janela });
  }

  const caminho = '/rest/v1/calendar_connection_calendars';
  if ('erro' in execucao) {
    await chamarBanco(config, {
      metodo: 'PATCH',
      caminho,
      query: { id: `eq.${calendario.id}` },
      corpo: {
        sync_lock_until: null,
        last_sync_error: execucao.erro,
        // Token vencido mesmo no completo: o próximo começa do zero.
        ...(execucao.erro === 'sync_token_vencido' ? { sync_token: null } : {}),
      },
      prefer: 'return=minimal',
    });
    return resultadoVazio(calendario, 'erro', execucao.erro);
  }

  const contagem = { ...execucao.contagem };
  if (completo) {
    const varredura = await chamarRpc(config, 'google_calendar_import_varrer', {
      p_connection_id: conexao.id,
      p_calendar_id: calendario.external_calendar_id,
      p_visto_antes: new Date(agora - FOLGA_DA_VARREDURA_MS).toISOString(),
      p_inicio: janela.inicio,
      p_fim: janela.fim,
    });
    if (ok(varredura.status) && typeof varredura.json === 'number') contagem.cancelados += varredura.json;
  }

  const agoraIso = new Date().toISOString();
  await chamarBanco(config, {
    metodo: 'PATCH',
    caminho,
    query: { id: `eq.${calendario.id}` },
    corpo: {
      sync_token: execucao.syncToken,
      sync_lock_until: null,
      last_synced_at: agoraIso,
      last_sync_error: null,
      ...(completo ? { last_full_sync_at: agoraIso, sync_window_start: janela.inicio, sync_window_end: janela.fim } : {}),
    },
    prefer: 'return=minimal',
  });

  return { external_calendar_id: calendario.external_calendar_id, ...contagem, status: 'ok' };
}

// Membro ativo com permissão de criar compromisso. null: o banco não respondeu.
async function podeImportar(config: ConfigDoBanco, conexao: ConexaoParaSync): Promise<boolean | null> {
  const resposta = await chamarBanco(config, {
    caminho: '/rest/v1/workspace_members',
    query: {
      select: 'workspace_id',
      workspace_id: `eq.${conexao.workspace_id}`,
      user_id: `eq.${conexao.user_id}`,
      status: 'eq.active',
      role: 'in.(owner,admin,member)',
      limit: '1',
    },
  });
  if (!ok(resposta.status) || !Array.isArray(resposta.json)) return null;
  return resposta.json.length === 1;
}

export async function lerCalendariosDaConexao(config: ConfigDoBanco, connectionId: string) {
  const resposta = await chamarBanco(config, {
    caminho: '/rest/v1/calendar_connection_calendars',
    query: { select: CAMPOS_DO_CALENDARIO, connection_id: `eq.${connectionId}`, order: 'is_primary.desc,external_calendar_id.asc' },
  });
  if (!ok(resposta.status) || !Array.isArray(resposta.json)) return null;
  return resposta.json as CalendarioParaSync[];
}

// Prepara o acesso de uma conexão: dono no espaço e access token.
export async function prepararConexao(
  config: ConfigDoBanco,
  conexao: ConexaoParaSync,
): Promise<{ accessToken: string } | { erro: ErroDaConexao }> {
  const membro = await podeImportar(config, conexao);
  if (membro === null) return { erro: 'banco_indisponivel' };
  if (!membro) return { erro: 'fora_do_espaco' };

  const token = await obterAccessTokenGoogle({ ...config, connectionId: conexao.id });
  if ('erro' in token) return { erro: token.erro };
  return { accessToken: token.accessToken };
}

async function marcarEscopoInsuficiente(config: ConfigDoBanco, connectionId: string) {
  await chamarBanco(config, {
    metodo: 'PATCH',
    caminho: '/rest/v1/calendar_connections',
    query: { id: `eq.${connectionId}` },
    corpo: { last_error_code: 'escopo_insuficiente', last_error_at: new Date().toISOString() },
    prefer: 'return=minimal',
  });
}

export async function sincronizarConexao({
  config,
  conexao,
}: {
  config: ConfigDoBanco;
  conexao: ConexaoParaSync;
}): Promise<{ sincronizado_em: string; calendarios: ResultadoDoCalendario[] } | { erro: ErroDaConexao }> {
  const acesso = await prepararConexao(config, conexao);
  if ('erro' in acesso) return acesso;
  const { accessToken } = acesso;

  const lista = await atualizarListaDeCalendarios({
    ...config,
    connectionId: conexao.id,
    accessToken,
    appCalendarId: conexao.app_calendar_id ?? null,
  });
  if ('erro' in lista) {
    if (lista.erro === 'escopo_insuficiente') await marcarEscopoInsuficiente(config, conexao.id);
    return { erro: lista.erro as ErroDaConexao };
  }

  const calendarios = await lerCalendariosDaConexao(config, conexao.id);
  if (!calendarios) return { erro: 'banco_indisponivel' };

  const resultados: ResultadoDoCalendario[] = [];
  let escopoFaltando = false;
  for (const calendario of calendarios) {
    if (!calendario.is_read) {
      if (calendario.channel_id || calendario.sync_token) await encerrarLeitura({ config, accessToken, calendario });
      continue;
    }
    // Canal antes do sync: a mudança feita durante a listagem ainda gera aviso.
    await garantirCanal({ config, accessToken, calendario });
    const resultado = await sincronizarCalendario({ config, accessToken, conexao, calendario });
    if (resultado.erro === 'escopo_insuficiente') escopoFaltando = true;
    resultados.push(resultado);
  }
  if (escopoFaltando) await marcarEscopoInsuficiente(config, conexao.id);

  const sincronizadoEm = new Date().toISOString();
  await chamarBanco(config, {
    metodo: 'PATCH',
    caminho: '/rest/v1/calendar_connections',
    query: { id: `eq.${conexao.id}`, status: 'eq.active' },
    corpo: { last_synced_at: sincronizadoEm },
    prefer: 'return=minimal',
  });

  return { sincronizado_em: sincronizadoEm, calendarios: resultados };
}
