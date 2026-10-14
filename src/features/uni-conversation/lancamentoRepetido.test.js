import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acharLancamentoRepetido,
  deveProcurarRepetido,
  assinaturaDoRascunho,
  linhaDoRepetido,
  textoDoRepetido,
} from './lancamentoRepetido.js';
import { formatCurrency } from '../../utils/formatters.js';

const rascunho = (payload = {}, campos = {}) => ({
  status: 'ready',
  clientOperationId: 'op-1',
  payload: {
    transaction_type: 'expense',
    category_id: 'cat-escola',
    description: 'Mensalidade escolar',
    amount: 300,
    transaction_date: '2026-10-13',
    ...payload,
  },
  ...campos,
});
const existente = (campos = {}) => ({
  id: 't1',
  status: 'completed',
  transaction_type: 'expense',
  category_id: 'cat-escola',
  description: 'Mensalidade escolar',
  amount: '300.00',
  transaction_date: '2026-10-13',
  account_id: null,
  ...campos,
});

test('rascunho corrigido tem outra assinatura; o mesmo rascunho, a mesma', () => {
  assert.equal(assinaturaDoRascunho(rascunho()), assinaturaDoRascunho(rascunho()));
  assert.notEqual(assinaturaDoRascunho(rascunho()), assinaturaDoRascunho(rascunho({ amount: 350 })));
  assert.notEqual(assinaturaDoRascunho(rascunho()), assinaturaDoRascunho(rascunho({ transaction_date: '2026-10-14' })));
});

test('só procura em saída ou entrada pronta, com valor, data e id da operação', () => {
  assert.equal(deveProcurarRepetido(rascunho()), true);
  assert.equal(deveProcurarRepetido(rascunho({ transaction_type: 'income' })), true);
  assert.equal(deveProcurarRepetido(rascunho({ transaction_type: 'transfer' })), false);
  assert.equal(deveProcurarRepetido(rascunho({ transaction_type: 'adjustment' })), false);
  assert.equal(deveProcurarRepetido(rascunho({}, { status: 'needs_clarification' })), false);
  assert.equal(deveProcurarRepetido(rascunho({}, { clientOperationId: null })), false);
  assert.equal(deveProcurarRepetido(rascunho({ transaction_date: null })), false);
  assert.equal(deveProcurarRepetido(rascunho({}, { installments: { count: 12 } })), false, 'parcelado');
  assert.equal(deveProcurarRepetido(rascunho({}, { recurrence: { frequency: 'monthly' } })), false, 'recorrente');
  assert.equal(deveProcurarRepetido(null), false);
});

test('acha o lançamento com mesmo tipo, valor e categoria na mesma data', () => {
  assert.equal(acharLancamentoRepetido(rascunho(), [existente()])?.id, 't1');
});

test('acha pela descrição quando a categoria é outra ou falta', () => {
  const semCategoria = rascunho({ category_id: null, description: 'mensalidade ESCOLAR' });
  assert.equal(acharLancamentoRepetido(semCategoria, [existente({ category_id: 'cat-outra' })])?.id, 't1');
});

test('previsto conta como lançamento existente', () => {
  assert.equal(acharLancamentoRepetido(rascunho(), [existente({ status: 'pending' })])?.id, 't1');
});

test('não acusa valor, tipo, categoria e descrição diferentes, nem cancelado', () => {
  assert.equal(acharLancamentoRepetido(rascunho(), [existente({ amount: '300.01' })]), null, 'valor');
  assert.equal(acharLancamentoRepetido(rascunho(), [existente({ transaction_type: 'income' })]), null, 'tipo');
  assert.equal(
    acharLancamentoRepetido(rascunho(), [existente({ category_id: 'cat-outra', description: 'Curso de inglês' })]),
    null,
    'categoria e descrição',
  );
  assert.equal(acharLancamentoRepetido(rascunho(), [existente({ status: 'canceled' })]), null, 'cancelado');
});

test('só o mesmo dia conta: o gasto de ontem e a mensalidade do mês anterior não são repetição', () => {
  assert.equal(acharLancamentoRepetido(rascunho(), [existente({ transaction_date: '2026-09-13' })]), null);
  assert.equal(acharLancamentoRepetido(rascunho(), [existente({ transaction_date: '2026-10-12' })]), null);
  assert.equal(acharLancamentoRepetido(rascunho(), [existente({ transaction_date: '2026-10-14' })]), null);
});

test('conta diferente dos dois lados não é repetição; conta faltando de um lado é', () => {
  const noCartao = rascunho({ account_id: 'cartao' });
  assert.equal(acharLancamentoRepetido(noCartao, [existente({ account_id: 'pix' })]), null);
  assert.equal(acharLancamentoRepetido(noCartao, [existente({ account_id: 'cartao' })])?.id, 't1');
  assert.equal(acharLancamentoRepetido(noCartao, [existente({ account_id: null })])?.id, 't1');
  assert.equal(acharLancamentoRepetido(rascunho(), [existente({ account_id: 'pix' })])?.id, 't1');
});

test('previsto é dito como previsto: "já existe" sozinho faria pensar que foi pago', () => {
  const previsto = existente({ status: 'pending' });
  assert.match(textoDoRepetido(previsto), /, 13\/10\/2026, previsto\. Confirme/);
  assert.match(linhaDoRepetido(previsto).value, /, previsto$/);
});

test('texto e linha do card descrevem o lançamento que já existe', () => {
  const accounts = [{ id: 'nu', name: 'Nubank' }];
  const valor = formatCurrency(300);
  const transacao = existente({ account_id: 'nu' });
  assert.equal(
    textoDoRepetido(transacao, { accounts }),
    `Parece que esse lançamento já existe: Mensalidade escolar, ${valor}, Nubank, 13/10/2026. `
      + 'Confirme para lançar de novo ou cancele.',
  );
  assert.deepEqual(linhaDoRepetido(transacao, { accounts }), {
    key: 'repeated',
    label: 'Já existe',
    value: `Mensalidade escolar, ${valor}, Nubank, 13/10/2026`,
  });
});
