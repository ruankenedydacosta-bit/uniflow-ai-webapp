import assert from 'node:assert/strict';
import test from 'node:test';

import {
  acharPrevisto,
  janelaDosPrevistos,
  mudancasDaConfirmacao,
  podeSerConfirmacaoDePrevisto,
} from './confirmacaoDePrevisto.js';
import { montarAlteracao, textoDaAlteracao, textoDaAlteracaoFeita } from './edicaoDeLancamento.js';

const HOJE = '2026-10-14';
const previsto = (campos) => ({
  id: 'p1',
  status: 'pending',
  transaction_type: 'expense',
  description: 'Aluguel',
  amount: 1500,
  transaction_date: '2026-10-10',
  ...campos,
});
const saida = (campos) => ({ tipo: 'saida', valor: null, data: HOJE, descricao: 'Aluguel', parcelas: null, recorrente: false, ...campos });

test('janela vai de 45 dias atrás a 10 dias à frente', () => {
  assert.deepEqual(janelaDosPrevistos(HOJE), { dateFrom: '2026-08-30', dateTo: '2026-10-24' });
});

test('só saída ou entrada única, já acontecida e com descrição pode confirmar previsto', () => {
  assert.equal(podeSerConfirmacaoDePrevisto(saida(), 'já paguei o aluguel', HOJE), true);
  assert.equal(podeSerConfirmacaoDePrevisto(saida({ tipo: 'entrada', descricao: 'Salário' }), 'o salário caiu', HOJE), true);
  assert.equal(podeSerConfirmacaoDePrevisto(saida(), 'vou pagar o aluguel', HOJE), false, 'fala de futuro');
  assert.equal(podeSerConfirmacaoDePrevisto(saida({ data: '2026-10-20' }), 'aluguel dia 20', HOJE), false, 'data futura');
  assert.equal(podeSerConfirmacaoDePrevisto(saida({ parcelas: 3 }), 'paguei o aluguel em 3x', HOJE), false);
  assert.equal(podeSerConfirmacaoDePrevisto(saida({ recorrente: true }), 'aluguel todo mês', HOJE), false);
  assert.equal(podeSerConfirmacaoDePrevisto(saida({ tipo: 'transferencia' }), 'passei o aluguel', HOJE), false);
  assert.equal(podeSerConfirmacaoDePrevisto(saida({ descricao: '' }), 'paguei 50', HOJE), false);
});

test('acha o previsto do mesmo tipo pela descrição, dentro da janela', () => {
  const lista = [
    previsto(),
    previsto({ id: 'p2', transaction_type: 'income', description: 'Aluguel recebido' }),
    previsto({ id: 'p3', transaction_date: '2026-12-10' }),
    previsto({ id: 'p4', description: 'Mercado' }),
    previsto({ id: 'p5', status: 'completed' }),
  ];
  const resultado = acharPrevisto(saida(), lista, { referenceDate: HOJE });
  assert.equal(resultado.tipo, 'unico');
  assert.equal(resultado.transacao.id, 'p1');
  assert.equal(acharPrevisto(saida({ descricao: 'Academia' }), lista, { referenceDate: HOJE }).tipo, 'nenhum');
});

test('vários previstos parecidos vêm do mais perto de hoje para o mais longe', () => {
  const lista = [
    previsto({ id: 'setembro', transaction_date: '2026-09-10' }),
    previsto({ id: 'outubro', transaction_date: '2026-10-10' }),
  ];
  const resultado = acharPrevisto(saida(), lista, { referenceDate: HOJE });
  assert.equal(resultado.tipo, 'varios');
  assert.deepEqual(resultado.candidatos.map((item) => item.id), ['outubro', 'setembro']);
});

test('confirmação marca como realizado na data dita, ou hoje, e leva o valor dito', () => {
  assert.deepEqual(mudancasDaConfirmacao(saida(), HOJE), { confirmar: true, date: HOJE });
  assert.deepEqual(mudancasDaConfirmacao(saida({ data: '2026-10-13', valor: 1550 }), HOJE), { confirmar: true, date: '2026-10-13', amount: 1550 });

  const transacao = previsto();
  const { alteracoes, campos } = montarAlteracao(transacao, mudancasDaConfirmacao(saida({ valor: 1550 }), HOJE), { referenceDate: HOJE });
  assert.deepEqual(alteracoes, { amount: 1550, transaction_date: HOJE, status: 'completed' });
  assert.equal(
    textoDaAlteracao(transacao, campos).replace(/\u00a0/g, ' '),
    'Aluguel, de R$ 1.500,00, estava previsto para 10/10/2026. Vou marcar como pago em 14/10/2026, com valor R$ 1.550,00. Posso confirmar?',
  );
  assert.equal(textoDaAlteracaoFeita(transacao, campos), 'Pronto, marquei Aluguel como pago.');
});

test('parcela prevista pode ser confirmada; lançamento já realizado não', () => {
  const parcela = previsto({ installment_total: 10, metadata: { installment_group_id: 'g1' } });
  assert.equal(montarAlteracao(parcela, { confirmar: true, date: HOJE }, { referenceDate: HOJE }).erro, undefined);
  assert.equal(
    montarAlteracao(previsto({ status: 'completed' }), { confirmar: true, date: HOJE }, { referenceDate: HOJE }).erro,
    'Esse lançamento já está realizado.',
  );
});
