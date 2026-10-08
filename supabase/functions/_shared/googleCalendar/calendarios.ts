// Atualiza calendar_connection_calendars a partir do calendarList do Google.
// Preserva sync_token, janela e channel_* (o upsert só grava as colunas da
// lista). Calendário que sumiu da conta sai da tabela.
//
// Usado pelo callback (#99) e uma vez por execução pelo sync (#101).

import { chamarGoogleAgenda } from './api.ts';
import { chamarBanco, ok } from './banco.ts';
import { montarCalendariosDaConexao } from './listaDeCalendarios.js';

export type ErroDaLista = 'google_indisponivel' | 'escopo_insuficiente' | 'conexao_revogada' | 'banco_indisponivel';

export interface ItemDaLista {
  id: string;
  description?: string;
  summary?: string;
  summaryOverride?: string;
  timeZone?: string;
  accessRole?: string;
  primary?: boolean;
  deleted?: boolean;
}

function erroDoGoogle(status: number): ErroDaLista {
  if (status === 401) return 'conexao_revogada';
  if (status === 403) return 'escopo_insuficiente';
  return 'google_indisponivel';
}

export async function listarCalendariosDoGoogle(accessToken: string): Promise<{ itens: ItemDaLista[] } | { erro: ErroDaLista }> {
  const itens: ItemDaLista[] = [];
  let pageToken: string | undefined;
  for (let pagina = 0; pagina < 20; pagina += 1) {
    const resposta = await chamarGoogleAgenda(accessToken, {
      caminho: '/users/me/calendarList',
      query: { maxResults: 250, pageToken },
    });
    if (resposta.status !== 200) return { erro: erroDoGoogle(resposta.status) };
    const lote = Array.isArray(resposta.json?.items) ? resposta.json.items : [];
    itens.push(...lote);
    pageToken = typeof resposta.json?.nextPageToken === 'string' ? resposta.json.nextPageToken : undefined;
    if (!pageToken) break;
  }
  return { itens };
}

export async function atualizarListaDeCalendarios({
  supabaseUrl,
  serviceRoleKey,
  connectionId,
  accessToken,
  appCalendarId = null,
  calendarioDoEspaco = null,
  itensDoGoogle = null,
}: {
  supabaseUrl: string;
  serviceRoleKey: string;
  connectionId: string;
  accessToken: string;
  appCalendarId?: string | null;
  // Calendário recém-criado, caso ainda não apareça no calendarList.
  calendarioDoEspaco?: ItemDaLista | null;
  // Lista já buscada nesta execução, para não chamar o Google duas vezes.
  itensDoGoogle?: ItemDaLista[] | null;
}) {
  const config = { supabaseUrl, serviceRoleKey };

  let itens: ItemDaLista[];
  if (itensDoGoogle) {
    itens = [...itensDoGoogle];
  } else {
    const lista = await listarCalendariosDoGoogle(accessToken);
    if ('erro' in lista) return { erro: lista.erro };
    itens = [...lista.itens];
  }
  if (calendarioDoEspaco && !itens.some((item) => item.id === calendarioDoEspaco.id)) {
    itens.push(calendarioDoEspaco);
  }

  const atuais = await chamarBanco(config, {
    caminho: '/rest/v1/calendar_connection_calendars',
    query: { select: 'external_calendar_id,is_read', connection_id: `eq.${connectionId}` },
  });
  if (!ok(atuais.status) || !Array.isArray(atuais.json)) return { erro: 'banco_indisponivel' as const };

  const { linhas, removidos } = montarCalendariosDaConexao({
    itens,
    existentes: atuais.json,
    appCalendarId,
  });

  if (linhas.length > 0) {
    const gravacao = await chamarBanco(config, {
      metodo: 'POST',
      caminho: '/rest/v1/calendar_connection_calendars',
      query: { on_conflict: 'connection_id,external_calendar_id' },
      corpo: linhas.map((linha) => ({ ...linha, connection_id: connectionId })),
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
    if (!ok(gravacao.status)) return { erro: 'banco_indisponivel' as const };
  }

  for (const externalCalendarId of removidos) {
    await chamarBanco(config, {
      metodo: 'DELETE',
      caminho: '/rest/v1/calendar_connection_calendars',
      query: { connection_id: `eq.${connectionId}`, external_calendar_id: `eq.${externalCalendarId}` },
      prefer: 'return=minimal',
    });
  }

  return { linhas, removidos };
}
