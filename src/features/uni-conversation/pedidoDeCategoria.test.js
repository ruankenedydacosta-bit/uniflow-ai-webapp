import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTION_KIND_CATEGORIA,
  montarPedidoDeCategoria,
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
  assert.match(montarPedidoDeCategoria({ acao: 'mover' }, DONO).erro, /criar, renomear ou excluir/);
  assert.match(montarPedidoDeCategoria(null, DONO).erro, /criar, renomear ou excluir/);
});
