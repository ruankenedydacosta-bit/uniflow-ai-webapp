import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_EVENTOS_DA_MEMORIA,
  TIPO_MEMORIA_DE_CATEGORIA,
  chaveDaDescricao,
  memoriaDepoisDaConfirmacao,
  registrarConfirmacaoNaMemoria,
} from './memoriaDeCategoria.js';

const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const EDUCACAO = '22222222-2222-4222-8222-222222222222';
const LAZER = '33333333-3333-4333-8333-333333333333';
const TRANSACAO_1 = '44444444-4444-4444-8444-444444444441';
const TRANSACAO_2 = '44444444-4444-4444-8444-444444444442';
const MEMORIA = '55555555-5555-4555-8555-555555555555';

const confirmacao = (extra = {}) => ({
  descricao: 'Mensalidade escolar',
  categoriaId: EDUCACAO,
  tipo: 'expense',
  trocou: false,
  transacaoId: TRANSACAO_1,
  data: '2026-10-12',
  ...extra,
});

test('chave ignora acento, caixa e espaço repetido, e não carrega a descrição', async () => {
  const chave = await chaveDaDescricao('Mensalidade  Escolar');
  assert.equal(chave, await chaveDaDescricao('mensalidade escolar'));
  assert.equal(chave, await chaveDaDescricao(' MENSALIDADE ESCOLAR '));
  assert.notEqual(chave, await chaveDaDescricao('Mensalidade da academia'));
  assert.match(chave, /^descricao:[0-9a-f]{32}$/);
  // A tabela recusa chave com "audio": o hash não tem a palavra.
  assert.doesNotMatch(await chaveDaDescricao('Fone de áudio'), /audio/);
  assert.equal(await chaveDaDescricao('   '), null);
});

test('primeira confirmação sem troca conta 1; com troca conta 0', () => {
  const sem = memoriaDepoisDaConfirmacao(null, confirmacao());
  assert.equal(sem.confirmacoes, 1);
  assert.equal(sem.trocas, 0);
  assert.equal(sem.total, 1);
  assert.deepEqual(sem.eventos, [{ n: 1, data: '2026-10-12', trocou: false }]);

  const com = memoriaDepoisDaConfirmacao(null, confirmacao({ trocou: true }));
  assert.equal(com.confirmacoes, 0);
  assert.equal(com.trocas, 1);
});

test('mesma categoria soma; troca zera; outra categoria sem troca recomeça em 1', () => {
  let valor = memoriaDepoisDaConfirmacao(null, confirmacao());
  valor = memoriaDepoisDaConfirmacao(valor, confirmacao({ transacaoId: TRANSACAO_2 }));
  assert.equal(valor.confirmacoes, 2);

  const trocada = memoriaDepoisDaConfirmacao(valor, confirmacao({ transacaoId: 't3', categoriaId: LAZER, trocou: true }));
  assert.equal(trocada.confirmacoes, 0);
  assert.equal(trocada.categoria_id, LAZER);
  assert.equal(trocada.trocas, 1);
  assert.equal(trocada.total, 3);

  const outra = memoriaDepoisDaConfirmacao(valor, confirmacao({ transacaoId: 't4', categoriaId: LAZER }));
  assert.equal(outra.confirmacoes, 1);
  assert.equal(outra.categoria_id, LAZER);
});

test('a mesma transação não conta duas vezes', () => {
  const valor = memoriaDepoisDaConfirmacao(null, confirmacao());
  assert.equal(memoriaDepoisDaConfirmacao(valor, confirmacao()), null);
});

test('guarda só os últimos eventos e corta a descrição', () => {
  let valor = null;
  for (let indice = 0; indice < MAX_EVENTOS_DA_MEMORIA + 5; indice += 1) {
    valor = memoriaDepoisDaConfirmacao(valor, confirmacao({ transacaoId: `t${indice}`, descricao: 'x'.repeat(200) }));
  }
  assert.equal(valor.eventos.length, MAX_EVENTOS_DA_MEMORIA);
  assert.equal(valor.eventos.at(-1).n, MAX_EVENTOS_DA_MEMORIA + 5);
  assert.equal(valor.descricao.length, 80);
});

test('valor corrompido na memória não quebra a conta', () => {
  const valor = memoriaDepoisDaConfirmacao({ confirmacoes: 'muitas', eventos: 'x', categoria_id: EDUCACAO }, confirmacao());
  assert.equal(valor.confirmacoes, 1);
  assert.equal(valor.eventos.length, 1);
});

function servicoFalso({ existente = null, erroLeitura = null, erroGravacao = null } = {}) {
  const chamadas = [];
  return {
    chamadas,
    buscar: async (...args) => { chamadas.push(['buscar', ...args]); return { data: existente, error: erroLeitura }; },
    criar: async (...args) => { chamadas.push(['criar', ...args]); return { data: { id: MEMORIA }, error: erroGravacao }; },
    corrigir: async (...args) => { chamadas.push(['corrigir', ...args]); return { data: { id: MEMORIA }, error: erroGravacao }; },
  };
}

test('sem memória, cria com origem explícita; com troca, origem de correção', async () => {
  const servico = servicoFalso();
  const resultado = await registrarConfirmacaoNaMemoria({ workspaceId: WORKSPACE, ...confirmacao(), servico });
  assert.equal(resultado.registrada, true);
  const [, sessao, candidato, opcoes] = servico.chamadas[1];
  assert.equal(servico.chamadas[1][0], 'criar');
  assert.deepEqual(sessao, { workspace: { id: WORKSPACE } });
  assert.equal(candidato.type, TIPO_MEMORIA_DE_CATEGORIA);
  assert.equal(candidato.source, 'explicit_user');
  assert.equal(candidato.key, await chaveDaDescricao('Mensalidade escolar'));
  assert.deepEqual(opcoes, { userInitiated: true });

  const comTroca = servicoFalso();
  await registrarConfirmacaoNaMemoria({ workspaceId: WORKSPACE, ...confirmacao({ trocou: true }), servico: comTroca });
  assert.equal(comTroca.chamadas[1][2].source, 'user_correction');
});

test('com memória, atualiza o valor dela', async () => {
  const servico = servicoFalso({
    existente: { id: MEMORIA, memory_value: { categoria_id: EDUCACAO, confirmacoes: 2, total: 2, ultima_transacao_id: 'antiga' } },
  });
  const resultado = await registrarConfirmacaoNaMemoria({ workspaceId: WORKSPACE, ...confirmacao(), servico });
  assert.equal(resultado.valor.confirmacoes, 3);
  assert.equal(servico.chamadas[1][0], 'corrigir');
  assert.equal(servico.chamadas[1][2], MEMORIA);
});

test('não grava transferência, sem categoria, sem descrição ou com falha, e nunca lança', async () => {
  const servico = servicoFalso();
  assert.equal((await registrarConfirmacaoNaMemoria({ workspaceId: WORKSPACE, ...confirmacao({ tipo: 'transfer' }), servico })).registrada, false);
  assert.equal((await registrarConfirmacaoNaMemoria({ workspaceId: WORKSPACE, ...confirmacao({ categoriaId: null }), servico })).registrada, false);
  assert.equal((await registrarConfirmacaoNaMemoria({ workspaceId: WORKSPACE, ...confirmacao({ descricao: ' ' }), servico })).registrada, false);
  assert.equal((await registrarConfirmacaoNaMemoria({ workspaceId: 'x', ...confirmacao(), servico })).registrada, false);
  assert.equal(servico.chamadas.length, 0);

  const semLeitura = servicoFalso({ erroLeitura: { code: 'X' } });
  assert.equal((await registrarConfirmacaoNaMemoria({ workspaceId: WORKSPACE, ...confirmacao(), servico: semLeitura })).motivo, 'leitura');
  const semGravacao = servicoFalso({ erroGravacao: { code: 'X' } });
  assert.equal((await registrarConfirmacaoNaMemoria({ workspaceId: WORKSPACE, ...confirmacao(), servico: semGravacao })).motivo, 'gravacao');
  const quebrado = { buscar: async () => { throw new Error('rede'); } };
  assert.equal((await registrarConfirmacaoNaMemoria({ workspaceId: WORKSPACE, ...confirmacao(), servico: quebrado })).motivo, 'erro');
});
