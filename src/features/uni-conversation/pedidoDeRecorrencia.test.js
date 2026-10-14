import assert from 'node:assert/strict';
import test from 'node:test';

import { localizarSerie, montarPedidoDeRecorrencia } from './pedidoDeRecorrencia.js';

const HOJE = '2026-10-14';
const CATEGORIAS = [
  { id: 'cat-lazer', name: 'Lazer', category_type: 'expense' },
  { id: 'cat-saude', name: 'Saúde', category_type: 'expense' },
  { id: 'cat-sal', name: 'Salário', category_type: 'income' },
];
const CONTAS = [
  { id: 'conta-nu', name: 'Nubank' },
  { id: 'conta-it', name: 'Itaú' },
];
const previsto = (id, data, campos = {}) => ({
  id,
  status: 'pending',
  transaction_type: 'expense',
  description: 'Academia',
  amount: 120,
  category_id: 'cat-saude',
  account_id: 'conta-nu',
  transaction_date: data,
  metadata: { recurring_series_id: 'serie-academia' },
  ...campos,
});
const LISTA = [
  previsto('a3', '2026-12-05'),
  previsto('a1', '2026-10-05'),
  previsto('a2', '2026-11-05'),
  previsto('s1', '2026-11-01', { description: 'Spotify', metadata: { recurring_series_id: 'serie-spotify' } }),
  previsto('avulso', '2026-11-10', { metadata: {} }),
];

test('acha a série pelas palavras e começa no primeiro previsto a partir de hoje', () => {
  const achado = localizarSerie('Academia', LISTA, { referenceDate: HOJE });
  assert.equal(achado.tipo, 'unico');
  assert.equal(achado.serie.id, 'serie-academia');
  assert.equal(achado.serie.primeiro.id, 'a2');
  assert.equal(achado.serie.quantos, 2);
});

test('a partir de uma data citada, começa nela', () => {
  const achado = localizarSerie('academia', LISTA, { referenceDate: HOJE, aPartirDe: '2026-12-01' });
  assert.equal(achado.serie.primeiro.id, 'a3');
  assert.equal(achado.serie.quantos, 1);
});

test('lançamento avulso não é série; nome que não bate não acha nada', () => {
  assert.equal(localizarSerie('Netflix', LISTA, { referenceDate: HOJE }).tipo, 'nenhum');
  assert.equal(localizarSerie('', LISTA, { referenceDate: HOJE }).tipo, 'nenhum');
  const duas = [...LISTA, previsto('b1', '2026-11-07', { description: 'Academia da Ana', metadata: { recurring_series_id: 'serie-ana' } })];
  assert.equal(localizarSerie('Academia', duas, { referenceDate: HOJE }).tipo, 'varios');
});

test('encerrar apaga este e os próximos pela RPC da tela', () => {
  const { serie } = localizarSerie('Academia', LISTA, { referenceDate: HOJE });
  const pronto = montarPedidoDeRecorrencia({ acao: 'encerrar' }, serie);
  assert.deepEqual(pronto.chamada, { rpc: 'excluir', transacaoId: 'a2', escopo: 'forward' });
  assert.match(pronto.texto, /^Vou encerrar Academia: 2 lançamentos previstos a partir de 05\/11\/2026 saem/);
  assert.equal(pronto.card.title, 'Encerrar recorrência');
});

test('editar manda o modelo inteiro com o que muda, como o formulário da tela', () => {
  const { serie } = localizarSerie('Academia', LISTA, { referenceDate: HOJE });
  const pronto = montarPedidoDeRecorrencia(
    { acao: 'editar', novoValor: 130, novaCategoria: { id: 'cat-lazer' }, novaConta: { id: 'conta-it' } },
    serie,
    { categories: CATEGORIAS, accounts: CONTAS },
  );
  assert.deepEqual(pronto.chamada, {
    rpc: 'alterar',
    transacaoId: 'a2',
    escopo: 'forward',
    alteracoes: { account_id: 'conta-it', category_id: 'cat-lazer', description: 'Academia', amount: 130, payment_method: null, notes: null },
  });
  assert.match(pronto.texto.replace(/ /g, ' '), /valor de R\$ 120,00 para R\$ 130,00 e categoria de Saúde para Lazer e conta de Nubank para Itaú/);
});

test('editar recusa categoria de outro tipo e pedido que não muda nada', () => {
  const { serie } = localizarSerie('Academia', LISTA, { referenceDate: HOJE });
  assert.match(
    montarPedidoDeRecorrencia({ acao: 'editar', novaCategoria: { id: 'cat-sal' } }, serie, { categories: CATEGORIAS }).erro,
    /não é do mesmo tipo/,
  );
  assert.equal(montarPedidoDeRecorrencia({ acao: 'editar', novoValor: 120 }, serie).erro, 'Academia já está assim. Nada mudou.');
});
