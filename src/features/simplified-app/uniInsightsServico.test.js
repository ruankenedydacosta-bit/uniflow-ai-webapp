// #122: fluxo da Edge Function uni-insights sem rede. O index.ts só injeta o
// cliente da Anthropic e a reserva da cota.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ESQUEMA, LIMITE_DIARIO, lerPedido } from '../../../supabase/functions/_shared/uniInsights/contrato.js';
import { INSTRUCOES, montarMensagem } from '../../../supabase/functions/_shared/uniInsights/prompt.js';
import { escreverLeituras, gerarComAnthropic } from '../../../supabase/functions/_shared/uniInsights/servico.js';
import { extrairValores, validarLeituras } from '../../../supabase/functions/_shared/uniInsights/validacao.js';
import { custoEmReais, reservarLeitura } from '../../../supabase/functions/_shared/uniLlmCota.js';

const LAZER = '11111111-1111-4111-8111-111111111111';
const ALIM = '22222222-2222-4222-8222-222222222222';

function corpoValido() {
  return {
    fatos: {
      periodo: {
        mesAtual: 'outubro',
        mesAnterior: 'setembro',
        rotuloAtual: 'de 1 a 8 de outubro',
        rotuloAnterior: 'de 1 a 8 de setembro',
        dia: 8,
        diasNoMes: 31,
      },
      saidasDoMes: 1156,
      categorias: [
        { id: LAZER, nome: 'Lazer', gasto: 344, gastoAnterior: 230, media: 0, orcamento: { valor: 400, origem: 'teto' } },
        { id: ALIM, nome: 'Alimentação', gasto: 812, gastoAnterior: 952, media: 1000, orcamento: { valor: 1000, origem: 'media' } },
      ],
    },
  };
}

function respostaDoModelo(leituras, extra = {}) {
  return {
    stop_reason: 'end_turn',
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text: JSON.stringify({ leituras }) }],
    usage: { input_tokens: 300, output_tokens: 120, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
    ...extra,
  };
}

test('lerPedido limpa nomes, descarta categoria inválida e recusa pedido sem categoria', () => {
  const corpo = corpoValido();
  corpo.fatos.categorias.push(
    { id: 'nao-e-uuid', nome: 'X', gasto: 1, gastoAnterior: 0, media: 0 },
    { id: '33333333-3333-4333-8333-333333333333', nome: 'Y', gasto: -5, gastoAnterior: 0, media: 0 },
  );
  corpo.fatos.categorias[0].nome = `Lazer\n${'a'.repeat(200)}`;

  const pedido = lerPedido(corpo);

  assert.equal(pedido.ok, true);
  assert.equal(pedido.fatos.categorias.length, 2);
  assert.equal(pedido.fatos.categorias[0].nome.length, 60);
  assert.doesNotMatch(pedido.fatos.categorias[0].nome, /\n/);
  assert.equal(lerPedido({ fatos: { ...corpoValido().fatos, categorias: [] } }).ok, false);
  assert.equal(lerPedido({ fatos: { ...corpoValido().fatos, periodo: {} } }).ok, false);
  assert.equal(lerPedido(null).ok, false);
});

test('montarMensagem escreve os valores e devolve a lista que o modelo pode citar', () => {
  const { fatos } = lerPedido(corpoValido());
  const { mensagem, permitidos } = montarMensagem(fatos);
  const dados = JSON.parse(mensagem);
  const lazer = dados.categorias.find((categoria) => categoria.nome === 'Lazer');

  assert.equal(dados.periodo.hoje, 'dia 8 de 31');
  assert.equal(lazer.gasto, 'R$ 344,00');
  assert.equal(lazer.usoDoOrcamento, '86%');
  assert.equal(lazer.restante, 'R$ 56,00');
  assert.equal(lazer.diferencaParaMesAnterior, 'R$ 114,00 a mais');
  for (const valor of ['R$ 344,00', 'R$ 56,00', '86%', 'R$ 1.156,00', '70%']) {
    assert.ok(permitidos.has(valor), valor);
  }
  // Só números agregados: nada de descrição de lançamento.
  assert.doesNotMatch(mensagem, /descri/i);
});

test('instruções passam do mínimo cacheável e o esquema fecha os campos', () => {
  // ~4 caracteres por token: 512 tokens pedem mais de 2.000 caracteres.
  assert.ok(INSTRUCOES.length > 2400);
  assert.equal(ESQUEMA.additionalProperties, false);
  assert.equal(ESQUEMA.properties.leituras.items.additionalProperties, false);
  assert.equal(LIMITE_DIARIO, 10);
});

test('extrairValores acha reais e porcentagens com ou sem espaço', () => {
  assert.deepEqual(extrairValores('Restam R$56,00 e R$ 1.156,00, 86% e 12 %.'), ['R$ 56,00', 'R$ 1.156,00', '86%', '12%']);
});

test('validarLeituras descarta valor inventado, categoria estranha, repetida e texto longo', () => {
  const permitidos = new Set(['R$ 56,00', '86%']);
  const idsDeCategorias = new Set([LAZER]);
  const { leituras, descartes } = validarLeituras({
    leituras: [
      { tipo: 'atencao', categoriaId: LAZER, titulo: 'Você já usou 86% do orçamento de Lazer.', detalhe: 'Restam R$ 56,00 até o fim do mês.' },
      { tipo: 'alerta', categoriaId: LAZER, titulo: 'Lazer de novo, agora repetido.', detalhe: '' },
      { tipo: 'informacao', categoriaId: '', titulo: 'Você gastou R$ 900,00 no mês.', detalhe: '' },
      { tipo: 'elogio', categoriaId: ALIM, titulo: 'Alimentação está sob controle.', detalhe: '' },
      { tipo: 'outro', categoriaId: '', titulo: 'Tipo que não existe aqui.', detalhe: '' },
      { tipo: 'elogio', categoriaId: '', titulo: 'x'.repeat(200), detalhe: '' },
      { tipo: 'elogio', categoriaId: '', titulo: 'Até agora você tem ido muito bem.', detalhe: 'Continue assim.' },
    ],
  }, { permitidos, idsDeCategorias });

  assert.deepEqual(leituras.map((leitura) => leitura.tipo), ['atencao', 'elogio']);
  assert.equal(leituras[1].categoriaId, null);
  assert.deepEqual(descartes, ['repetida', 'valor', 'categoria', 'tipo', 'tamanho']);
});

test('validarLeituras recusa valor escrito sem "R$" e aceita dia e contagem', () => {
  const permitidos = new Set(['R$ 56,00', '86%']);
  const idsDeCategorias = new Set();
  const validar = (titulo) => validarLeituras(
    { leituras: [{ tipo: 'informacao', categoriaId: '', titulo, detalhe: '' }] },
    { permitidos, idsDeCategorias },
  ).leituras.length;

  assert.equal(validar('Você gastou 812 reais a mais em Lazer.'), 0);
  assert.equal(validar('Você gastou 812,00 a mais em Lazer.'), 0);
  assert.equal(validar('Você gastou 812 a mais em Lazer.'), 0);
  assert.equal(validar('No dia 8 de 31, você está bem em 3 de 4 categorias.'), 1);
  assert.equal(validar('Restam R$56,00, e você já usou 86% do orçamento.'), 1);
  const comNome = validarLeituras(
    { leituras: [{ tipo: 'informacao', categoriaId: '', titulo: 'Carro 2020 está dentro do orçamento.', detalhe: '' }] },
    { permitidos, idsDeCategorias, nomesDeCategorias: ['Carro 2020'] },
  );
  assert.equal(comNome.leituras.length, 1);
});

test('escreverLeituras: pedido inválido não reserva cota nem chama o modelo', async () => {
  let reservou = false;
  const resultado = await escreverLeituras({
    corpo: { fatos: {} },
    reservar: async () => { reservou = true; return 'liberada'; },
    chamarModelo: async () => assert.fail('não deveria chamar'),
  });
  assert.equal(resultado.status, 400);
  assert.equal(reservou, false);
});

test('escreverLeituras: teto atingido devolve 429 sem chamar o modelo', async () => {
  const resultado = await escreverLeituras({
    corpo: corpoValido(),
    reservar: async () => 'limite',
    chamarModelo: async () => assert.fail('não deveria chamar'),
  });
  assert.equal(resultado.status, 429);
  assert.equal(resultado.corpo.motivo, 'limite');
});

test('escreverLeituras devolve só as leituras válidas', async () => {
  const resultado = await escreverLeituras({
    corpo: corpoValido(),
    reservar: async () => 'liberada',
    chamarModelo: async ({ instrucoes, mensagem }) => {
      assert.equal(instrucoes, INSTRUCOES);
      assert.match(mensagem, /Lazer/);
      return {
        ok: true,
        modelo: 'claude-haiku-5-5',
        uso: { entrada: 1200, saida: 120 },
        bruta: { leituras: [
          { tipo: 'atencao', categoriaId: LAZER, titulo: 'Você já usou 86% do orçamento de Lazer.', detalhe: 'Restam R$ 56,00 até o fim do mês. Melhor segurar um pouco.' },
          { tipo: 'informacao', categoriaId: ALIM, titulo: 'Você gastou R$ 812,00 com Alimentação.', detalhe: 'Isso é R$ 999,00 a menos.' },
        ] },
      };
    },
  });

  assert.equal(resultado.status, 200);
  assert.equal(resultado.corpo.leituras.length, 1);
  assert.deepEqual(resultado.metrica.descartes, ['valor']);
});

test('escreverLeituras: sem nenhuma leitura válida devolve 502', async () => {
  const resultado = await escreverLeituras({
    corpo: corpoValido(),
    reservar: async () => 'liberada',
    chamarModelo: async () => ({ ok: true, bruta: { leituras: [] }, uso: { entrada: 1, saida: 1 } }),
  });
  assert.equal(resultado.status, 502);
  assert.equal(resultado.corpo.motivo, 'sem_leitura');
});

test('gerarComAnthropic manda modelo, esforço baixo, esquema e cache nas instruções', async () => {
  let pedido;
  const cliente = { messages: { create: async (corpo) => { pedido = corpo; return respostaDoModelo([]); } } };
  const resultado = await gerarComAnthropic({ cliente, modelo: 'claude-haiku-5-5', instrucoes: 'I', mensagem: 'M' });

  assert.equal(resultado.ok, true);
  assert.equal(pedido.model, 'claude-haiku-5-5');
  assert.equal(pedido.output_config.effort, 'low');
  assert.equal(pedido.output_config.format.type, 'json_schema');
  assert.deepEqual(pedido.system[0].cache_control, { type: 'ephemeral' });
  assert.equal(pedido.thinking, undefined);
  // 300 de entrada + 900 lidos do cache a 0,1x.
  assert.equal(resultado.uso.entrada, 390);
});

test('gerarComAnthropic separa recusa, corte, JSON inválido, chave e tempo esgotado', async () => {
  const comResposta = (resposta) => ({ messages: { create: async () => resposta } });
  const comErro = (erro) => ({ messages: { create: async () => { throw erro; } } });
  const chamar = (cliente) => gerarComAnthropic({ cliente, modelo: 'claude-haiku-5-5', instrucoes: 'I', mensagem: 'M' });

  const recusa = await chamar(comResposta(respostaDoModelo([], { stop_reason: 'refusal' })));
  assert.equal(recusa.motivo, 'recusa');
  assert.ok(recusa.uso, 'recusa também custa');
  assert.equal((await chamar(comResposta(respostaDoModelo([], { stop_reason: 'max_tokens' })))).motivo, 'cortada');
  assert.equal((await chamar(comResposta({ ...respostaDoModelo([]), content: [{ type: 'text', text: '{' }] }))).motivo, 'json_invalido');
  assert.equal((await chamar(comErro(Object.assign(new Error('x'), { status: 401 })))).motivo, 'chave_invalida');
  assert.equal((await chamar(comErro(Object.assign(new Error('x'), { name: 'TimeoutError' })))).motivo, 'tempo_esgotado');
});

test('reservarLeitura chama a RPC com o limite diário e falha fechado', async () => {
  let chamada;
  const fetchImpl = async (url, opcoes) => {
    chamada = { url, corpo: JSON.parse(opcoes.body) };
    return { ok: true, json: async () => [{ allowed: false, reason: 'daily_limit', insight_calls: 10 }] };
  };
  const argumentos = { supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'k', userId: 'u', limiteDiario: 10 };

  assert.equal(await reservarLeitura({ fetchImpl, ...argumentos }), 'limite');
  assert.match(chamada.url, /\/rpc\/uni_insights_reserve_call$/);
  assert.deepEqual(chamada.corpo, { p_user_id: 'u', p_daily_limit: 10 });
  assert.equal(await reservarLeitura({ fetchImpl: async () => { throw new Error('rede'); }, ...argumentos }), 'sem_cota');
  assert.equal(await reservarLeitura({ fetchImpl, ...argumentos, serviceRoleKey: '' }), 'sem_cota');
});

test('custo do Haiku 5.5 sai da tabela, não do preço de modelo desconhecido', () => {
  // 1M de entrada a US$ 0,10 e 1M de saída a US$ 0,50, câmbio 5,5.
  assert.equal(custoEmReais('claude-haiku-5-5', { entrada: 1_000_000, saida: 1_000_000 }), 3.3);
});

test('migration 061 conta gerações à parte e respeita o teto mensal', () => {
  const migration = readFileSync(
    new URL('../../../supabase/migrations/20261008230200_061_uni_insights_daily_usage.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /add column if not exists insight_calls integer not null default 0/);
  assert.match(migration, /if v_month_cost >= v_monthly_cost then/);
  assert.match(migration, /revoke execute on function public\.uni_insights_reserve_call\(uuid, integer\) from public, anon, authenticated;/);
  assert.match(migration, /grant execute on function public\.uni_insights_reserve_call\(uuid, integer\) to service_role;/);
});
