import assert from 'node:assert/strict';
import test from 'node:test';

import { montarPedidoDeConta } from './pedidoDeConta.js';

const WS = 'ws-1';
const CONTAS = [
  { id: 'k-nu', name: 'Nubank', workspace_id: WS, is_active: true, account_type: 'checking' },
  { id: 'k-cx', name: 'Caixa', workspace_id: WS, is_active: false, account_type: 'savings' },
  { id: 'k-of', name: 'Itaú', workspace_id: WS, is_active: true, account_type: 'checking', source_type: 'open_finance' },
];
const PODE = { canUpdate: true };
const montar = (pedido) => montarPedidoDeConta({ alvo: null, nome: null, accountType: null, ...pedido }, { contas: CONTAS, papel: PODE, workspaceId: WS });

test('criar: nome limpo, tipo padrão conta corrente e saldo zero', () => {
  const pronto = montar({ acao: 'criar', nome: 'conta do Inter' });
  assert.deepEqual(pronto.chamada, { valores: { name: 'Inter', account_type: 'checking' }, contaId: null });
  assert.equal(pronto.texto, 'Vou criar a conta Inter, do tipo conta corrente, com saldo zero. Posso criar?');
  assert.equal(montar({ acao: 'criar', nome: 'Reserva', accountType: 'savings' }).chamada.valores.account_type, 'savings');
});

test('criar: cartão vai para a tela; nome repetido ou arquivado não cria', () => {
  assert.match(montar({ acao: 'criar', nome: 'Nubank Roxinho', accountType: 'credit_card' }).erro, /Crie o cartão na tela Contas/);
  assert.match(montar({ acao: 'criar', nome: 'nubank' }).erro, /A conta Nubank já existe/);
  assert.match(montar({ acao: 'criar', nome: 'Caixa' }).erro, /arquivada\. Para voltar a usar, diga "reativa a conta Caixa"/);
  assert.equal(montar({ acao: 'criar', nome: '' }).erro, 'Diga o nome da conta nova. Por exemplo: "cria a conta Inter".');
});

test('renomear pelo apelido ou pelo nome dito, sem repetir nome', () => {
  const pronto = montar({ acao: 'renomear', alvo: { id: 'k-nu', name: 'Nubank' }, nome: 'Nubank PJ' });
  assert.deepEqual(pronto.chamada, { valores: { name: 'Nubank PJ' }, contaId: 'k-nu' });
  assert.match(montar({ acao: 'renomear', alvo: { id: 'k-nu', name: 'Nubank' }, nome: 'Caixa' }).erro, /arquivada/);
  assert.match(montar({ acao: 'renomear', alvo: { id: 'k-nu', name: 'Nubank' }, nome: 'nubank' }).erro, /já se chama/);
});

test('arquivar só conta ativa; Open Finance só pela tela', () => {
  assert.deepEqual(montar({ acao: 'arquivar', alvo: { id: 'k-nu', name: 'Nubank' } }).chamada, { valores: { is_active: false }, contaId: 'k-nu' });
  assert.match(montar({ acao: 'arquivar', alvo: { id: 'k-of', name: 'Itaú' } }).erro, /Open Finance/);
  assert.match(montar({ acao: 'arquivar', nome: 'Caixa' }).erro, /entre as ativas/);
});

test('reativar acha a conta arquivada pelo nome dito', () => {
  assert.deepEqual(montar({ acao: 'reativar', nome: 'conta da Caixa' }).chamada, { valores: { is_active: true }, contaId: 'k-cx' });
  assert.match(montar({ acao: 'reativar', nome: 'Nubank' }).erro, /entre as arquivadas/);
});

test('sem permissão, nenhuma ação', () => {
  assert.match(montarPedidoDeConta({ acao: 'criar', nome: 'Inter' }, { contas: CONTAS, papel: {}, workspaceId: WS }).erro, /permissão/);
});
