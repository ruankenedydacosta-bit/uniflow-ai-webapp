import assert from 'node:assert/strict';
import test from 'node:test';

import { ESQUEMA } from '../../../supabase/functions/_shared/uniInterpret/contrato.js';
import {
  interpretarComAnthropic,
  interpretarComOpenAi,
} from '../../../supabase/functions/_shared/uniInterpret/provedores.js';

const BRUTA = { intent: 'conversa', operacoes: [], resposta: 'Bom dia!' };
const ENTRADA = { modelo: 'modelo-teste', instrucoes: 'INSTRUCOES', mensagem: 'MENSAGEM' };

function clienteAnthropic(resposta) {
  const chamadas = [];
  return {
    chamadas,
    messages: {
      async create(corpo, opcoes) {
        chamadas.push({ corpo, opcoes });
        if (resposta instanceof Error) throw resposta;
        return resposta;
      },
    },
  };
}

function respostaAnthropic(campos = {}) {
  return {
    model: 'modelo-teste',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(BRUTA) }],
    usage: { input_tokens: 900, output_tokens: 40, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 },
    ...campos,
  };
}

function erroComStatus(status) {
  return Object.assign(new Error(`status ${status}`), { status });
}

test('Anthropic: envia schema fixo em output_config, system com cache e devolve o JSON', async () => {
  const cliente = clienteAnthropic(respostaAnthropic());
  const resultado = await interpretarComAnthropic({ cliente, ...ENTRADA });

  assert.deepEqual(resultado, {
    ok: true,
    bruta: BRUTA,
    modelo: 'modelo-teste',
    uso: { entrada: 1000, saida: 40, cacheLeitura: 100 },
  });
  const { corpo } = cliente.chamadas[0];
  assert.deepEqual(corpo.output_config, { format: { type: 'json_schema', schema: ESQUEMA } });
  assert.deepEqual(corpo.system, [{ type: 'text', text: 'INSTRUCOES', cache_control: { type: 'ephemeral' } }]);
  assert.deepEqual(corpo.messages, [{ role: 'user', content: 'MENSAGEM' }]);
});

test('Anthropic: recusa, resposta cortada e JSON inválido viram falha sem lançar', async () => {
  const casos = [
    [respostaAnthropic({ stop_reason: 'refusal' }), 'recusa'],
    [respostaAnthropic({ stop_reason: 'max_tokens' }), 'cortada'],
    [respostaAnthropic({ content: [{ type: 'text', text: '{"intent":' }] }), 'json_invalido'],
  ];
  for (const [resposta, motivo] of casos) {
    const resultado = await interpretarComAnthropic({ cliente: clienteAnthropic(resposta), ...ENTRADA });
    assert.equal(resultado.ok, false);
    assert.equal(resultado.motivo, motivo);
  }
});

test('Anthropic: erros HTTP e de conexão viram motivos conhecidos', async () => {
  const casos = [
    [erroComStatus(401), 'chave_invalida'],
    [erroComStatus(429), 'limite'],
    [erroComStatus(529), 'provedor'],
    [Object.assign(new Error('abortado'), { name: 'APIUserAbortError' }), 'tempo_esgotado'],
    [new Error('ECONNRESET'), 'rede'],
  ];
  for (const [erro, motivo] of casos) {
    const resultado = await interpretarComAnthropic({ cliente: clienteAnthropic(erro), ...ENTRADA });
    assert.equal(resultado.motivo, motivo, erro.message);
  }
});

function fetchFalso(status, corpo) {
  const chamadas = [];
  const fetchImpl = async (url, init) => {
    chamadas.push({ url, init });
    if (corpo instanceof Error) throw corpo;
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => (typeof corpo === 'string' ? JSON.parse(corpo) : corpo),
    };
  };
  return { fetchImpl, chamadas };
}

function respostaOpenAi(mensagem = {}, finishReason = 'stop') {
  return {
    model: 'modelo-teste',
    choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(BRUTA), refusal: null, ...mensagem } }],
    usage: { prompt_tokens: 950, completion_tokens: 35, prompt_tokens_details: { cached_tokens: 0 } },
  };
}

test('OpenAI: envia json_schema strict com o schema fixo e devolve o JSON', async () => {
  const { fetchImpl, chamadas } = fetchFalso(200, respostaOpenAi());
  const resultado = await interpretarComOpenAi({ fetchImpl, chave: 'sk-teste', ...ENTRADA });

  assert.deepEqual(resultado, {
    ok: true,
    bruta: BRUTA,
    modelo: 'modelo-teste',
    uso: { entrada: 950, saida: 35, cacheLeitura: 0 },
  });
  const corpo = JSON.parse(chamadas[0].init.body);
  assert.deepEqual(corpo.response_format, {
    type: 'json_schema',
    json_schema: { name: 'uni_interpretacao', strict: true, schema: ESQUEMA },
  });
  assert.deepEqual(corpo.messages, [
    { role: 'developer', content: 'INSTRUCOES' },
    { role: 'user', content: 'MENSAGEM' },
  ]);
  assert.equal(chamadas[0].init.headers.Authorization, 'Bearer sk-teste');
});

test('OpenAI: temperatura null omite o parâmetro; o padrão continua 0', async () => {
  const padrao = fetchFalso(200, respostaOpenAi());
  await interpretarComOpenAi({ fetchImpl: padrao.fetchImpl, chave: 'sk-teste', ...ENTRADA });
  assert.equal(JSON.parse(padrao.chamadas[0].init.body).temperature, 0);

  const omitida = fetchFalso(200, respostaOpenAi());
  await interpretarComOpenAi({ fetchImpl: omitida.fetchImpl, chave: 'sk-teste', temperatura: null, ...ENTRADA });
  assert.equal('temperature' in JSON.parse(omitida.chamadas[0].init.body), false);
});

test('OpenAI: erro 400 traz o código do provedor', async () => {
  const { fetchImpl } = fetchFalso(400, { error: { code: 'unsupported_value' } });
  const resultado = await interpretarComOpenAi({ fetchImpl, chave: 'sk-teste', ...ENTRADA });
  assert.deepEqual([resultado.motivo, resultado.status, resultado.codigo], ['provedor', 400, 'unsupported_value']);
});

test('OpenAI: recusa, corte e erros HTTP viram motivos conhecidos', async () => {
  const casos = [
    [fetchFalso(200, respostaOpenAi({ refusal: 'não posso' })), 'recusa'],
    [fetchFalso(200, respostaOpenAi({}, 'length')), 'cortada'],
    [fetchFalso(200, respostaOpenAi({ content: 'texto solto' })), 'json_invalido'],
    [fetchFalso(401, {}), 'chave_invalida'],
    [fetchFalso(429, { error: { code: 'insufficient_quota' } }), 'sem_cota'],
    [fetchFalso(429, { error: { code: 'rate_limit_exceeded' } }), 'limite'],
    [fetchFalso(500, {}), 'provedor'],
    [fetchFalso(0, Object.assign(new Error('timeout'), { name: 'AbortError' })), 'tempo_esgotado'],
  ];
  for (const [{ fetchImpl }, motivo] of casos) {
    const resultado = await interpretarComOpenAi({ fetchImpl, chave: 'sk-teste', ...ENTRADA });
    assert.equal(resultado.ok, false, motivo);
    assert.equal(resultado.motivo, motivo);
  }
});
