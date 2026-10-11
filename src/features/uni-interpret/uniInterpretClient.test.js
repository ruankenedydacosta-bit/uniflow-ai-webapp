import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createUniInterpretClient,
  interpretacaoParaOverrides,
  montarHistoricoParaInterpretacao,
  montarRascunhoParaInterpretacao,
} from './uniInterpretClient.js';

const WORKSPACE = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';

function supabaseStub(accessToken = 'token-123') {
  return {
    auth: { getSession: async () => ({ data: { session: accessToken ? { access_token: accessToken } : null } }) },
  };
}

function criarCliente({ fetchImpl, accessToken, enabled = true } = {}) {
  return createUniInterpretClient({
    supabase: supabaseStub(accessToken),
    supabaseUrl: 'https://demo.supabase.co',
    supabaseAnonKey: 'anon',
    enabled,
    fetchImpl,
  });
}

const OPERACAO = {
  tipo: 'saida',
  valor: 300,
  data: '2026-10-07',
  descricao: 'Mensalidade escolar das crianças',
  categoria: { id: 'cat-edu', name: 'Educação' },
  novaCategoria: null,
  alternativas: [],
  conta: { id: 'conta-nu', name: 'Nubank' },
  contaDestino: null,
  confianca: 0.92,
  faltando: [],
  ajustes: [],
};

test('envia frase, espaço, histórico e rascunho para a uni-interpret com o token da sessão', async () => {
  let chamada;
  const cliente = criarCliente({
    fetchImpl: async (url, init) => {
      chamada = { url, init };
      return { ok: true, status: 200, json: async () => ({ intent: 'lancamento', operacoes: [OPERACAO], resposta: '' }) };
    },
  });
  const { interpretacao, error } = await cliente.interpretar({
    workspaceId: WORKSPACE,
    frase: ' Lance 300 reais da mensalidade escolar das crianças ',
    historico: [{ autor: 'usuario', texto: 'oi' }],
  });

  assert.equal(error, null);
  assert.equal(interpretacao.operacoes[0].categoria.id, 'cat-edu');
  assert.equal(chamada.url, 'https://demo.supabase.co/functions/v1/uni-interpret');
  assert.equal(chamada.init.headers.Authorization, 'Bearer token-123');
  assert.deepEqual(JSON.parse(chamada.init.body), {
    workspaceId: WORKSPACE,
    frase: 'Lance 300 reais da mensalidade escolar das crianças',
    historico: [{ autor: 'usuario', texto: 'oi' }],
    rascunho: null,
  });
});

test('falhas voltam como erro, nunca lançam: o chat segue com as regras', async () => {
  const semRede = criarCliente({ fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal((await semRede.interpretar({ workspaceId: WORKSPACE, frase: 'gastei 50' })).error.code, 'NETWORK');

  const teto = criarCliente({ fetchImpl: async () => ({ ok: false, status: 429 }) });
  assert.equal((await teto.interpretar({ workspaceId: WORKSPACE, frase: 'gastei 50' })).error.code, 'RATE_LIMIT');

  const foraDoContrato = criarCliente({ fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true }) }) });
  assert.equal((await foraDoContrato.interpretar({ workspaceId: WORKSPACE, frase: 'gastei 50' })).error.code, 'INVALID_RESPONSE');

  const semSessao = criarCliente({ accessToken: null, fetchImpl: async () => assert.fail('não chama sem sessão') });
  assert.equal((await semSessao.interpretar({ workspaceId: WORKSPACE, frase: 'gastei 50' })).error.code, 'UNAUTHORIZED');

  const desligado = criarCliente({ enabled: false, fetchImpl: async () => assert.fail('não chama desligado') });
  assert.equal(desligado.isSupported(), false);
  assert.equal((await desligado.interpretar({ workspaceId: WORKSPACE, frase: 'gastei 50' })).error.code, 'UNSUPPORTED');
});

test('interpretação vira os campos do lançamento quando o tipo bate', () => {
  const interpretacao = { intent: 'lancamento', operacoes: [OPERACAO], resposta: '' };
  assert.deepEqual(interpretacaoParaOverrides(interpretacao, { transactionType: 'expense' }), {
    amount: 300,
    date: '2026-10-07',
    description: 'Mensalidade escolar das crianças',
    categoryId: 'cat-edu',
    accountId: 'conta-nu',
  });
  assert.deepEqual(
    interpretacaoParaOverrides({ intent: 'correcao', operacoes: [{ ...OPERACAO, conta: null }] }, { transactionType: 'expense' }),
    { amount: 300, date: '2026-10-07', description: 'Mensalidade escolar das crianças', categoryId: 'cat-edu' },
  );
});

test('interpretação que não serve para o lançamento é ignorada', () => {
  const comOperacoes = (operacoes, intent = 'lancamento') => ({ intent, operacoes, resposta: '' });
  assert.equal(interpretacaoParaOverrides(null, { transactionType: 'expense' }), null);
  assert.equal(interpretacaoParaOverrides(comOperacoes([OPERACAO], 'consulta'), { transactionType: 'expense' }), null);
  assert.equal(interpretacaoParaOverrides(comOperacoes([OPERACAO, OPERACAO]), { transactionType: 'expense' }), null);
  // Receita contra despesa: a IA não troca o tipo sem perguntar.
  assert.equal(interpretacaoParaOverrides(comOperacoes([{ ...OPERACAO, tipo: 'entrada' }]), { transactionType: 'expense' }), null);
});

test('rascunho e histórico vão no formato da função', () => {
  assert.deepEqual(montarRascunhoParaInterpretacao({
    transactionType: 'expense',
    amount: 85,
    date: '2026-10-06',
    description: 'Mercado',
    category: { id: 'cat-ali', name: 'Alimentação', category_type: 'expense' },
    account: { id: 'conta-nu', name: 'Nubank', balance: 10 },
  }), {
    operacoes: [{
      tipo: 'saida',
      valor: 85,
      data: '2026-10-06',
      descricao: 'Mercado',
      categoria: { id: 'cat-ali', name: 'Alimentação' },
      novaCategoria: null,
      conta: { id: 'conta-nu', name: 'Nubank' },
      contaDestino: null,
    }],
  });
  assert.equal(montarRascunhoParaInterpretacao({ transactionType: 'adjustment' }), null);

  assert.deepEqual(montarHistoricoParaInterpretacao([
    { from: 'user', text: 'gastei 85 no mercado' },
    { from: 'uni', text: 'Revise o lançamento.' },
    { from: 'uni', text: '   ' },
    { from: 'system', text: 'ignorado' },
  ]), [
    { autor: 'usuario', texto: 'gastei 85 no mercado' },
    { autor: 'uni', texto: 'Revise o lançamento.' },
  ]);
});

test('correção que vira compra parcelada não altera o card de uma operação', () => {
  const interpretacao = { intent: 'correcao', operacoes: [{ ...OPERACAO, valor: 3000, parcelas: 10 }], resposta: '' };
  assert.equal(interpretacaoParaOverrides(interpretacao, { transactionType: 'expense' }), null);
});
