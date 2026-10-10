// Fluxo da uni-insights (#122), sem Deno nem rede: o index.ts injeta quem
// reserva a geração (teto diário e mensal) e quem chama o modelo. Assim o
// fluxo inteiro roda no node --test.

import { ESQUEMA, lerPedido } from './contrato.js';
import { INSTRUCOES, montarMensagem } from './prompt.js';
import { validarLeituras } from './validacao.js';

// O Haiku 5.5 pensa antes de responder, e o pensamento conta em max_tokens.
export const MAX_TOKENS_SAIDA = 2048;
// Escrever três frases a partir de números prontos não pede raciocínio longo.
export const ESFORCO = 'low';

// Motivo → status HTTP. O app trata qualquer falha como "IA indisponível" e
// mostra a leitura calculada. 429 avisa que não adianta tentar de novo hoje.
const STATUS_POR_MOTIVO = {
  invalido: 400,
  limite: 429,
  sem_cota: 503,
  chave_invalida: 503,
  tempo_esgotado: 504,
  recusa: 502,
  cortada: 502,
  json_invalido: 502,
  provedor: 502,
  rede: 502,
  sem_leitura: 502,
};

function falha(motivo, metrica = {}) {
  return { status: STATUS_POR_MOTIVO[motivo] ?? 502, corpo: { error: 'A Uni não conseguiu escrever a leitura agora.', motivo }, metrica: { motivo, ...metrica } };
}

function lerJson(texto) {
  try {
    return { ok: true, valor: JSON.parse(texto) };
  } catch {
    return { ok: false };
  }
}

// Claude Messages API com saída estruturada. As instruções vão com
// cache_control: passam do mínimo cacheável do Haiku 5.5 (512 tokens).
export async function gerarComAnthropic({ cliente, modelo, instrucoes, mensagem, sinal }) {
  let resposta;
  try {
    resposta = await cliente.messages.create({
      model: modelo,
      max_tokens: MAX_TOKENS_SAIDA,
      system: [{ type: 'text', text: instrucoes, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: mensagem }],
      output_config: { effort: ESFORCO, format: { type: 'json_schema', schema: ESQUEMA } },
    }, { signal: sinal, maxRetries: 0 });
  } catch (erro) {
    const status = typeof erro?.status === 'number' ? erro.status : null;
    if (status === 401) return { ok: false, motivo: 'chave_invalida', status };
    if (status) return { ok: false, motivo: 'provedor', status };
    const nomes = ['TimeoutError', 'AbortError', 'APIUserAbortError', 'APIConnectionTimeoutError'];
    return { ok: false, motivo: nomes.includes(erro?.name) ? 'tempo_esgotado' : 'rede' };
  }

  // Entrada em "tokens a preço cheio": leitura do cache custa 0,1x e escrita
  // no cache de 5 minutos 1,25x. Somar tudo a preço cheio cobraria do teto
  // mensal (o mesmo da conversa) mais do que a leitura custou.
  const cacheLeitura = resposta.usage?.cache_read_input_tokens ?? 0;
  const cacheEscrita = resposta.usage?.cache_creation_input_tokens ?? 0;
  const uso = {
    entrada: Math.ceil((resposta.usage?.input_tokens ?? 0) + cacheEscrita * 1.25 + cacheLeitura * 0.1),
    saida: resposta.usage?.output_tokens ?? 0,
    cacheLeitura,
  };
  // Recusa e corte também custam: o uso volta para entrar no teto mensal.
  if (resposta.stop_reason === 'refusal') return { ok: false, motivo: 'recusa', uso };
  if (resposta.stop_reason === 'max_tokens') return { ok: false, motivo: 'cortada', uso };

  const texto = resposta.content.find((bloco) => bloco.type === 'text')?.text ?? '';
  const json = lerJson(texto);
  if (!json.ok) return { ok: false, motivo: 'json_invalido', uso };
  return { ok: true, bruta: json.valor, modelo: resposta.model ?? modelo, uso };
}

/**
 * corpo: o JSON do pedido. reservar(): 'liberada' | 'limite' | 'sem_cota',
 * chamado só com pedido válido, para pedido ruim não gastar o teto.
 * chamarModelo({ instrucoes, mensagem }): resultado de gerarComAnthropic.
 */
export async function escreverLeituras({ corpo, reservar, chamarModelo }) {
  const pedido = lerPedido(corpo);
  if (!pedido.ok) return falha('invalido');

  const reserva = await reservar();
  if (reserva !== 'liberada') return falha(reserva === 'limite' ? 'limite' : 'sem_cota');

  const { mensagem, permitidos } = montarMensagem(pedido.fatos);
  const inicio = Date.now();
  const chamada = await chamarModelo({ instrucoes: INSTRUCOES, mensagem });
  const metrica = { duracaoMs: Date.now() - inicio, tokens: chamada.uso ?? null };
  if (!chamada.ok) return falha(chamada.motivo, metrica);

  const { leituras, descartes } = validarLeituras(chamada.bruta, {
    permitidos,
    idsDeCategorias: new Set(pedido.fatos.categorias.map((categoria) => categoria.id)),
    nomesDeCategorias: pedido.fatos.categorias.map((categoria) => categoria.nome),
  });
  if (leituras.length === 0) return falha('sem_leitura', { ...metrica, descartes });

  return {
    status: 200,
    corpo: { leituras },
    metrica: { motivo: 'ok', ...metrica, modelo: chamada.modelo, leituras: leituras.length, descartes },
  };
}
