import assert from 'node:assert/strict';
import test from 'node:test';

import { catalogoDoWorkspace } from './evalCatalog.js';
import { CASOS } from './evalCases.js';
import { avaliarCaso, INTENTS_DE_LANCAMENTO, resumirAvaliacao } from './evalScoring.js';

const INTENTS_VALIDOS = new Set([...INTENTS_DE_LANCAMENTO, 'saldo', 'meta', 'consulta', 'agenda', 'conversa']);

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
    const nomes = [caso.esperado.categoria, ...(caso.esperado.aceitas ?? [])].filter((nome) => nome !== null);
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
    intent: true, valor: true, data: true, categoria: true, modalidade: true,
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
    intent: false, valor: false, data: false, categoria: false, modalidade: false,
  });
});

test('casos que não são lançamento só medem o intent', () => {
  const caso = { id: 'saldo', frase: 'Qual meu saldo?', esperado: { intent: 'consulta' } };
  assert.deepEqual(avaliarCaso(caso, { intent: 'consulta' }), {
    intent: true, valor: null, data: null, categoria: null, modalidade: null,
  });
});

test('resumo ignora campos que não se aplicam', () => {
  const resumo = resumirAvaliacao([
    { intent: true, valor: true, data: false, categoria: null, modalidade: true },
    { intent: false, valor: null, data: null, categoria: null, modalidade: null },
  ]);
  assert.deepEqual(resumo, {
    intent: { acertos: 1, total: 2 },
    valor: { acertos: 1, total: 1 },
    data: { acertos: 0, total: 1 },
    categoria: { acertos: 0, total: 0 },
    modalidade: { acertos: 1, total: 1 },
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
