import assert from 'node:assert/strict';
import test from 'node:test';
import {
  lancamentosDaCategoria,
  maioresCategoriasDoMes,
  montarListaDeCategorias,
  resumoDaCategoria,
} from './categoriasDoMes.js';

const categories = [
  { id: 'a', name: 'Moradia', category_type: 'expense', is_system: true },
  { id: 'b', name: 'Alimentação', category_type: 'expense', is_system: true },
  { id: 'c', name: 'Pet', category_type: 'expense', workspace_id: 'w1', created_by: 'u1' },
  { id: 'd', name: 'Lazer', category_type: 'expense', is_system: true },
  { id: 'e', name: 'Salário', category_type: 'income', is_system: true },
  { id: 'f', name: 'Antiga', category_type: 'expense', is_active: false },
];
const lancamento = (id, category_id, amount, extra = {}) => ({
  id, category_id, amount, status: 'completed', transaction_type: 'expense',
  transaction_date: '2026-10-05', ...extra,
});

test('ordena por valor e separa as sem lançamento em ordem alfabética', () => {
  const lista = montarListaDeCategorias({
    categories,
    type: 'expense',
    transactions: [lancamento(1, 'b', 100), lancamento(2, 'b', 140), lancamento(3, 'a', 1800)],
  });
  assert.deepEqual(lista.comLancamento.map((l) => l.name), ['Moradia', 'Alimentação']);
  assert.deepEqual(lista.semLancamento.map((l) => l.name), ['Lazer', 'Pet']);
  assert.equal(lista.total, 2040);
  assert.equal(lista.comLancamento[0].peso, 1);
  assert.ok(Math.abs(lista.comLancamento[1].peso - 240 / 1800) < 1e-9);
  assert.equal(lista.comLancamento[1].quantidade, 2);
});

test('ignora pendentes e outro tipo; sem categoria e inativa só somam no total', () => {
  const lista = montarListaDeCategorias({
    categories,
    type: 'expense',
    transactions: [
      lancamento(1, 'a', 50, { status: 'pending' }),
      lancamento(2, 'a', 70, { transaction_type: 'income' }),
      lancamento(3, null, 90),
      lancamento(4, 'f', 30),
    ],
  });
  assert.equal(lista.comLancamento.length, 0);
  // Sem categoria e categoria inativa entram no total, fora das linhas.
  assert.equal(lista.total, 120);
  assert.deepEqual(lista.semCategoria, { valor: 120, quantidade: 2 });
  assert.ok(lista.semLancamento.every((l) => l.name !== 'Antiga'));
});

test('marca só a categoria do espaço como criada pelo usuário', () => {
  const lista = montarListaDeCategorias({ categories, transactions: [], type: 'expense' });
  assert.deepEqual(
    lista.semLancamento.filter((l) => l.criadaPeloUsuario).map((l) => l.name),
    ['Pet'],
  );
});

test('entradas usam só categorias de entrada', () => {
  const lista = montarListaDeCategorias({
    categories,
    type: 'income',
    transactions: [lancamento(1, 'e', 6500, { transaction_type: 'income' })],
  });
  assert.deepEqual(lista.comLancamento.map((l) => l.name), ['Salário']);
});

test('lançamentos e resumo da categoria vêm do mais recente', () => {
  const todos = [
    lancamento(1, 'c', 110, { transaction_date: '2026-10-08' }),
    lancamento(2, 'c', 40, { transaction_date: '2026-10-02' }),
    lancamento(3, 'a', 10),
  ];
  assert.deepEqual(lancamentosDaCategoria(todos, 'c').map((t) => t.id), [1, 2]);
  assert.deepEqual(resumoDaCategoria(todos, 'c'), { valor: 150, quantidade: 2 });
});

test('ocultas (#184) saem das listas, voltam no grupo Ocultas e seguem no total', () => {
  const visiveis = categories.filter((c) => c.id !== 'a' && c.id !== 'c');
  const ocultas = categories.filter((c) => c.id === 'a' || c.id === 'c' || c.id === 'e');
  const lista = montarListaDeCategorias({
    categories: visiveis,
    ocultas,
    type: 'expense',
    transactions: [lancamento(1, 'a', 300), lancamento(2, 'b', 100)],
  });
  assert.deepEqual(lista.comLancamento.map((l) => l.id), ['b']);
  assert.deepEqual(lista.semLancamento.map((l) => l.id), ['d']);
  // Só as do tipo, em ordem alfabética; Salário (entrada) fica de fora.
  assert.deepEqual(lista.ocultas.map((l) => l.name), ['Moradia', 'Pet']);
  assert.equal(lista.ocultas[0].valor, 300);
  // A barra usa a escala das visíveis: oculta maior que todas fica cheia.
  assert.equal(lista.ocultas[0].peso, 1);
  assert.equal(lista.ocultas[1].peso, 0);
  assert.equal(lista.total, 400);
  assert.deepEqual(lista.semCategoria, { valor: 0, quantidade: 0 });
});

test('sem ocultas o grupo vem vazio', () => {
  const lista = montarListaDeCategorias({ categories, type: 'expense', transactions: [] });
  assert.deepEqual(lista.ocultas, []);
});

test('Resumo (handoff 25): até 5 maiores, sem valor zero, fatia do total do tipo', () => {
  const muitas = [
    ...categories,
    { id: 'g', name: 'Transporte', category_type: 'expense', is_system: true },
    { id: 'h', name: 'Educação', category_type: 'expense', is_system: true },
    { id: 'i', name: 'Saúde', category_type: 'expense', is_system: true },
  ];
  const resumo = maioresCategoriasDoMes({
    categories: muitas,
    type: 'expense',
    transactions: [
      lancamento(1, 'a', 3000),
      lancamento(2, 'd', 430),
      lancamento(3, 'g', 300),
      lancamento(4, 'g', 75),
      lancamento(5, 'b', 302.4),
      lancamento(6, 'h', 150),
      lancamento(7, 'i', 40),
      lancamento(8, 'c', 0),
      lancamento(9, 'b', 99, { status: 'pending' }),
      lancamento(10, 'e', 2500, { transaction_type: 'income' }),
    ],
  });
  assert.deepEqual(resumo.linhas.map((l) => l.name), ['Moradia', 'Lazer', 'Transporte', 'Alimentação', 'Educação']);
  assert.equal(resumo.linhas[2].quantidade, 2);
  // O total conta a sexta categoria, que ficou fora da lista.
  assert.equal(resumo.total, 4297.4);
  assert.equal(resumo.linhas[0].fatia, 3000 / 4297.4);
});

test('Resumo: oculta e sem categoria entram pelo valor', () => {
  const resumo = maioresCategoriasDoMes({
    categories: categories.filter((c) => c.id !== 'a'),
    ocultas: categories.filter((c) => c.id === 'a'),
    type: 'expense',
    transactions: [lancamento(1, 'a', 300), lancamento(2, null, 200), lancamento(3, 'b', 100)],
  });
  assert.deepEqual(resumo.linhas.map((l) => l.name), ['Moradia', 'Sem categoria', 'Alimentação']);
  assert.equal(resumo.linhas[1].semCategoria, true);
  assert.equal(resumo.total, 600);
});

test('Resumo: mês sem lançamento do tipo vem vazio', () => {
  const resumo = maioresCategoriasDoMes({ categories, type: 'income', transactions: [lancamento(1, 'a', 10)] });
  assert.deepEqual(resumo, { total: 0, linhas: [] });
});
