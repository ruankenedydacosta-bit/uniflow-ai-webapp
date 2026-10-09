// Chamada à API do Google Agenda (Calendar API v3). Contrato do épico #98:
// chamarGoogleAgenda(accessToken, {metodo, caminho, query?, corpo?, cabecalhos?})
// -> {status, json, etag}. Nunca lança: falha de rede volta com status 0.
//
// `caminho` é relativo a /calendar/v3 e já vem com os ids codificados, por
// exemplo `/calendars/${encodeURIComponent(id)}/events`.

import { faltouEscopo, motivosDoErroDoGoogle } from './escopos.js';

export const GOOGLE_AGENDA_API_URL = 'https://www.googleapis.com/calendar/v3';

export interface PedidoGoogleAgenda {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  caminho: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  corpo?: unknown;
  cabecalhos?: Record<string, string>;
}

export interface RespostaGoogleAgenda {
  status: number;
  json: any;
  etag: string | null;
  wwwAuthenticate: string | null;
}

export async function chamarGoogleAgenda(
  accessToken: string,
  { metodo = 'GET', caminho, query, corpo, cabecalhos }: PedidoGoogleAgenda,
): Promise<RespostaGoogleAgenda> {
  const url = new URL(`${GOOGLE_AGENDA_API_URL}${caminho}`);
  for (const [chave, valor] of Object.entries(query ?? {})) {
    if (valor !== undefined && valor !== null) url.searchParams.set(chave, String(valor));
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    ...(cabecalhos ?? {}),
  };
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';

  try {
    const response = await fetch(url, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const texto = await response.text();
    let json: any = null;
    if (texto) {
      try {
        json = JSON.parse(texto);
      } catch {
        json = null;
      }
    }
    const etag = response.headers.get('ETag') ?? (typeof json?.etag === 'string' ? json.etag : null);
    return { status: response.status, json, etag, wwwAuthenticate: response.headers.get('WWW-Authenticate') };
  } catch {
    return { status: 0, json: null, etag: null, wwwAuthenticate: null };
  }
}

// Registra no log o status e os motivos de uma resposta de erro do Google e
// diz se o erro foi falta de escopo, o único 403 que pede para conectar de
// novo. Todo tratamento de 403 da Calendar API passa por aqui.
export function registrarFalhaDoGoogle(onde: string, resposta: RespostaGoogleAgenda): boolean {
  const motivos = motivosDoErroDoGoogle(resposta.json).join(',') || null;
  console.error(`${onde}: Google respondeu`, resposta.status, motivos);
  return faltouEscopo(resposta.status, resposta.json, resposta.wwwAuthenticate);
}
