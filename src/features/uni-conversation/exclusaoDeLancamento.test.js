import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTION_KIND_EXCLUSAO,
  alvoDaExclusao,
  camposParaRecriar,
  cardDaExclusao,
  ehPedidoDeDesfazer,
  motivoDeBloqueioDaExclusao,
  respostaAoPedidoDeExclusao,
  textoDaExclusao,
  textoDaExclusaoDesfeita,
  textoDaExclusaoFeita,
} from './exclusaoDeLancamento.js';

const semNbsp = (texto) => texto.replace(/\u00a0/g, ' ');

const contas = [{ id: 'nubank', name: 'Nubank', is_active: true }, { id: 'itau', name: 'Itaú', is_active: true }];
const categorias = [{ id: 'transporte', name: 'Transporte', category_type: 'expense' }];
const contexto = { accounts: contas, categories: categorias, workspaceId: 'ws', referenceDate: '2026-10-08' };

const uber = {
  id: 't1',
  workspace_id: 'ws',
  description: 'Uber',
  amount: 25,
  transaction_type: 'expense',
  transaction_date: '2026-10-07',
  account_id: 'nubank',
  category_id: 'transporte',
  status: 'completed',
  payment_method: 'pix',
  notes: null,
  metadata: { origem: 'voz' },
  created_at: '2026-10-07T12:00:00Z',
  updated_at: '2026-10-07T12:00:00Z',
  source_type: 'manual',
};

test('alvo: o que o modelo leu (data, valor, conta) vale mais que a regex; as palavras vêm do texto', () => {
  const alvo = alvoDaExclusao({ alvo: 'Uber', data: '2026-10-07', valor: null, conta: { id: 'nubank', name: 'Nubank' } }, contexto);
  assert.deepEqual(alvo, { data: '2026-10-07', valor: null, contaId: 'nubank', palavras: ['uber'], criterios: 3 });

  // Sem nada do modelo, a regex do texto ainda lê data e valor.
  const porTexto = alvoDaExclusao({ alvo: 'mercado de ontem de 85 reais', data: null, valor: null, conta: null }, contexto);
  assert.equal(porTexto.data, '2026-10-07');
  assert.equal(porTexto.valor, 85);
  assert.deepEqual(porTexto.palavras, ['mercado']);

  assert.equal(alvoDaExclusao({ alvo: null, data: null, valor: null, conta: null }, contexto).criterios, 0);
  assert.equal(alvoDaExclusao(null, contexto).criterios, 0);
});

test('card e texto: o que vai sair, com valor em destaque, data, conta e categoria', () => {
  assert.deepEqual(cardDaExclusao(uber, contexto), {
    title: 'Excluir lançamento',
    status: 'pending',
    actionKind: ACTION_KIND_EXCLUSAO,
    editable: false,
    rows: [
      { key: 'delete-target', label: 'Lançamento', value: 'Uber' },
      { key: 'delete-amount', label: 'Valor', value: cardDaExclusao(uber, contexto).rows[1].value, emphasis: true },
      { key: 'delete-date', label: 'Data', value: '07/10/2026' },
      { key: 'delete-account', label: 'Conta', value: 'Nubank' },
      { key: 'delete-category', label: 'Categoria', value: 'Transporte' },
    ],
  });
  assert.equal(semNbsp(cardDaExclusao(uber, contexto).rows[1].value), 'R$ 25,00');
  assert.equal(semNbsp(textoDaExclusao(uber, contexto)), 'Vou excluir Uber, R$ 25,00, Nubank, 07/10/2026. Posso excluir?');
  assert.equal(textoDaExclusaoFeita(uber), 'Pronto, excluí Uber de 07/10/2026. Se foi engano, diga desfazer nos próximos 20 segundos.');
  assert.equal(textoDaExclusaoDesfeita({ ...uber, description: '' }), 'Pronto, a despesa de 07/10/2026 voltou como estava.');
});

test('bloqueio: transferência, ajuste, parcela, importado e cancelado não saem pela conversa', () => {
  assert.equal(motivoDeBloqueioDaExclusao(uber), null);
  assert.equal(motivoDeBloqueioDaExclusao(null), 'Não encontrei esse lançamento.');
  assert.match(motivoDeBloqueioDaExclusao({ ...uber, status: 'canceled' }), /já está cancelado/);
  assert.match(motivoDeBloqueioDaExclusao({ ...uber, transaction_type: 'transfer' }), /Transferências só podem ser excluídas/);
  assert.match(motivoDeBloqueioDaExclusao({ ...uber, transaction_type: 'adjustment' }), /Ajustes de saldo/);
  assert.match(motivoDeBloqueioDaExclusao({ ...uber, installment_total: 3 }), /parcela/);
  assert.match(motivoDeBloqueioDaExclusao({ ...uber, source_type: 'open_finance' }), /importação/);
});

test('resposta ao card: o verbo de excluir confirma, com ou sem o nome; outro assunto não', () => {
  for (const frase of ['pode excluir', 'Apaga sim.', 'exclui o Uber', 'sim, pode apagar esse', 'tira ele', 'confirmar', 'pode deletar']) {
    assert.equal(respostaAoPedidoDeExclusao(frase, uber), 'confirm', frase);
  }
  for (const frase of ['não', 'cancelar', 'deixa pra lá']) {
    assert.equal(respostaAoPedidoDeExclusao(frase, uber), 'cancel', frase);
  }
  for (const frase of ['apaga o mercado', 'gastei 50 no mercado', 'quanto gastei esse mês?']) {
    assert.equal(respostaAoPedidoDeExclusao(frase, uber), 'input', frase);
  }
});

test('pedido de desfazer: variações faladas; frases com outro conteúdo não', () => {
  for (const frase of ['desfazer', 'Desfaz isso', 'não, volta o lançamento', 'cancela a exclusão', 'ops, desfaz aí', 'pode desfazer por favor', 'restaura']) {
    assert.equal(ehPedidoDeDesfazer(frase), true, frase);
  }
  for (const frase of ['desfaz o Uber de ontem', 'volta 50 reais pro Nubank', 'cancelar', '', null]) {
    assert.equal(ehPedidoDeDesfazer(frase), false, String(frase));
  }
});

test('recriar: só os campos que o createTransaction aceita, sem id, datas de sistema nem origem externa', () => {
  assert.deepEqual(camposParaRecriar(uber), {
    account_id: 'nubank',
    category_id: 'transporte',
    transaction_type: 'expense',
    description: 'Uber',
    amount: 25,
    transaction_date: '2026-10-07',
    status: 'completed',
    payment_method: 'pix',
    metadata: { origem: 'voz' },
  });
});

test('Desfazer recria o lançamento fora da série recorrente (#222)', () => {
  const campos = camposParaRecriar({
    transaction_type: 'expense', amount: 1500, description: 'Aluguel', transaction_date: '2026-11-05',
    is_recurring: true, metadata: { recurring_series_id: 'serie-1', auto_confirm: true },
  });
  assert.deepEqual(campos.metadata, { auto_confirm: true });
});
