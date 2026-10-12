import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TIPOS_DE_CONTA,
  ehContaDoOpenFinance,
  lancamentosDaConta,
  montarListaDeContas,
  permissoesDaConta,
  resumoDaConta,
  rotuloDoTipo,
  saldoDaConta,
  sinalDoLancamento,
} from './contasOrganizar.js';

const contas = [
  { id: 'c1', name: 'Nubank', account_type: 'checking', initial_balance: 100, source_type: 'manual' },
  { id: 'c2', name: 'Carteira', account_type: 'cash', initial_balance: 50, source_type: 'manual' },
  { id: 'c3', name: 'Cartão Inter', account_type: 'credit_card', initial_balance: 0, source_type: 'manual' },
  { id: 'c4', name: 'Antiga', account_type: 'savings', initial_balance: 999, is_active: false },
  { id: 'c5', name: 'Itaú', account_type: 'checking', initial_balance: 0, source_type: 'open_finance' },
];

test('montarListaDeContas: contas ativas em ordem alfabética, cartões separados, total só das contas', () => {
  const lista = montarListaDeContas({
    accounts: contas,
    balances: [{ account_id: 'c1', derived_balance: '250.5' }, { account_id: 'c3', derived_balance: -80 }],
  });
  assert.deepEqual(lista.contas.map((c) => c.name), ['Carteira', 'Itaú', 'Nubank']);
  assert.deepEqual(lista.cartoes.map((c) => c.name), ['Cartão Inter']);
  assert.equal(lista.contas.find((c) => c.id === 'c1').saldo, 250.5);
  assert.equal(lista.contas.find((c) => c.id === 'c2').saldo, 50);
  assert.equal(lista.cartoes[0].saldo, -80);
  assert.equal(lista.total, 300.5);
  assert.equal(lista.contas.find((c) => c.id === 'c5').openFinance, true);
  assert.equal(lista.contas.find((c) => c.id === 'c1').tipoRotulo, 'Conta corrente');
});

test('montarListaDeContas aceita entradas vazias', () => {
  assert.deepEqual(montarListaDeContas({ accounts: null, balances: undefined }), { contas: [], cartoes: [], total: 0 });
});

test('saldoDaConta usa o saldo derivado e cai no inicial sem RPC', () => {
  assert.equal(saldoDaConta(contas[0], []), 100);
  assert.equal(saldoDaConta(contas[0], [{ account_id: 'c1', derived_balance: 0 }]), 0);
});

test('rotuloDoTipo cobre os 7 tipos e cai em "Outra conta" para valor desconhecido', () => {
  assert.equal(rotuloDoTipo('digital_wallet'), 'Carteira digital');
  assert.equal(rotuloDoTipo('inexistente'), 'Outra conta');
});

test('a folha de nova conta não oferece cartão de crédito (fica para a folha própria)', () => {
  assert.ok(!TIPOS_DE_CONTA.includes('credit_card'));
  assert.equal(TIPOS_DE_CONTA.length, 6);
});

test('conta do Open Finance não edita, não ajusta saldo nem exclui, mesmo com permissão', () => {
  assert.equal(ehContaDoOpenFinance(contas[4]), true);
  assert.deepEqual(
    permissoesDaConta(contas[4], { canUpdate: true, canDelete: true }),
    { editar: false, ajustarSaldo: false, excluir: false },
  );
});

test('conta manual segue o papel no espaço; papel carregando nega tudo', () => {
  assert.deepEqual(
    permissoesDaConta(contas[0], { canUpdate: true, canDelete: false }),
    { editar: true, ajustarSaldo: true, excluir: false },
  );
  assert.deepEqual(
    permissoesDaConta(contas[0], { canUpdate: true, canDelete: true, isLoading: true }),
    { editar: false, ajustarSaldo: false, excluir: false },
  );
  assert.deepEqual(permissoesDaConta(null, { canUpdate: true }), { editar: false, ajustarSaldo: false, excluir: false });
});

const lancamentos = [
  { id: 't1', account_id: 'c1', transaction_type: 'income', amount: 1000, status: 'completed', transaction_date: '2026-10-02' },
  { id: 't2', account_id: 'c1', transaction_type: 'expense', amount: 200, status: 'completed', transaction_date: '2026-10-05' },
  { id: 't3', account_id: 'c2', destination_account_id: 'c1', transaction_type: 'transfer', amount: 50, status: 'completed', transaction_date: '2026-10-07' },
  { id: 't4', account_id: 'c1', destination_account_id: 'c2', transaction_type: 'transfer', amount: 30, status: 'completed', transaction_date: '2026-10-01' },
  { id: 't5', account_id: 'c1', transaction_type: 'adjustment', amount: 10, adjustment_delta: -10, status: 'completed', transaction_date: '2026-10-08' },
  { id: 't6', account_id: 'c1', transaction_type: 'expense', amount: 999, status: 'pending', transaction_date: '2026-10-09' },
  { id: 't7', account_id: null, transaction_type: 'expense', amount: 5, status: 'completed', transaction_date: '2026-10-09' },
];

test('lancamentosDaConta pega origem e destino, só concluídos, do mais recente ao mais antigo', () => {
  assert.deepEqual(lancamentosDaConta(lancamentos, 'c1').map((t) => t.id), ['t5', 't3', 't2', 't1', 't4']);
  assert.deepEqual(lancamentosDaConta(lancamentos, 'c2').map((t) => t.id), ['t3', 't4']);
});

test('sinalDoLancamento: entrada e transferência recebida somam; saída, transferência enviada e ajuste negativo subtraem', () => {
  assert.equal(sinalDoLancamento(lancamentos[0], 'c1'), 1);
  assert.equal(sinalDoLancamento(lancamentos[1], 'c1'), -1);
  assert.equal(sinalDoLancamento(lancamentos[2], 'c1'), 1);
  assert.equal(sinalDoLancamento(lancamentos[2], 'c2'), -1);
  assert.equal(sinalDoLancamento(lancamentos[3], 'c1'), -1);
  assert.equal(sinalDoLancamento(lancamentos[4], 'c1'), -1);
});

test('resumoDaConta soma entradas e saídas do mês pela conta', () => {
  assert.deepEqual(resumoDaConta(lancamentos, 'c1'), { entradas: 1050, saidas: 240, quantidade: 5 });
  assert.deepEqual(resumoDaConta(lancamentos, 'c9'), { entradas: 0, saidas: 0, quantidade: 0 });
});
