// Edge Function: google-calendar-export (issue #100, épico #98)
//
// Consome calendar_export_queue (migration 060). Chamada pelo pg_cron a cada
// minuto, com o segredo de private.google_calendar_dispatch_secret no
// cabeçalho X-Dispatch-Secret. verify_jwt = false.
//
// Para cada linha reservada:
// - Sem conexão ativa de quem criou o item, ou dono fora do espaço: conclui
//   sem chamar o Google.
// - upsert: lê o item ao vivo. Com vínculo, PATCH com If-Match; no 412, se o
//   evento no Google é mais novo que o item, a importação (#101) traz a
//   mudança; senão, repete com o etag novo. Sem vínculo, insere no destino
//   com id derivado do item, e um 409 (insert repetido) vira PATCH.
// - delete (item cancelado ou excluído): apaga o evento e o vínculo. Item que
//   veio do Google (origin = 'provider') não é tocado.
// - Falha do Google: a linha volta para a fila com espera crescente.
//
// Antes da fila, faz a exportação inicial das conexões ativas que ainda não
// passaram por ela.
//
// Nenhum token vai para log nem para a resposta.

import { chamarGoogleAgenda, registrarFalhaDoGoogle, type RespostaGoogleAgenda } from '../_shared/googleCalendar/api.ts';
import { chamarBanco, chamarRpc, membroAtivoDoEspaco, ok, type ConfigDoBanco } from '../_shared/googleCalendar/banco.ts';
import { corpoDeInsercao, idDoEventoGoogle, montarEventoGoogle } from '../_shared/googleCalendar/eventoGoogle.js';
import { obterAccessTokenGoogle } from '../_shared/googleCalendar/tokens.ts';

const LIMITE_POR_EXECUCAO = 50;
const CONEXOES_INICIAIS_POR_EXECUCAO = 10;
const MAXIMO_DE_TENTATIVAS = 30;
const ESPERA_MAXIMA_MS = 60 * 60 * 1000;

const CAMPOS_DO_ITEM = 'id,workspace_id,created_by,title,description,location,starts_at,ends_at,is_all_day,has_explicit_time,item_type,status,updated_at';

interface LinhaDaFila {
  id: number;
  agenda_item_id: string;
  workspace_id: string;
  user_id: string;
  operacao: 'upsert' | 'delete';
  calendar_id: string | null;
  external_id: string | null;
  versao: number;
  tentativas: number;
}

interface Conexao {
  id: string;
  user_id: string;
  workspace_id: string;
  destination_calendar_id: string | null;
}

interface Vinculo {
  id: string;
  calendar_id: string;
  external_id: string;
  etag: string | null;
  origin: 'app' | 'provider';
}

type Contexto =
  | { tipo: 'pronto'; conexao: Conexao; accessToken: string }
  | { tipo: 'concluir'; motivo: string }
  | { tipo: 'tentar_de_novo'; motivo: string };

type Resultado =
  | { tipo: 'concluir'; motivo?: string }
  | { tipo: 'tentar_de_novo'; motivo: string };

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

// 1, 2, 4, 8... minutos, até 1 hora.
function esperaAteATentativa(tentativas: number) {
  return Math.min(2 ** Math.max(0, tentativas - 1) * 60 * 1000, ESPERA_MAXIMA_MS);
}

function caminhoDoEvento(calendarId: string, eventId: string) {
  return `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
}

function falhaDoGoogle(resposta: RespostaGoogleAgenda, onde: string): Resultado {
  const semEscopo = registrarFalhaDoGoogle(`google-calendar-export: ${onde}`, resposta);
  return { tipo: 'tentar_de_novo', motivo: semEscopo ? 'escopo_insuficiente' : `google_${resposta.status}` };
}

async function marcarErroNaConexao(config: ConfigDoBanco, conexaoId: string, codigo: 'destino_ausente' | 'escopo_insuficiente') {
  await chamarBanco(config, {
    metodo: 'PATCH',
    caminho: '/rest/v1/calendar_connections',
    query: { id: `eq.${conexaoId}` },
    corpo: { last_error_code: codigo, last_error_at: new Date().toISOString() },
    prefer: 'return=minimal',
  });
}

async function prepararContexto(config: ConfigDoBanco, userId: string, workspaceId: string): Promise<Contexto> {
  const busca = await chamarBanco(config, {
    caminho: '/rest/v1/calendar_connections',
    query: {
      select: 'id,user_id,workspace_id,destination_calendar_id',
      user_id: `eq.${userId}`,
      workspace_id: `eq.${workspaceId}`,
      provider: 'eq.google',
      status: 'eq.active',
      limit: '1',
    },
  });
  if (!ok(busca.status) || !Array.isArray(busca.json)) return { tipo: 'tentar_de_novo', motivo: 'banco_indisponivel' };
  const conexao = busca.json[0] as Conexao | undefined;
  if (!conexao) return { tipo: 'concluir', motivo: 'sem_conexao' };

  if (!(await membroAtivoDoEspaco(config, userId, workspaceId))) return { tipo: 'concluir', motivo: 'fora_do_espaco' };

  const token = await obterAccessTokenGoogle({ ...config, connectionId: conexao.id });
  if ('erro' in token) {
    // Token revogado: obterAccessTokenGoogle já marcou a conexão com erro.
    if (token.erro === 'google_indisponivel') return { tipo: 'tentar_de_novo', motivo: 'google_indisponivel' };
    return { tipo: 'concluir', motivo: 'conexao_revogada' };
  }
  return { tipo: 'pronto', conexao, accessToken: token.accessToken };
}

async function lerItem(config: ConfigDoBanco, itemId: string) {
  const resposta = await chamarBanco(config, {
    caminho: '/rest/v1/agenda_items',
    query: { select: CAMPOS_DO_ITEM, id: `eq.${itemId}`, limit: '1' },
  });
  if (!ok(resposta.status) || !Array.isArray(resposta.json)) return { erro: true as const };
  return { item: (resposta.json[0] ?? null) as Record<string, any> | null };
}

async function lerVinculo(config: ConfigDoBanco, itemId: string) {
  const resposta = await chamarBanco(config, {
    caminho: '/rest/v1/agenda_item_links',
    query: { select: 'id,calendar_id,external_id,etag,origin', agenda_item_id: `eq.${itemId}`, provider: 'eq.google', limit: '1' },
  });
  if (!ok(resposta.status) || !Array.isArray(resposta.json)) return { erro: true as const };
  return { vinculo: (resposta.json[0] ?? null) as Vinculo | null };
}

async function atualizarVinculo(config: ConfigDoBanco, vinculoId: string, evento: Record<string, any>) {
  await chamarBanco(config, {
    metodo: 'PATCH',
    caminho: '/rest/v1/agenda_item_links',
    query: { id: `eq.${vinculoId}` },
    corpo: {
      etag: typeof evento?.etag === 'string' ? evento.etag : null,
      remote_updated_at: typeof evento?.updated === 'string' ? evento.updated : null,
      remote_seen_at: new Date().toISOString(),
    },
    prefer: 'return=minimal',
  });
}

// Grava o vínculo do evento recém-criado. Se o item foi excluído enquanto o
// insert estava no Google (FK 23503), apaga o evento para não deixar órfão.
async function gravarVinculoNovo(
  config: ConfigDoBanco,
  accessToken: string,
  linha: LinhaDaFila,
  calendarId: string,
  evento: Record<string, any>,
): Promise<Resultado> {
  const gravacao = await chamarBanco(config, {
    metodo: 'POST',
    caminho: '/rest/v1/agenda_item_links',
    corpo: {
      agenda_item_id: linha.agenda_item_id,
      workspace_id: linha.workspace_id,
      user_id: linha.user_id,
      provider: 'google',
      calendar_id: calendarId,
      external_id: evento.id,
      etag: typeof evento.etag === 'string' ? evento.etag : null,
      remote_updated_at: typeof evento.updated === 'string' ? evento.updated : null,
      remote_seen_at: new Date().toISOString(),
      origin: 'app',
    },
    prefer: 'return=minimal',
  });
  // O PostgREST responde 409 tanto para FK (23503) quanto para vínculo
  // repetido (23505): o código decide.
  const codigo = (gravacao.json as { code?: string } | null)?.code;
  if (codigo === '23503') {
    await chamarGoogleAgenda(accessToken, { metodo: 'DELETE', caminho: caminhoDoEvento(calendarId, evento.id) });
    return { tipo: 'concluir', motivo: 'item_excluido' };
  }
  if (ok(gravacao.status) || codigo === '23505') return { tipo: 'concluir' };
  return { tipo: 'tentar_de_novo', motivo: 'banco_indisponivel' };
}

async function exportarItem(config: ConfigDoBanco, contexto: { conexao: Conexao; accessToken: string }, linha: LinhaDaFila): Promise<Resultado> {
  const { conexao, accessToken } = contexto;

  const leitura = await lerItem(config, linha.agenda_item_id);
  if ('erro' in leitura) return { tipo: 'tentar_de_novo', motivo: 'banco_indisponivel' };
  const item = leitura.item;
  if (!item) return { tipo: 'concluir', motivo: 'item_excluido' };

  const busca = await lerVinculo(config, item.id);
  if ('erro' in busca) return { tipo: 'tentar_de_novo', motivo: 'banco_indisponivel' };
  const vinculo = busca.vinculo;
  if (vinculo?.origin === 'provider') return { tipo: 'concluir', motivo: 'veio_do_google' };

  if (item.status === 'cancelled') {
    if (!vinculo) return { tipo: 'concluir' };
    return apagarEvento(config, accessToken, vinculo.calendar_id, vinculo.external_id, vinculo.id);
  }

  const evento = montarEventoGoogle(item);

  if (vinculo) {
    const caminho = caminhoDoEvento(vinculo.calendar_id, vinculo.external_id);
    let resposta = await chamarGoogleAgenda(accessToken, {
      metodo: 'PATCH',
      caminho,
      corpo: evento,
      cabecalhos: vinculo.etag ? { 'If-Match': vinculo.etag } : undefined,
    });

    if (resposta.status === 412) {
      const atual = await chamarGoogleAgenda(accessToken, { caminho });
      if (atual.status !== 200) return falhaDoGoogle(atual, 'ler evento no conflito');
      const atualizadoNoGoogle = Date.parse(atual.json?.updated ?? '');
      if (atualizadoNoGoogle > Date.parse(item.updated_at)) return { tipo: 'concluir', motivo: 'google_mais_novo' };
      resposta = await chamarGoogleAgenda(accessToken, {
        metodo: 'PATCH',
        caminho,
        corpo: evento,
        cabecalhos: typeof atual.json?.etag === 'string' ? { 'If-Match': atual.json.etag } : undefined,
      });
    }

    if (resposta.status === 200) {
      await atualizarVinculo(config, vinculo.id, resposta.json);
      return { tipo: 'concluir' };
    }
    // Evento apagado no Google: a importação (#101) cancela o item no app.
    if (resposta.status === 404 || resposta.status === 410) return { tipo: 'concluir', motivo: 'evento_ausente' };
    return falhaDoGoogle(resposta, 'atualizar evento');
  }

  const destino = conexao.destination_calendar_id;
  if (!destino) {
    await marcarErroNaConexao(config, conexao.id, 'destino_ausente');
    return { tipo: 'tentar_de_novo', motivo: 'destino_ausente' };
  }
  const eventId = idDoEventoGoogle(item.id);
  if (!eventId) return { tipo: 'concluir', motivo: 'item_invalido' };

  const criado = await chamarGoogleAgenda(accessToken, {
    metodo: 'POST',
    caminho: `/calendars/${encodeURIComponent(destino)}/events`,
    corpo: corpoDeInsercao(evento, eventId),
  });
  if (criado.status === 200) return gravarVinculoNovo(config, accessToken, linha, destino, criado.json);

  // Insert repetido (o anterior deu certo e o vínculo não foi gravado) ou
  // evento cancelado de volta: o id já existe no calendário.
  if (criado.status === 409) {
    const atualizado = await chamarGoogleAgenda(accessToken, {
      metodo: 'PATCH',
      caminho: caminhoDoEvento(destino, eventId),
      corpo: evento,
    });
    if (atualizado.status === 200) return gravarVinculoNovo(config, accessToken, linha, destino, atualizado.json);
    return falhaDoGoogle(atualizado, 'reaproveitar evento');
  }

  if (criado.status === 404) {
    await marcarErroNaConexao(config, conexao.id, 'destino_ausente');
    return { tipo: 'tentar_de_novo', motivo: 'destino_ausente' };
  }
  const falha = falhaDoGoogle(criado, 'criar evento');
  if (falha.tipo === 'tentar_de_novo' && falha.motivo === 'escopo_insuficiente') {
    await marcarErroNaConexao(config, conexao.id, 'escopo_insuficiente');
  }
  return falha;
}

async function apagarEvento(
  config: ConfigDoBanco,
  accessToken: string,
  calendarId: string,
  eventId: string,
  vinculoId: string | null,
): Promise<Resultado> {
  const resposta = await chamarGoogleAgenda(accessToken, { metodo: 'DELETE', caminho: caminhoDoEvento(calendarId, eventId) });
  if (!ok(resposta.status) && resposta.status !== 404 && resposta.status !== 410) {
    return falhaDoGoogle(resposta, 'apagar evento');
  }
  if (vinculoId) {
    await chamarBanco(config, {
      metodo: 'DELETE',
      caminho: '/rest/v1/agenda_item_links',
      query: { id: `eq.${vinculoId}` },
      prefer: 'return=minimal',
    });
  }
  return { tipo: 'concluir' };
}

async function processarLinha(config: ConfigDoBanco, contexto: { conexao: Conexao; accessToken: string }, linha: LinhaDaFila): Promise<Resultado> {
  if (linha.operacao === 'upsert') return exportarItem(config, contexto, linha);

  // delete: com o item ainda no banco (cancelado), vale o vínculo atual.
  const leitura = await lerItem(config, linha.agenda_item_id);
  if ('erro' in leitura) return { tipo: 'tentar_de_novo', motivo: 'banco_indisponivel' };
  if (leitura.item) return exportarItem(config, contexto, linha);
  if (!linha.calendar_id || !linha.external_id) return { tipo: 'concluir' };
  return apagarEvento(config, contexto.accessToken, linha.calendar_id, linha.external_id, null);
}

async function concluir(config: ConfigDoBanco, linha: LinhaDaFila, resultado: Resultado) {
  const parametros: Record<string, unknown> = { p_id: linha.id, p_versao: linha.versao, p_erro: resultado.motivo ?? null };
  if (resultado.tipo === 'tentar_de_novo' && linha.tentativas < MAXIMO_DE_TENTATIVAS) {
    parametros.p_tentar_de_novo_em = new Date(Date.now() + esperaAteATentativa(linha.tentativas)).toISOString();
  } else if (resultado.tipo === 'tentar_de_novo') {
    console.error('google-calendar-export: desistiu depois de', linha.tentativas, 'tentativas', resultado.motivo);
  }
  await chamarRpc(config, 'google_calendar_export_concluir', parametros);
}

async function exportacaoInicial(config: ConfigDoBanco) {
  const busca = await chamarBanco(config, {
    caminho: '/rest/v1/calendar_connections',
    query: {
      select: 'id,user_id,workspace_id',
      provider: 'eq.google',
      status: 'eq.active',
      exportacao_inicial_em: 'is.null',
      limit: String(CONEXOES_INICIAIS_POR_EXECUCAO),
    },
  });
  if (!ok(busca.status) || !Array.isArray(busca.json)) return 0;
  let enfileirados = 0;
  for (const conexao of busca.json as Conexao[]) {
    if (!(await membroAtivoDoEspaco(config, conexao.user_id, conexao.workspace_id))) continue;
    const resposta = await chamarRpc(config, 'google_calendar_export_inicial', { p_connection_id: conexao.id });
    if (ok(resposta.status) && typeof resposta.json === 'number') enfileirados += resposta.json;
  }
  return enfileirados;
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

  const enfileirados = await exportacaoInicial(config);

  const reserva = await chamarRpc(config, 'google_calendar_export_reservar', { p_limite: LIMITE_POR_EXECUCAO });
  if (!ok(reserva.status) || !Array.isArray(reserva.json)) {
    return jsonResponse(502, errorBody('QUEUE_UNAVAILABLE', 'Fila indisponível.'));
  }
  const linhas = reserva.json as LinhaDaFila[];

  // Uma conexão e um access token por pessoa e espaço nesta execução.
  const contextos = new Map<string, Contexto>();
  let concluidas = 0;
  let reagendadas = 0;

  for (const linha of linhas) {
    const chave = `${linha.user_id}:${linha.workspace_id}`;
    let contexto = contextos.get(chave);
    if (!contexto) {
      contexto = await prepararContexto(config, linha.user_id, linha.workspace_id);
      contextos.set(chave, contexto);
    }

    const resultado: Resultado = contexto.tipo === 'pronto'
      ? await processarLinha(config, contexto, linha)
      : contexto;

    await concluir(config, linha, resultado);
    if (resultado.tipo === 'concluir') concluidas += 1;
    else reagendadas += 1;
  }

  return jsonResponse(200, { exportacao_inicial: enfileirados, processadas: linhas.length, concluidas, reagendadas });
});
