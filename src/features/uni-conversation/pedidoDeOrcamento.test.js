import assert from 'node:assert/strict';
import test from 'node:test';

import { gastoDaCategoria, montarPedidoDeOrcamento, respostaDaConsultaDeOrcamento } from './pedidoDeOrcamento.js';

const semNbsp = (texto) => texto.replace(/\u00a0/g, ' ');
const LAZER = { id: 'cat-lazer', name: 'Lazer' };
const MERCADO = { id: 'cat-mercado', name: 'Mercado' };
const ORCAMENTOS = [{ category_id: 'cat-lazer', monthly_limit: 500 }];
const TRANSACOES = [
  { status: 'completed', transaction_type: 'expense', category_id: 'cat-lazer', amount: 320.5 },
  { status: 'completed', transaction_type: 'expense', category_id: 'cat-lazer', amount: 100 },
  { status: 'pending', transaction_type: 'expense', category_id: 'cat-lazer', amount: 900 },
  { status: 'completed', transaction_type: 'expense', category_id: 'cat-mercado', amount: 80 },
];
const PODE = { canUpdate: true };

test('gasto do mês soma só saídas realizadas da categoria', () => {
  assert.equal(gastoDaCategoria(TRANSACOES, 'cat-lazer'), 420.5);
});

test('definir teto novo, mudar o existente e recusar o mesmo valor', () => {
  const novo = montarPedidoDeOrcamento({ acao: 'definir', categoria: MERCADO, valor: 600 }, { orcamentos: ORCAMENTOS, papel: PODE });
  assert.deepEqual(novo.chamada, { acao: 'definir', categoriaId: 'cat-mercado', valor: 600 });
  assert.equal(semNbsp(novo.texto), 'Vou definir um teto de R$ 600,00 por mês para Mercado. Posso confirmar?');
  assert.equal(novo.card.title, 'Definir teto de gasto');

  const mudar = montarPedidoDeOrcamento({ acao: 'definir', categoria: LAZER, valor: 700 }, { orcamentos: ORCAMENTOS, papel: PODE });
  assert.equal(mudar.card.title, 'Alterar teto de gasto');
  assert.match(semNbsp(mudar.texto), /de R\$ 500,00 para R\$ 700,00/);

  assert.match(montarPedidoDeOrcamento({ acao: 'definir', categoria: LAZER, valor: 500 }, { orcamentos: ORCAMENTOS, papel: PODE }).erro, /Nada mudou/);
});

test('remover só quando há teto; sem permissão, nada', () => {
  const remover = montarPedidoDeOrcamento({ acao: 'remover', categoria: LAZER }, { orcamentos: ORCAMENTOS, papel: PODE });
  assert.deepEqual(remover.chamada, { acao: 'remover', categoriaId: 'cat-lazer' });
  assert.match(montarPedidoDeOrcamento({ acao: 'remover', categoria: MERCADO }, { orcamentos: ORCAMENTOS, papel: PODE }).erro, /não tem teto/);
  assert.match(montarPedidoDeOrcamento({ acao: 'remover', categoria: LAZER }, { orcamentos: ORCAMENTOS, papel: {} }).erro, /permissão/);
});

test('consulta de uma categoria diz quanto falta, se passou ou que não tem teto', () => {
  const contexto = { orcamentos: ORCAMENTOS, transacoes: TRANSACOES };
  assert.equal(
    semNbsp(respostaDaConsultaDeOrcamento({ acao: 'consultar', categoria: LAZER }, contexto)),
    'Neste mês, Lazer: R$ 420,50 de R$ 500,00, faltam R$ 79,50.',
  );
  assert.match(
    semNbsp(respostaDaConsultaDeOrcamento({ acao: 'consultar', categoria: LAZER }, { ...contexto, orcamentos: [{ category_id: 'cat-lazer', monthly_limit: 400 }] })),
    /passou R\$ 20,50/,
  );
  assert.match(semNbsp(respostaDaConsultaDeOrcamento({ acao: 'consultar', categoria: MERCADO }, contexto)), /^Mercado não tem teto mensal\. Neste mês você gastou R\$ 80,00\./);
});

test('consulta geral lista todos os tetos; sem nenhum, ensina a definir', () => {
  const geral = respostaDaConsultaDeOrcamento({ acao: 'consultar', categoria: null }, {
    orcamentos: ORCAMENTOS, categorias: [LAZER, MERCADO], transacoes: TRANSACOES,
  });
  assert.match(semNbsp(geral), /^Seus tetos neste mês:\nLazer: R\$ 420,50 de R\$ 500,00/);
  assert.match(respostaDaConsultaDeOrcamento({ acao: 'consultar', categoria: null }, { categorias: [LAZER] }), /ainda não tem teto/);
});
