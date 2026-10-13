// Canais de webhook (events.watch) do Google Agenda (#101, épico #98).
//
// Cada calendário lido tem um canal: o Google avisa google-calendar-webhook a
// cada mudança, com X-Goog-Channel-ID e X-Goog-Channel-Token. O canal dura 7
// dias e é renovado quando faltam menos de 2 (sync-dispatch e sync-now).
// Calendário que deixou de ser lido perde o canal e o estado de sync.
//
// Nunca lança. O token do canal não vai para log.

import { chamarGoogleAgenda } from './api.ts';
import { chamarBanco, ok, type ConfigDoBanco } from './banco.ts';

export const DURACAO_DO_CANAL_S = 7 * 24 * 60 * 60;
export const RENOVAR_ANTES_MS = 2 * 24 * 60 * 60 * 1000;

export interface CalendarioComCanal {
  id: string;
  external_calendar_id: string;
  is_read: boolean;
  sync_token?: string | null;
  channel_id: string | null;
  channel_resource_id: string | null;
  channel_expires_at: string | null;
}

export function enderecoDoWebhook(supabaseUrl: string) {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/google-calendar-webhook`;
}

export function canalPrecisaRenovar(calendario: CalendarioComCanal, agora = Date.now()) {
  if (!calendario.channel_id || !calendario.channel_resource_id || !calendario.channel_expires_at) return true;
  const expira = Date.parse(calendario.channel_expires_at);
  return Number.isNaN(expira) || expira - agora < RENOVAR_ANTES_MS;
}

function tokenAleatorio() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function pararCanal(accessToken: string, canal: { channel_id: string | null; channel_resource_id: string | null }) {
  if (!canal.channel_id || !canal.channel_resource_id) return true;
  const resposta = await chamarGoogleAgenda(accessToken, {
    metodo: 'POST',
    caminho: '/channels/stop',
    corpo: { id: canal.channel_id, resourceId: canal.channel_resource_id },
  });
  // 404: o canal já venceu ou já foi parado.
  return ok(resposta.status) || resposta.status === 404;
}

// Cria um canal novo quando não há ou quando o atual vence em menos de 2
// dias. A gravação só vale se o canal da linha ainda é o que foi lido: numa
// corrida entre duas execuções, o canal que perdeu é parado no Google.
export async function garantirCanal({
  config,
  accessToken,
  calendario,
  agora = Date.now(),
}: {
  config: ConfigDoBanco;
  accessToken: string;
  calendario: CalendarioComCanal;
  agora?: number;
}): Promise<'mantido' | 'criado' | 'erro'> {
  if (!canalPrecisaRenovar(calendario, agora)) return 'mantido';

  const canalNovo = { id: crypto.randomUUID(), token: tokenAleatorio() };
  const resposta = await chamarGoogleAgenda(accessToken, {
    metodo: 'POST',
    caminho: `/calendars/${encodeURIComponent(calendario.external_calendar_id)}/events/watch`,
    corpo: {
      id: canalNovo.id,
      type: 'web_hook',
      address: enderecoDoWebhook(config.supabaseUrl),
      token: canalNovo.token,
      params: { ttl: String(DURACAO_DO_CANAL_S) },
    },
  });
  const resourceId = typeof resposta.json?.resourceId === 'string' ? resposta.json.resourceId : null;
  if (resposta.status !== 200 || !resourceId) {
    console.error('google-calendar: falha ao criar o canal', resposta.status);
    return 'erro';
  }
  const expiracao = Number(resposta.json?.expiration);
  const expiraEm = Number.isFinite(expiracao) && expiracao > 0
    ? new Date(expiracao).toISOString()
    : new Date(agora + DURACAO_DO_CANAL_S * 1000).toISOString();

  const gravacao = await chamarBanco(config, {
    metodo: 'PATCH',
    caminho: '/rest/v1/calendar_connection_calendars',
    query: {
      id: `eq.${calendario.id}`,
      channel_id: calendario.channel_id ? `eq.${calendario.channel_id}` : 'is.null',
      select: 'id',
    },
    corpo: {
      channel_id: canalNovo.id,
      channel_resource_id: resourceId,
      channel_token: canalNovo.token,
      channel_expires_at: expiraEm,
    },
    prefer: 'return=representation',
  });
  const gravou = ok(gravacao.status) && Array.isArray(gravacao.json) && gravacao.json.length === 1;
  if (!gravou) {
    await pararCanal(accessToken, { channel_id: canalNovo.id, channel_resource_id: resourceId });
    return 'erro';
  }

  await pararCanal(accessToken, calendario);
  return 'criado';
}

// Calendário que a pessoa deixou de ler: para o canal e limpa o estado de
// sync. Se voltar a ser lido, começa com um sync completo da janela.
export async function encerrarLeitura({
  config,
  accessToken,
  calendario,
}: {
  config: ConfigDoBanco;
  accessToken: string;
  calendario: CalendarioComCanal;
}) {
  await pararCanal(accessToken, calendario);
  const limpeza = await chamarBanco(config, {
    metodo: 'PATCH',
    caminho: '/rest/v1/calendar_connection_calendars',
    query: { id: `eq.${calendario.id}`, is_read: 'eq.false' },
    corpo: {
      channel_id: null,
      channel_resource_id: null,
      channel_token: null,
      channel_expires_at: null,
      sync_token: null,
      sync_window_start: null,
      sync_window_end: null,
    },
    prefer: 'return=minimal',
  });
  return ok(limpeza.status);
}

// Comparação em tempo constante do token do canal.
export function mesmoToken(esperado: string | null | undefined, recebido: string | null | undefined) {
  if (typeof esperado !== 'string' || typeof recebido !== 'string' || !esperado) return false;
  const a = new TextEncoder().encode(esperado);
  const b = new TextEncoder().encode(recebido);
  let diferenca = a.length ^ b.length;
  for (let indice = 0; indice < a.length; indice += 1) diferenca |= a[indice] ^ (b[indice] ?? 0);
  return diferenca === 0;
}
