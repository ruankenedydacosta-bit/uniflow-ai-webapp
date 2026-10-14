import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTION_KIND_CATEGORIA,
  montarPedidoDeCategoria,
  respostaAoPedidoDeCategoria,
  textoDoPedidoFeito,
} from './pedidoDeCategoria.js';

const WORKSPACE = 'ws-1';
const CATEGORIAS = [
  { id: 'cat-outras', name: 'Outras despesas', category_type: 'expense', is_system: true, workspace_id: null },
  { id: 'cat-carro', name: 'Carro', category_type: 'expense', is_system: false, workspace_id: WORKSPACE, created_by: 'user-1' },
  { id: 'cat-bicos', name: 'Bicos', category_type: 'income', is_system: false, workspace_id: WORKSPACE, created_by: 'user-2' },
];
const DONO = { categorias: CATEGORIAS, papel: { canUpdate: true, canDelete: true }, userId: 'user-1', espaco: 'Pessoal' };
const MEMBRO = { ...DONO, papel: { canUpdate: true, canDelete: false } };

// Conversa por voz de 11/10/2026: a pessoa pediu a categoria Impostos e a Uni
// perguntou o valor de um lançamento.
test('criar: card com nome, tipo e espaço; o texto pede a confirmação', () => {
  const pedido = montarPedidoDeCategoria({ acao: 'criar', tipo: 'saida', alvo: null, nome: 'impostos' }, DONO);
  assert.equal(pedido.nome, 'Impostos');
  assert.equal(pedido.categoryType, 'expense');
  assert.equal(pedido.texto, 'Vou criar a categoria Impostos, de saída. Posso criar?');
  assert.deepEqual(pedido.card, {
    title: 'Criar categoria',
    status: 'pending',
    actionKind: ACTION_KIND_CATEGORIA,
    editable: false,
    rows: [
      { label: 'Categoria', value: 'Impostos' },
      { label: 'Tipo', value: 'Saída' },
      { label: 'Espaço', value: 'Pessoal' },
    ],
  });
  assert.equal(montarPedidoDeCategoria({ acao: 'criar', tipo: 'entrada', nome: 'Aulas' }, DONO).categoryType, 'income');
  assert.equal(textoDoPedidoFeito(pedido), 'Categoria Impostos criada. Ela já pode ser usada nos lançamentos.');
});

test('criar: sem nome, sem permissão ou nome que já existe no tipo não abre card', () => {
  assert.match(montarPedidoDeCategoria({ acao: 'criar', tipo: 'saida', nome: '' }, DONO).erro, /Diga o nome/);
  assert.match(montarPedidoDeCategoria({ acao: 'criar', nome: 'Pets' }, { ...DONO, papel: {} }).erro, /não tem permissão/);
  assert.equal(
    montarPedidoDeCategoria({ acao: 'criar', tipo: 'saida', nome: 'carro' }, DONO).erro,
    'A categoria Carro já existe. Ela já pode ser usada nos lançamentos.',
  );
  // Mesmo nome em outro tipo pode.
  assert.equal(montarPedidoDeCategoria({ acao: 'criar', tipo: 'entrada', nome: 'Carro' }, DONO).erro, undefined);
});

test('renomear: card de-para; nome igual ou repetido não abre card', () => {
  const pedido = montarPedidoDeCategoria({ acao: 'renomear', alvo: { id: 'cat-carro', name: 'Carro' }, nome: 'veículo' }, DONO);
  assert.equal(pedido.texto, 'Vou renomear a categoria Carro para Veículo. Posso confirmar?');
  assert.deepEqual(pedido.card.rows, [
    { label: 'De', value: 'Carro' },
    { label: 'Para', value: 'Veículo' },
    { label: 'Tipo', value: 'Saída' },
  ]);
  assert.equal(textoDoPedidoFeito(pedido), 'Categoria Carro renomeada para Veículo.');
  assert.match(montarPedidoDeCategoria({ acao: 'renomear', alvo: { id: 'cat-carro' }, nome: 'Carro' }, DONO).erro, /já se chama/);
  assert.match(montarPedidoDeCategoria({ acao: 'renomear', alvo: { id: 'cat-carro' }, nome: 'Outras despesas' }, DONO).erro, /Já existe/);
  assert.match(montarPedidoDeCategoria({ acao: 'renomear', alvo: { id: 'cat-carro' }, nome: null }, DONO).erro, /Diga o nome novo/);
});

test('excluir: card com a categoria; padrão do app, inexistente ou sem permissão não abre card', () => {
  const pedido = montarPedidoDeCategoria({ acao: 'excluir', alvo: { id: 'cat-carro', name: 'Carro' } }, DONO);
  assert.equal(pedido.texto, 'Vou excluir a categoria Carro. Posso excluir?');
  assert.equal(pedido.card.title, 'Excluir categoria');
  assert.equal(textoDoPedidoFeito(pedido), 'Categoria Carro excluída.');

  assert.match(montarPedidoDeCategoria({ acao: 'excluir', alvo: { id: 'cat-outras' } }, DONO).erro, /categoria padrão do app/);
  assert.match(montarPedidoDeCategoria({ acao: 'excluir', alvo: null }, DONO).erro, /Não encontrei essa categoria/);
  assert.match(montarPedidoDeCategoria({ acao: 'excluir', alvo: { id: 'cat-sumiu' } }, DONO).erro, /Não encontrei/);
  // Membro só mexe na categoria que ele mesmo criou, como na tela.
  assert.equal(montarPedidoDeCategoria({ acao: 'excluir', alvo: { id: 'cat-carro' } }, MEMBRO).erro, undefined);
  assert.match(montarPedidoDeCategoria({ acao: 'excluir', alvo: { id: 'cat-bicos' } }, MEMBRO).erro, /não tem permissão/);
});

test('ação desconhecida pede para dizer de novo', () => {
  assert.match(montarPedidoDeCategoria({ acao: 'mover' }, DONO).erro, /criar, renomear, excluir, ocultar ou mostrar/);
  assert.match(montarPedidoDeCategoria(null, DONO).erro, /criar, renomear, excluir, ocultar ou mostrar/);
});

test('resposta ao card: o verbo da própria ação confirma; outro verbo ou outro nome não', () => {
  const excluir = montarPedidoDeCategoria({ acao: 'excluir', alvo: { id: 'cat-carro' } }, DONO);
  for (const frase of ['pode excluir', 'Sim, pode apagar.', 'apaga', 'pode excluir a categoria Carro', 'Confirmar', 'sim']) {
    assert.equal(respostaAoPedidoDeCategoria(frase, excluir), 'confirm', frase);
  }
  for (const frase of ['Cancelar', 'não']) {
    assert.equal(respostaAoPedidoDeCategoria(frase, excluir), 'cancel', frase);
  }
  for (const frase of ['pode renomear', 'pode excluir a categoria Bicos', 'gastei 50 no mercado']) {
    assert.equal(respostaAoPedidoDeCategoria(frase, excluir), 'input', frase);
  }
  const renomear = montarPedidoDeCategoria({ acao: 'renomear', alvo: { id: 'cat-carro' }, nome: 'Veículo' }, DONO);
  assert.equal(respostaAoPedidoDeCategoria('sim, pode renomear', renomear), 'confirm');
  const criar = montarPedidoDeCategoria({ acao: 'criar', tipo: 'saida', nome: 'Impostos' }, DONO);
  assert.equal(respostaAoPedidoDeCategoria('pode criar', criar), 'confirm');
  assert.equal(respostaAoPedidoDeCategoria('cria impostos', criar), 'confirm');
});

// #267: ocultar e mostrar de novo, como na tela Categorias.
test('ocultar: categoria pelo apelido, padrão pode, genérica não, oculta de novo não', () => {
  const comPadrao = [...CATEGORIAS, { id: 'cat-lazer', name: 'Lazer', category_type: 'expense', is_system: true, workspace_id: null }];
  const contexto = { ...DONO, categorias: comPadrao, ocultas: ['cat-bicos'] };
  const pedido = montarPedidoDeCategoria({ acao: 'ocultar', alvo: { id: 'cat-lazer' }, nome: null }, contexto);
  assert.equal(pedido.categoria.id, 'cat-lazer');
  assert.equal(pedido.card.title, 'Ocultar categoria');
  assert.match(pedido.texto, /^Vou ocultar a categoria Lazer\. Ela sai das escolhas e das sugestões/);
  assert.match(textoDoPedidoFeito(pedido), /diga "mostra a categoria Lazer"/);
  assert.match(montarPedidoDeCategoria({ acao: 'ocultar', alvo: { id: 'cat-outras' } }, contexto).erro, /genérica do app/);
  assert.match(montarPedidoDeCategoria({ acao: 'ocultar', alvo: { id: 'cat-bicos' } }, contexto).erro, /já está oculta/);
  assert.match(montarPedidoDeCategoria({ acao: 'ocultar', alvo: { id: 'cat-carro' } }, { ...contexto, papel: {} }).erro, /permissão/);
});

test('mostrar de novo: acha a oculta pelo nome dito', () => {
  const contexto = { ...DONO, ocultas: ['cat-bicos'] };
  const pedido = montarPedidoDeCategoria({ acao: 'reexibir', alvo: null, nome: 'bicos' }, contexto);
  assert.equal(pedido.categoria.id, 'cat-bicos');
  assert.equal(pedido.card.title, 'Mostrar categoria');
  assert.equal(textoDoPedidoFeito(pedido), 'Categoria Bicos de volta nas escolhas.');
  assert.match(montarPedidoDeCategoria({ acao: 'reexibir', nome: 'Carro' }, contexto).erro, /Carro já aparece nas escolhas/);
  assert.match(montarPedidoDeCategoria({ acao: 'ocultar', alvo: null, nome: 'Bicos' }, contexto).erro, /Bicos já está oculta/);
  assert.match(montarPedidoDeCategoria({ acao: 'reexibir', nome: 'Viagem' }, contexto).erro, /Não encontrei essa categoria/);
  assert.equal(respostaAoPedidoDeCategoria('pode mostrar', pedido), 'confirm');
});
