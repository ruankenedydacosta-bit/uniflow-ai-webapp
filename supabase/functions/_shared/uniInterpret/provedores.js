// Adaptadores de provedor do uni-interpret (épico #104, F1). Os dois devolvem
// o mesmo formato, para que a Edge Function e o script de avaliação troquem de
// modelo sem mudar mais nada:
//   { ok: true, bruta, uso, modelo }  ou  { ok: false, motivo, status, modelo }
// uso: { entrada, saida, cacheLeitura } em tokens.
// motivo: 'chave_invalida' | 'limite' | 'sem_cota' | 'recusa' | 'cortada' |
//   'json_invalido' | 'provedor' | 'tempo_esgotado' | 'rede'.
//
// Nenhum dos dois importa SDK ou lê variável de ambiente: o chamador injeta o
// cliente da Anthropic (npm: no Deno, pacote no Node) e o fetch/chave da OpenAI.

import { ESQUEMA } from './contrato.js';

export const MAX_TOKENS_SAIDA = 1024;
const NOME_ESQUEMA = 'uni_interpretacao';

function lerJson(texto) {
  try {
    return { ok: true, valor: JSON.parse(texto) };
  } catch {
    return { ok: false };
  }
}

function falha(motivo, modelo, status = null) {
  return { ok: false, motivo, status, modelo };
}

function motivoDoErro(erro) {
  if (erro?.name === 'AbortError' || erro?.name === 'APIUserAbortError' || erro?.name === 'APIConnectionTimeoutError') {
    return 'tempo_esgotado';
  }
  return 'rede';
}

// Claude Messages API com saída estruturada (output_config.format). O system
// é fixo e vai com cache_control: hoje ele fica abaixo do mínimo cacheável do
// Haiku e não cacheia, mas passa a cachear sozinho se crescer.
export async function interpretarComAnthropic({ cliente, modelo, instrucoes, mensagem, sinal }) {
  let resposta;
  try {
    resposta = await cliente.messages.create({
      model: modelo,
      max_tokens: MAX_TOKENS_SAIDA,
      temperature: 0,
      system: [{ type: 'text', text: instrucoes, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: mensagem }],
      output_config: { format: { type: 'json_schema', schema: ESQUEMA } },
    }, { signal: sinal, maxRetries: 1 });
  } catch (erro) {
    const status = typeof erro?.status === 'number' ? erro.status : null;
    if (status === 401) return falha('chave_invalida', modelo, status);
    if (status === 429) return falha('limite', modelo, status);
    if (status) return falha('provedor', modelo, status);
    return falha(motivoDoErro(erro), modelo);
  }

  if (resposta.stop_reason === 'refusal') return falha('recusa', modelo);
  if (resposta.stop_reason === 'max_tokens') return falha('cortada', modelo);

  const texto = resposta.content.find((bloco) => bloco.type === 'text')?.text ?? '';
  const json = lerJson(texto);
  if (!json.ok) return falha('json_invalido', modelo);

  return {
    ok: true,
    bruta: json.valor,
    modelo: resposta.model ?? modelo,
    uso: {
      entrada: (resposta.usage?.input_tokens ?? 0) + (resposta.usage?.cache_read_input_tokens ?? 0)
        + (resposta.usage?.cache_creation_input_tokens ?? 0),
      saida: resposta.usage?.output_tokens ?? 0,
      cacheLeitura: resposta.usage?.cache_read_input_tokens ?? 0,
    },
  };
}

// OpenAI Chat Completions com response_format json_schema strict, no mesmo
// estilo do callOpenAiAdapter do uni-chat-llm (fetch direto, papel developer).
export async function interpretarComOpenAi({ fetchImpl = globalThis.fetch, chave, modelo, instrucoes, mensagem, sinal }) {
  let resposta;
  try {
    resposta = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelo,
        max_completion_tokens: MAX_TOKENS_SAIDA,
        temperature: 0,
        response_format: {
          type: 'json_schema',
          json_schema: { name: NOME_ESQUEMA, strict: true, schema: ESQUEMA },
        },
        messages: [
          { role: 'developer', content: instrucoes },
          { role: 'user', content: mensagem },
        ],
      }),
      signal: sinal,
    });
  } catch (erro) {
    return falha(motivoDoErro(erro), modelo);
  }

  if (resposta.status === 401) return falha('chave_invalida', modelo, 401);
  if (resposta.status === 429) {
    let codigo = '';
    try {
      codigo = (await resposta.json())?.error?.code ?? '';
    } catch { /* corpo de erro sem JSON: trata como limite genérico */ }
    return falha(codigo === 'insufficient_quota' ? 'sem_cota' : 'limite', modelo, 429);
  }
  if (!resposta.ok) return falha('provedor', modelo, resposta.status);

  let corpo;
  try {
    corpo = await resposta.json();
  } catch {
    return falha('json_invalido', modelo);
  }

  const escolha = corpo?.choices?.[0];
  if (escolha?.message?.refusal) return falha('recusa', modelo);
  if (escolha?.finish_reason === 'length') return falha('cortada', modelo);

  const json = lerJson(escolha?.message?.content ?? '');
  if (!json.ok) return falha('json_invalido', modelo);

  return {
    ok: true,
    bruta: json.valor,
    modelo: corpo.model ?? modelo,
    uso: {
      entrada: corpo.usage?.prompt_tokens ?? 0,
      saida: corpo.usage?.completion_tokens ?? 0,
      cacheLeitura: corpo.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    },
  };
}
