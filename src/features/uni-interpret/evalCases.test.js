import assert from 'node:assert/strict';
import test from 'node:test';

import { catalogoDoWorkspace, metasDaAvaliacao } from './evalCatalog.js';
import { CASOS } from './evalCases.js';
import { avaliarCaso, INTENTS_DE_LANCAMENTO, resumirAvaliacao } from './evalScoring.js';

const INTENTS_VALIDOS = new Set([...INTENTS_DE_LANCAMENTO, 'saldo', 'meta', 'consulta', 'agenda', 'categoria', 'exclusao', 'conversa']);

test('cada caso tem id único e intent conhecido', () => {
  const ids = CASOS.map((caso) => caso.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const caso of CASOS) {
    assert.ok(INTENTS_VALIDOS.has(caso.esperado.intent), `${caso.id}: intent ${caso.esperado.intent}`);
  }
});

test('categoria esperada existe no catálogo do workspace do caso, com o tipo certo', () => {
  const tipoPorIntent = { lancar_saida: 'expense', lancar_entrada: 'income', transferir: 'transfer' };
  for (const caso of CASOS.filter((item) => INTENTS_DE_LANCAMENTO.has(item.esperado.intent))) {
    const catalogo = catalogoDoWorkspace(caso.workspace ?? 'personal')
      .filter((category) => category.category_type === tipoPorIntent[caso.esperado.intent])
      .map((category) => category.name);
    const { novaCategoria } = caso.esperado;
    assert.ok(caso.esperado.categoria !== undefined || novaCategoria, `${caso.id}: categoria esperada ausente`);
    // Categoria nova é a que o card propõe criar: não pode estar no catálogo.
    if (novaCategoria) assert.ok(!catalogo.includes(novaCategoria), `${caso.id}: "${novaCategoria}" já está no catálogo`);
    const nomes = [caso.esperado.categoria, ...(caso.esperado.aceitas ?? [])].filter((nome) => nome !== null && nome !== undefined);
    for (const nome of nomes) {
      assert.ok(catalogo.includes(nome), `${caso.id}: "${nome}" fora do catálogo`);
    }
    assert.ok(Number.isFinite(caso.esperado.valor), `${caso.id}: valor esperado ausente`);
  }
});

test('conjunto reservado: marca booleana, ao menos 30 casos e cobre lançamentos e não lançamentos', () => {
  for (const caso of CASOS.filter((item) => 'reservado' in item)) {
    assert.equal(typeof caso.reservado, 'boolean', `${caso.id}: reservado não é booleano`);
  }
  const reservados = CASOS.filter((caso) => caso.reservado);
  assert.ok(reservados.length >= 30, `só ${reservados.length} casos reservados`);
  assert.ok(reservados.some((caso) => INTENTS_DE_LANCAMENTO.has(caso.esperado.intent)));
  assert.ok(reservados.some((caso) => !INTENTS_DE_LANCAMENTO.has(caso.esperado.intent)));
  assert.ok(CASOS.length - reservados.length >= 30, 'conjunto de ajuste ficou pequeno demais');
});

test('data esperada é ISO válida e não fica no futuro em lançamentos', () => {
  for (const caso of CASOS.filter((item) => item.esperado.data)) {
    assert.match(caso.esperado.data, /^\d{4}-\d{2}-\d{2}$/, caso.id);
    assert.ok(caso.esperado.data <= '2026-10-02', `${caso.id}: data no futuro`);
  }
});

// #192: o alvo de um pedido de meta precisa ser uma meta que o modelo vê, e
// a meta que um caso manda criar não pode já existir.
test('pedido de meta: alvo existe em metasDaAvaliacao e nome a criar não existe', () => {
  const nomes = metasDaAvaliacao().map((meta) => meta.name);
  for (const caso of CASOS.filter((item) => item.esperado.intent === 'meta' && item.esperado.pedido)) {
    const { pedido } = caso;
    const { acao, alvo, nome } = caso.esperado.pedido;
    assert.ok(['criar', 'editar', 'excluir', 'consultar'].includes(acao), `${caso.id}: ação ${acao}`);
    if (alvo !== undefined) assert.ok(nomes.includes(alvo), `${caso.id}: "${alvo}" fora das metas da avaliação`);
    if (acao === 'criar' && nome) assert.ok(!nomes.includes(nome), `${caso.id}: "${nome}" já existe`);
    assert.equal(pedido, undefined);
  }
});

test('Impostos só existe no catálogo de empresa', () => {
  assert.ok(!catalogoDoWorkspace('personal').some((category) => category.name === 'Impostos'));
  assert.ok(catalogoDoWorkspace('business').some((category) => category.name === 'Impostos'));
});

const CASO_ESCOLA = {
  id: 'escola',
  frase: 'Lance 300 da escola',
  esperado: { intent: 'lancar_saida', valor: 300, categoria: 'Educação', aceitas: ['Outras despesas'] },
};

function resultado(campos) {
  return {
    intent: 'lancar_saida',
    valor: 300,
    data: '2026-10-02',
    categoria: 'Educação',
    modoCategoria: 'resolveu',
    ...campos,
  };
}

test('acerta quando todos os campos batem, inclusive categoria aceita', () => {
  assert.deepEqual(avaliarCaso(CASO_ESCOLA, resultado()), {
    intent: true, valor: true, data: true, categoria: true, modalidade: true, titulo: null, consulta: null, pedido: null,
  });
  assert.equal(avaliarCaso(CASO_ESCOLA, resultado({ categoria: 'Outras despesas' })).categoria, true);
});

test('propor criar categoria conta como erro, mesmo com o nome certo', () => {
  const veredito = avaliarCaso(CASO_ESCOLA, resultado({ modoCategoria: 'propos_criar' }));
  assert.equal(veredito.categoria, false);
});

test('caso sem base para categoria só acerta quando a Uni pergunta', () => {
  const caso = { id: 'vago', frase: 'Gastei 50', esperado: { intent: 'lancar_saida', valor: 50, categoria: null } };
  assert.equal(avaliarCaso(caso, resultado({ valor: 50, categoria: null, modoCategoria: 'perguntou' })).categoria, true);
  assert.equal(avaliarCaso(caso, resultado({ valor: 50, modoCategoria: 'resolveu' })).categoria, false);
});

test('intent errado derruba os outros campos do lançamento', () => {
  assert.deepEqual(avaliarCaso(CASO_ESCOLA, resultado({ intent: 'consulta' })), {
    intent: false, valor: false, data: false, categoria: false, modalidade: false, titulo: null, consulta: null, pedido: null,
  });
});

test('casos que não são lançamento só medem o intent', () => {
  const caso = { id: 'saldo', frase: 'Qual meu saldo?', esperado: { intent: 'consulta' } };
  assert.deepEqual(avaliarCaso(caso, { intent: 'consulta' }), {
    intent: true, valor: null, data: null, categoria: null, modalidade: null, titulo: null, consulta: null, pedido: null,
  });
});

test('resumo ignora campos que não se aplicam', () => {
  const resumo = resumirAvaliacao([
    { intent: true, valor: true, data: false, categoria: null, modalidade: true, titulo: null, consulta: null, pedido: null },
    { intent: false, valor: null, data: null, categoria: null, modalidade: null, titulo: true, consulta: null, pedido: null },
  ]);
  assert.deepEqual(resumo, {
    intent: { acertos: 1, total: 2 },
    valor: { acertos: 1, total: 1 },
    data: { acertos: 0, total: 1 },
    categoria: { acertos: 0, total: 0 },
    modalidade: { acertos: 1, total: 1 },
    titulo: { acertos: 1, total: 1 },
    consulta: { acertos: 0, total: 0 },
    pedido: { acertos: 0, total: 0 },
  });
});

test('modalidade: parcela avulsa não é parcelamento, e parcelamento ou recorrência esperados precisam vir', () => {
  assert.equal(avaliarCaso(CASO_ESCOLA, resultado({ parcelas: 10 })).modalidade, false);
  assert.equal(avaliarCaso(CASO_ESCOLA, resultado({ recorrente: true })).modalidade, false);
  const parcelado = { ...CASO_ESCOLA, esperado: { ...CASO_ESCOLA.esperado, parcelas: 12 } };
  assert.equal(avaliarCaso(parcelado, resultado({ parcelas: 12 })).modalidade, true);
  assert.equal(avaliarCaso(parcelado, resultado()).modalidade, false);
  const recorrente = { ...CASO_ESCOLA, esperado: { ...CASO_ESCOLA.esperado, recorrente: true } };
  assert.equal(avaliarCaso(recorrente, resultado({ recorrente: true })).modalidade, true);
});

// #80, etapa 2c: parâmetros da consulta.
const CASO_FARMACIA = {
  id: 'farmacia',
  frase: 'Quanto gastei de farmácia em agosto?',
  esperado: {
    intent: 'consulta',
    consulta: { tipo: 'saidas', inicio: '2026-08-01', fim: '2026-08-31', filtros: [{ termo: 'farmácia' }, { categoria: 'Saúde', termo: 'farmácia' }] },
  },
};

function consultaObtida(campos) {
  return {
    intent: 'consulta',
    consulta: { tipo: 'saidas', inicio: '2026-08-01', fim: '2026-08-31', categoria: null, termo: 'Farmacia', ...campos },
  };
}

test('consulta: tipo, período e um dos filtros aceitos; termo sem acento nem caixa', () => {
  assert.equal(avaliarCaso(CASO_FARMACIA, consultaObtida()).consulta, true);
  assert.equal(avaliarCaso(CASO_FARMACIA, consultaObtida({ categoria: 'Saúde', termo: 'compras na farmácia' })).consulta, true);
  assert.equal(avaliarCaso(CASO_FARMACIA, consultaObtida({ categoria: 'Saúde', termo: null })).consulta, false);
  assert.equal(avaliarCaso(CASO_FARMACIA, consultaObtida({ tipo: 'entradas' })).consulta, false);
  assert.equal(avaliarCaso(CASO_FARMACIA, consultaObtida({ fim: '2026-08-30' })).consulta, false);
  assert.equal(avaliarCaso(CASO_FARMACIA, consultaObtida({ intent: 'agenda' })).consulta, true);
  assert.equal(avaliarCaso(CASO_FARMACIA, { ...consultaObtida(), intent: 'agenda' }).consulta, false);
});

test('consulta: mês atual vale com ou sem datas, e fim no futuro aceita qualquer fim a partir de hoje', () => {
  const caso = { id: 'mes', frase: 'Quanto gastei esse mês?', esperado: { intent: 'consulta', consulta: { tipo: 'saidas' } } };
  assert.equal(avaliarCaso(caso, consultaObtida({ inicio: null, fim: null, termo: null })).consulta, true);
  assert.equal(avaliarCaso(caso, consultaObtida({ inicio: '2026-10-01', fim: '2026-10-31', termo: null })).consulta, true);
  assert.equal(avaliarCaso(caso, consultaObtida({ inicio: '2026-10-01', fim: '2026-10-02', termo: null })).consulta, true);
  assert.equal(avaliarCaso(caso, consultaObtida({ inicio: '2026-10-01', fim: '2026-10-01', termo: null })).consulta, false);
});

test('consulta: outra só confere o tipo; quem não lê parâmetros não é medido', () => {
  const caso = { id: 'meta', frase: 'Quanto falta pra meta?', esperado: { intent: 'consulta', consulta: { tipo: 'outra' } } };
  assert.equal(avaliarCaso(caso, consultaObtida({ tipo: 'outra', inicio: '2026-01-01' })).consulta, true);
  assert.equal(avaliarCaso(caso, { intent: 'consulta' }).consulta, null);
});

test('consulta esperada usa categoria do catálogo e período ISO em ordem', () => {
  const nomes = new Set(catalogoDoWorkspace('personal').map((category) => category.name));
  for (const caso of CASOS.filter((item) => item.esperado.consulta)) {
    const { tipo, inicio, fim, filtros = [] } = caso.esperado.consulta;
    assert.ok(['saidas', 'entradas', 'resumo', 'lancamentos', 'categorias', 'outra'].includes(tipo), `${caso.id}: tipo ${tipo}`);
    assert.equal(Boolean(inicio), Boolean(fim), `${caso.id}: período pela metade`);
    if (inicio) assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(inicio) && inicio <= fim, `${caso.id}: período inválido`);
    for (const filtro of filtros) {
      if (filtro.categoria) assert.ok(nomes.has(filtro.categoria), `${caso.id}: "${filtro.categoria}" fora do catálogo`);
    }
  }
});

test('título de agenda: palavras esperadas, inicial maiúscula e nada do pedido', () => {
  const caso = {
    id: 'agenda-escola',
    frase: 'me lembra amanhã de pagar a escola',
    esperado: { intent: 'agenda', titulo: ['pagar', 'escola'] },
  };
  const titulo = (valor) => avaliarCaso(caso, { intent: 'agenda', titulo: valor }).titulo;
  assert.equal(titulo('Pagar a escola'), true);
  assert.equal(titulo('pagar a escola'), false, 'minúscula no início');
  assert.equal(titulo('Escola'), false, 'faltou palavra');
  assert.equal(titulo('Meu que eu vou ter que pagar a escola'), false, 'sobrou o pedido');
  assert.equal(titulo(null), false);
  assert.equal(avaliarCaso(caso, { intent: 'consulta', titulo: 'Pagar a escola' }).titulo, false);
  assert.equal(avaliarCaso(caso, { intent: 'agenda' }).titulo, null, 'quem não produz título não é medido nele');
  assert.equal(titulo('Pagar a escola da marca X'), true, '"marca" como substantivo não é pedido');
});

test('casos de agenda com título esperado listam palavras', () => {
  for (const caso of CASOS.filter((item) => item.esperado.titulo)) {
    assert.equal(caso.esperado.intent, 'agenda', caso.id);
    assert.ok(Array.isArray(caso.esperado.titulo) && caso.esperado.titulo.length > 0, caso.id);
  }
});
