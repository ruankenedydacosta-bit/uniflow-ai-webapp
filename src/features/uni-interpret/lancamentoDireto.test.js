import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DESFAZER_LANCAMENTO_DIRETO_MS,
  memoriaPermiteLancarDireto,
  operacaoParaLancarDireto,
  rascunhoPodeIrDireto,
  textoDoLancamentoDireto,
  textoDoLancamentoDiretoDesfeito,
} from './lancamentoDireto.js';
import {
  memoriaDepoisDaConfirmacao,
  memoriaDepoisDoDesfazer,
  memoriaDepoisDoLancamentoDireto,
  registrarDesfazerNaMemoria,
  registrarLancamentoDiretoNaMemoria,
} from './memoriaDeCategoria.js';

const EDUCACAO = { id: '22222222-2222-4222-8222-222222222222', name: 'Educação' };
const NUBANK = { id: '66666666-6666-4666-8666-666666666666', name: 'Nubank' };
const WORKSPACE = '11111111-1111-4111-8111-111111111111';

function interpretacao(campos = {}, extra = {}) {
  return {
    intent: 'lancamento',
    dataReferencia: '2026-10-12',
    operacoes: [{
      tipo: 'saida',
      valor: 300,
      data: '2026-10-12',
      descricao: 'Mensalidade escolar',
      categoria: EDUCACAO,
      novaCategoria: null,
      alternativas: [],
      conta: NUBANK,
      contaDestino: null,
      confianca: 0.95,
      parcelas: null,
      recorrente: false,
      faltando: [],
      ajustes: [],
      ...campos,
    }],
    ...extra,
  };
}

function rascunho(campos = {}) {
  return {
    status: 'ready',
    transactionType: 'expense',
    amount: 300,
    planned: false,
    category: EDUCACAO,
    categoryWasApproximate: false,
    account: NUBANK,
    accountResolution: { status: 'resolved', account: NUBANK },
    issues: [],
    payload: { category_id: EDUCACAO.id, account_id: NUBANK.id, description: 'Mensalidade escolar', amount: 300 },
    ...campos,
  };
}

test('lançamento simples, com certeza e sem data futura, pode ir direto', () => {
  const operacao = operacaoParaLancarDireto(interpretacao());
  assert.equal(operacao.categoria.id, EDUCACAO.id);
  assert.ok(operacaoParaLancarDireto(interpretacao({ tipo: 'entrada' })));
  assert.ok(operacaoParaLancarDireto(interpretacao({ data: '2026-10-10' })), 'data passada vale');
});

test('fica com o card: correção, várias operações, transferência, parcela, recorrência, previsto, dúvida', () => {
  const casos = {
    correcao: interpretacao({}, { intent: 'correcao' }),
    duas: { ...interpretacao(), operacoes: [interpretacao().operacoes[0], interpretacao().operacoes[0]] },
    transferencia: interpretacao({ tipo: 'transferencia' }),
    parcela: interpretacao({ parcelas: 10 }),
    recorrente: interpretacao({ recorrente: true }),
    futuro: interpretacao({ data: '2026-10-13' }),
    semData: interpretacao({ data: null }),
    semReferencia: interpretacao({}, { dataReferencia: undefined }),
    confiancaBaixa: interpretacao({ confianca: 0.85 }),
    semCategoria: interpretacao({ categoria: null }),
    novaCategoria: interpretacao({ categoria: null, novaCategoria: 'Escola' }),
    semValor: interpretacao({ valor: null }),
    faltando: interpretacao({ faltando: ['categoria'] }),
    ajuste: interpretacao({ ajustes: ['data_descartada'] }),
  };
  for (const [nome, caso] of Object.entries(casos)) {
    assert.equal(operacaoParaLancarDireto(caso), null, nome);
  }
  assert.equal(operacaoParaLancarDireto(null), null);
});

test('o rascunho do app precisa bater com a leitura e ter conta que já existe', () => {
  const [operacao] = interpretacao().operacoes;
  assert.equal(rascunhoPodeIrDireto(rascunho(), operacao), true);
  const casos = {
    pendente: rascunho({ status: 'needs_clarification' }),
    semPayload: rascunho({ payload: null }),
    outroTipo: rascunho({ transactionType: 'income' }),
    previsto: rascunho({ planned: true }),
    aproximada: rascunho({ categoryWasApproximate: true }),
    outraCategoria: rascunho({ category: { id: 'outra' } }),
    outroValor: rascunho({ amount: 30 }),
    semConta: rascunho({ account: null, accountResolution: { status: 'missing' }, payload: { ...rascunho().payload, account_id: null } }),
    contaNova: rascunho({ accountResolution: { status: 'will_create' } }),
    contaArquivada: rascunho({ accountResolution: { status: 'resolved', provisioning: 'reactivate' } }),
    comAviso: rascunho({ issues: [{ field: 'category' }] }),
  };
  for (const [nome, caso] of Object.entries(casos)) {
    assert.equal(rascunhoPodeIrDireto(caso, operacao), false, nome);
  }
});

test('memória: 3 confirmações seguidas na mesma categoria e tipo; troca zera', () => {
  const confirmar = (valor, transacaoId, extra = {}) => memoriaDepoisDaConfirmacao(valor, {
    descricao: 'Mensalidade escolar', categoriaId: EDUCACAO.id, tipo: 'expense', trocou: false, transacaoId, data: '2026-10-12', valor: 300, ...extra,
  });
  const alvo = { categoriaId: EDUCACAO.id, tipo: 'expense', valor: 300 };
  let valor = confirmar(null, 't1');
  valor = confirmar(valor, 't2');
  assert.equal(memoriaPermiteLancarDireto(valor, alvo), false, 'duas não bastam');
  valor = confirmar(valor, 't3');
  assert.equal(memoriaPermiteLancarDireto(valor, alvo), true);
  assert.equal(memoriaPermiteLancarDireto(valor, { ...alvo, tipo: 'income' }), false);
  assert.equal(memoriaPermiteLancarDireto(valor, { ...alvo, categoriaId: 'outra' }), false);
  // Valor longe dos confirmados ("três mil" no lugar de "trezentos") volta ao card.
  assert.equal(memoriaPermiteLancarDireto(valor, { ...alvo, valor: 3000 }), false);
  assert.equal(memoriaPermiteLancarDireto(valor, { ...alvo, valor: 100 }), false);
  assert.equal(memoriaPermiteLancarDireto(valor, { ...alvo, valor: 600 }), true);
  assert.equal(memoriaPermiteLancarDireto(valor, { ...alvo, valor: 150 }), true);
  assert.equal(memoriaPermiteLancarDireto({ ...valor, valores: [] }, alvo), false, 'memória sem valores não autoriza');

  const trocada = confirmar(valor, 't4', { trocou: true });
  assert.equal(memoriaPermiteLancarDireto(trocada, alvo), false);
  assert.equal(memoriaPermiteLancarDireto(null, alvo), false);
});

test('memória: lançamento direto não soma confirmação; Desfazer zera e marca o evento', () => {
  let valor = { categoria_id: EDUCACAO.id, tipo: 'expense', confirmacoes: 3, total: 3, ultima_transacao_id: 't3', eventos: [] };
  valor = memoriaDepoisDoLancamentoDireto(valor, { transacaoId: 't4', data: '2026-10-12' });
  assert.equal(valor.confirmacoes, 3);
  assert.equal(valor.total, 4);
  assert.deepEqual(valor.eventos.at(-1), { n: 4, data: '2026-10-12', trocou: false, automatico: true });
  assert.equal(memoriaDepoisDoLancamentoDireto(valor, { transacaoId: 't4', data: '2026-10-12' }), null, 'mesma transação não conta duas vezes');

  const desfeita = memoriaDepoisDoDesfazer(valor, { transacaoId: 't4' });
  assert.equal(desfeita.confirmacoes, 0);
  assert.equal(desfeita.desfeitos, 1);
  assert.equal(desfeita.eventos.at(-1).desfeito, true);
  const mudou = memoriaDepoisDoDesfazer(valor, { transacaoId: 'outra' });
  assert.equal(mudou.confirmacoes, 0, 'memória que mudou depois também zera');
  assert.equal(mudou.eventos.at(-1).desfeito, undefined, 'mas o último evento não é daquele lançamento');

  const depois = memoriaDepoisDaConfirmacao(desfeita, {
    descricao: 'Mensalidade escolar', categoriaId: EDUCACAO.id, tipo: 'expense', trocou: false, transacaoId: 't5', data: '2026-10-13',
  });
  assert.equal(depois.confirmacoes, 1, 'depois do Desfazer, recomeça');
  assert.equal(depois.desfeitos, 1, 'o total de Desfazer fica');
});

test('gravar lançamento direto e Desfazer só mexe em memória que existe', async () => {
  const chamadas = [];
  const existente = { id: '55555555-5555-4555-8555-555555555555', memory_value: { confirmacoes: 3, total: 3, ultima_transacao_id: 't3', eventos: [] } };
  const servico = {
    buscar: async () => ({ data: existente, error: null }),
    corrigir: async (...args) => { chamadas.push(args); return { data: {}, error: null }; },
  };
  const gravado = await registrarLancamentoDiretoNaMemoria({ workspaceId: WORKSPACE, descricao: 'Mensalidade escolar', tipo: 'expense', transacaoId: 't4', data: '2026-10-12', servico });
  assert.equal(gravado.registrada, true);
  assert.equal(chamadas[0][1], existente.id);

  const semMemoria = { buscar: async () => ({ data: null, error: null }), corrigir: async () => { throw new Error('não chama'); } };
  assert.equal((await registrarDesfazerNaMemoria({ workspaceId: WORKSPACE, descricao: 'Mensalidade escolar', tipo: 'expense', transacaoId: 't4', servico: semMemoria })).motivo, 'sem_memoria');
  const quebrado = { buscar: async () => { throw new Error('rede'); } };
  assert.equal((await registrarDesfazerNaMemoria({ workspaceId: WORKSPACE, descricao: 'Mensalidade escolar', tipo: 'expense', transacaoId: 't4', servico: quebrado })).registrada, false);
});

test('textos: o que lançou, onde e como desfazer', () => {
  const texto = textoDoLancamentoDireto({ valor: 300, categoria: 'Educação', descricao: 'Mensalidade escolar', conta: 'Nubank' });
  assert.match(texto, /^Lancei R\$\s300,00 em Educação \(Mensalidade escolar, Nubank\)\./);
  assert.match(texto, new RegExp(`diga "desfazer" nos próximos ${DESFAZER_LANCAMENTO_DIRETO_MS / 1000} segundos`));
  assert.match(textoDoLancamentoDireto({ valor: 30, categoria: 'Lazer' }), /^Lancei R\$\s30,00 em Lazer\. /);
  assert.match(textoDoLancamentoDiretoDesfeito({ valor: 300, categoria: 'Educação' }), /apaguei o lançamento de R\$\s300,00 em Educação/);
});
