import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dataEmSaoPaulo,
  interpretarFrase,
  lerEntrada,
  MAX_FRASE,
  MAX_HISTORICO,
} from '../../../supabase/functions/_shared/uniInterpret/servico.js';

const WORKSPACE = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';
const CONTEXTO = {
  workspaceType: 'personal',
  categorias: [
    { id: 'cat-ali', name: 'Alimentação', category_type: 'expense' },
    { id: 'cat-edu', name: 'Educação', category_type: 'expense' },
  ],
  contas: [{ id: 'conta-nu', name: 'Nubank' }],
  metas: [{ id: 'meta-via', name: 'Viagem para o Chile' }],
};
// Sexta, 02/10/2026, 15h em São Paulo.
const AGORA = new Date('2026-10-02T18:00:00Z');

function modeloQueResponde(bruta) {
  const chamadas = [];
  const chamarModelo = async (entrada) => {
    chamadas.push(entrada);
    return { ok: true, bruta, modelo: 'gpt-5.6-luna', uso: { entrada: 1200, saida: 90, cacheLeitura: 0 } };
  };
  return { chamarModelo, chamadas };
}

const LANCAMENTO_ESCOLA = {
  intent: 'lancamento',
  resposta: '',
  operacoes: [{
    tipo: 'saida', valor: 300, data: null, descricao: 'Mensalidade escolar das crianças',
    categoria: 'c2', nova_categoria: null, alternativas: ['c1'], conta: 'k1', conta_destino: null, confianca: 0.95,
  }],
};

test('lerEntrada: exige workspace UUID e frase, corta tamanhos e limpa o histórico', () => {
  assert.equal(lerEntrada({ workspaceId: 'nao-e-uuid', frase: 'oi' }).workspaceId, null);
  assert.equal(lerEntrada(null).frase, '');

  const entrada = lerEntrada({
    workspaceId: WORKSPACE,
    frase: `  ${'a'.repeat(MAX_FRASE + 50)}  `,
    historico: Array.from({ length: 10 }, (_, indice) => ({ autor: indice % 2 ? 'uni' : 'hacker', texto: `t${indice}` })),
    rascunho: { texto: 'x'.repeat(5000) },
  });
  assert.equal(entrada.frase.length, MAX_FRASE);
  assert.equal(entrada.historico.length, MAX_HISTORICO);
  assert.deepEqual(entrada.historico.map((turno) => turno.autor), ['usuario', 'uni', 'usuario', 'uni', 'usuario', 'uni']);
  assert.equal(entrada.rascunho, null, 'rascunho grande demais é descartado');
});

test('dataEmSaoPaulo: perto da meia-noite UTC ainda é o dia anterior em São Paulo', () => {
  assert.equal(dataEmSaoPaulo(new Date('2026-10-03T02:30:00Z')), '2026-10-02');
  assert.equal(dataEmSaoPaulo(new Date('2026-10-03T03:30:00Z')), '2026-10-03');
});

test('entrada inválida responde 400 sem carregar contexto nem chamar o modelo', async () => {
  let carregou = false;
  const { chamarModelo, chamadas } = modeloQueResponde(LANCAMENTO_ESCOLA);
  const resultado = await interpretarFrase({
    corpo: { workspaceId: WORKSPACE, frase: '   ' },
    carregarContexto: async () => { carregou = true; return CONTEXTO; },
    chamarModelo,
  });
  assert.equal(resultado.status, 400);
  assert.equal(carregou, false);
  assert.equal(chamadas.length, 0);
});

test('workspace que o usuário não enxerga responde 403 sem chamar o modelo', async () => {
  const { chamarModelo, chamadas } = modeloQueResponde(LANCAMENTO_ESCOLA);
  const resultado = await interpretarFrase({
    corpo: { workspaceId: WORKSPACE, frase: 'Paguei 300 da escola' },
    carregarContexto: async () => null,
    chamarModelo,
  });
  assert.equal(resultado.status, 403);
  assert.equal(chamadas.length, 0);
});

test('sucesso: devolve a proposta com ids reais e data de referência, e o modelo recebe o catálogo do servidor', async () => {
  const { chamarModelo, chamadas } = modeloQueResponde(LANCAMENTO_ESCOLA);
  const resultado = await interpretarFrase({
    corpo: { workspaceId: WORKSPACE, frase: 'Lance 300 reais da mensalidade escolar das crianças no Nubank' },
    carregarContexto: async (workspaceId) => (workspaceId === WORKSPACE ? CONTEXTO : null),
    chamarModelo,
    agora: AGORA,
  });

  assert.equal(resultado.status, 200);
  assert.equal(resultado.corpo.dataReferencia, '2026-10-02');
  assert.deepEqual(resultado.corpo.operacoes[0], {
    tipo: 'saida',
    valor: 300,
    data: '2026-10-02',
    descricao: 'Mensalidade escolar das crianças',
    categoria: { id: 'cat-edu', name: 'Educação' },
    novaCategoria: null,
    alternativas: [{ id: 'cat-ali', name: 'Alimentação' }],
    conta: { id: 'conta-nu', name: 'Nubank' },
    contaDestino: null,
    confianca: 0.95,
    parcelas: null,
    recorrente: false,
    faltando: [],
    ajustes: [],
  });
  assert.equal('agenda' in resultado.corpo, false);
  assert.match(chamadas[0].mensagem, /- c2: Educação \(saída\)/);
  assert.match(chamadas[0].mensagem, /Hoje: 2026-10-02 \(sexta-feira\)/);
});

test('consulta: devolve só ids e nomes dos registros filtrados', async () => {
  const { chamarModelo } = modeloQueResponde({
    intent: 'consulta',
    operacoes: [],
    resposta: '',
    consulta: { tipo: 'saidas', inicio: '2026-09-01', fim: '2026-09-30', categoria: 'c2', conta: 'k1', termo: 'escola' },
  });
  const resultado = await interpretarFrase({
    corpo: { workspaceId: WORKSPACE, frase: 'quanto paguei de escola no Nubank em setembro' },
    carregarContexto: async () => CONTEXTO,
    chamarModelo,
    agora: AGORA,
  });

  assert.equal(resultado.status, 200);
  assert.deepEqual(resultado.corpo.consulta, {
    tipo: 'saidas',
    inicio: '2026-09-01',
    fim: '2026-09-30',
    categoria: { id: 'cat-edu', name: 'Educação' },
    conta: { id: 'conta-nu', name: 'Nubank' },
    termo: 'escola',
  });
});

// Sem parcelas na resposta, o app lançava "12x de 300" como compra à vista
// de 3.600.
test('parcelas e recorrência chegam ao app', async () => {
  const parcelado = {
    ...LANCAMENTO_ESCOLA,
    operacoes: [{ ...LANCAMENTO_ESCOLA.operacoes[0], valor: 3600, parcelas: 12, recorrente: false }],
  };
  const { chamarModelo } = modeloQueResponde(parcelado);
  const resultado = await interpretarFrase({
    corpo: { workspaceId: WORKSPACE, frase: 'Comprei um notebook em 12x de 300' },
    carregarContexto: async () => CONTEXTO,
    chamarModelo,
  });
  assert.equal(resultado.corpo.operacoes[0].parcelas, 12);
  assert.equal(resultado.corpo.operacoes[0].recorrente, false);
});

test('agenda: devolve título e valor do compromisso', async () => {
  const { chamarModelo } = modeloQueResponde({
    intent: 'agenda',
    operacoes: [],
    agenda: { titulo: 'Pagar mensalidade das escolas', valor: 2500 },
    resposta: '',
  });
  const resultado = await interpretarFrase({
    corpo: { workspaceId: WORKSPACE, frase: 'me lembra que amanhã eu vou ter que pagar a mensalidade das escolas no valor de 2500 reais' },
    carregarContexto: async () => CONTEXTO,
    chamarModelo,
  });
  assert.equal(resultado.corpo.intent, 'agenda');
  assert.deepEqual(resultado.corpo.agenda, { titulo: 'Pagar mensalidade das escolas', valor: 2500 });
  assert.deepEqual(resultado.corpo.operacoes, []);
});

test('categoria: devolve a ação, o tipo, o alvo só com id e nome, e o nome novo', async () => {
  const { chamarModelo } = modeloQueResponde({
    intent: 'categoria',
    operacoes: [],
    resposta: '',
    categoria: { acao: 'renomear', tipo: null, alvo: 'c2', nome: 'Escola' },
  });
  const resultado = await interpretarFrase({
    corpo: { workspaceId: WORKSPACE, frase: 'renomeia a categoria Educação para Escola' },
    carregarContexto: async () => CONTEXTO,
    chamarModelo,
  });
  assert.equal(resultado.corpo.intent, 'categoria');
  assert.deepEqual(resultado.corpo.categoria, { acao: 'renomear', tipo: 'saida', alvo: { id: 'cat-edu', name: 'Educação' }, nome: 'Escola' });
});

test('meta: devolve a ação, o alvo só com id e nome, valor, prazo e por mês; o prompt lista as metas', async () => {
  const { chamarModelo, chamadas } = modeloQueResponde({
    intent: 'meta',
    operacoes: [],
    resposta: '',
    meta: { acao: 'editar', alvo: 'm1', nome: null, valor: 15000, data: '2027-07-31', por_mes: null },
  });
  const resultado = await interpretarFrase({
    corpo: { workspaceId: WORKSPACE, frase: 'muda a meta da viagem pra 15 mil até julho do ano que vem' },
    carregarContexto: async () => CONTEXTO,
    chamarModelo,
    agora: AGORA,
  });
  assert.equal(resultado.corpo.intent, 'meta');
  assert.deepEqual(resultado.corpo.meta, {
    acao: 'editar', alvo: { id: 'meta-via', name: 'Viagem para o Chile' }, nome: null, valor: 15000, data: '2027-07-31', porMes: null, ajustes: [],
  });
  assert.match(chamadas[0].mensagem, /<metas>\n- m1: Viagem para o Chile\n<\/metas>/);
});

test('contexto sem metas (função antiga) não quebra: a lista sai vazia', async () => {
  const { chamarModelo, chamadas } = modeloQueResponde({ intent: 'conversa', operacoes: [], resposta: 'Oi!' });
  const semMetas = { workspaceType: CONTEXTO.workspaceType, categorias: CONTEXTO.categorias, contas: CONTEXTO.contas };
  const resultado = await interpretarFrase({
    corpo: { workspaceId: WORKSPACE, frase: 'oi' },
    carregarContexto: async () => semMetas,
    chamarModelo,
  });
  assert.equal(resultado.status, 200);
  assert.match(chamadas[0].mensagem, /\(nenhuma meta cadastrada\)/);
});

test('falha do provedor vira status próprio e a métrica não leva a frase', async () => {
  const casos = [['limite', 429], ['tempo_esgotado', 504], ['sem_cota', 503], ['recusa', 502], ['desconhecido', 502]];
  for (const [motivo, status] of casos) {
    const resultado = await interpretarFrase({
      corpo: { workspaceId: WORKSPACE, frase: 'Paguei 300 da escola do Pedro' },
      carregarContexto: async () => CONTEXTO,
      chamarModelo: async () => ({ ok: false, motivo, status: 500, modelo: 'gpt-5.6-luna' }),
    });
    assert.equal(resultado.status, status, motivo);
    assert.equal(resultado.corpo.motivo, motivo);
    assert.doesNotMatch(JSON.stringify(resultado.metrica), /escola|Pedro/);
  }
});

test('métrica de sucesso só tem metadados', async () => {
  const { chamarModelo } = modeloQueResponde(LANCAMENTO_ESCOLA);
  const resultado = await interpretarFrase({
    corpo: { workspaceId: WORKSPACE, frase: 'Paguei 300 da escola do Pedro' },
    carregarContexto: async () => CONTEXTO,
    chamarModelo,
  });
  assert.deepEqual(Object.keys(resultado.metrica).sort(),
    ['duracaoMs', 'intent', 'modelo', 'motivo', 'operacoes', 'tokensEntrada', 'tokensSaida']);
  assert.doesNotMatch(JSON.stringify(resultado.metrica), /escola|Pedro|Educação/);
});
