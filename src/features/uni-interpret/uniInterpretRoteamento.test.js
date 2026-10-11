import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ROTAS_INTERPRETACAO,
  escolherRotaDaInterpretacao,
  interpretacaoParaPlano,
  interpretacaoParaRascunho,
} from './uniInterpretRoteamento.js';
import { buildFinancialIntentAction } from '../uni-conversation/financialIntentAction.js';
import { createPendingFinancialPlan, PLAN_OPERATION_STATUS } from '../uni-conversation/pendingFinancialPlan.js';

const CATEGORIAS = [
  { id: 'cat-edu', name: 'Educação', category_type: 'expense' },
  { id: 'cat-lazer', name: 'Lazer', category_type: 'expense' },
];

function operacao(campos = {}) {
  return {
    tipo: 'saida',
    valor: 350,
    data: '2026-10-05',
    descricao: 'Teste',
    categoria: { id: 'cat-edu', name: 'Educação' },
    novaCategoria: null,
    alternativas: [],
    conta: null,
    contaDestino: null,
    confianca: 0.9,
    faltando: [],
    ajustes: [],
    ...campos,
  };
}

// BUG REAL EM PRODUCAO (voz, 10/10/2026): a regex não reconhecia "fazer um
// lançamento", a frase ia ao chat geral e a Uni dizia que não conseguia
// registrar. Com a interpretação do modelo, a rota é lançamento.
test('lançamento de uma operação de saída ou entrada vai para o rascunho', () => {
  assert.equal(
    escolherRotaDaInterpretacao({ intent: 'lancamento', operacoes: [operacao()], resposta: '' }),
    ROTAS_INTERPRETACAO.LANCAMENTO,
  );
  assert.equal(
    escolherRotaDaInterpretacao({ intent: 'lancamento', operacoes: [operacao({ tipo: 'entrada' })], resposta: '' }),
    ROTAS_INTERPRETACAO.LANCAMENTO,
  );
});

test('sem rascunho na tela, correção é tratada como lançamento novo', () => {
  assert.equal(
    escolherRotaDaInterpretacao({ intent: 'correcao', operacoes: [operacao()], resposta: '' }),
    ROTAS_INTERPRETACAO.LANCAMENTO,
  );
});

test('várias operações ou transferência vão para o plano', () => {
  assert.equal(
    escolherRotaDaInterpretacao({ intent: 'lancamento', operacoes: [operacao(), operacao()], resposta: '' }),
    ROTAS_INTERPRETACAO.PLANO,
  );
  assert.equal(
    escolherRotaDaInterpretacao({ intent: 'lancamento', operacoes: [operacao({ tipo: 'transferencia' })], resposta: '' }),
    ROTAS_INTERPRETACAO.PLANO,
  );
});

test('lançamento sem operação válida vira não entendi', () => {
  assert.equal(
    escolherRotaDaInterpretacao({ intent: 'lancamento', operacoes: [], resposta: '' }),
    ROTAS_INTERPRETACAO.NAO_ENTENDI,
  );
});

test('consulta, agenda, conversa e não entendi seguem o intent do modelo', () => {
  for (const [intent, rota] of [
    ['consulta', ROTAS_INTERPRETACAO.CONSULTA],
    ['agenda', ROTAS_INTERPRETACAO.AGENDA],
    ['conversa', ROTAS_INTERPRETACAO.CONVERSA],
    ['nao_entendi', ROTAS_INTERPRETACAO.NAO_ENTENDI],
  ]) {
    assert.equal(escolherRotaDaInterpretacao({ intent, operacoes: [], resposta: '' }), rota);
  }
});

test('sem interpretação utilizável não há rota, e o chat segue com as regras', () => {
  assert.equal(escolherRotaDaInterpretacao(null), null);
  assert.equal(escolherRotaDaInterpretacao({ intent: 'outro', operacoes: [] }), null);
  assert.equal(escolherRotaDaInterpretacao({ operacoes: [] }), null);
});

test('rascunho leva valor, data, descrição e os ids escolhidos pelo modelo', () => {
  const texto = 'Fazer um lançamento de teste: descrição “teste”, categoria “educação”, valor 350 reais';
  const rascunho = interpretacaoParaRascunho(
    { intent: 'lancamento', operacoes: [operacao({ conta: { id: 'conta-nu', name: 'Nubank' } })], resposta: '' },
    texto,
  );
  assert.equal(rascunho.parsed.intent, 'register_expense');
  assert.equal(rascunho.parsed.input, texto);
  assert.deepEqual(rascunho.parsed.entities, {
    amount: 350,
    date: '2026-10-05',
    description: 'Teste',
    category: null,
    account: null,
    destinationAccount: null,
  });
  assert.deepEqual(rascunho.overrides, { categoryId: 'cat-edu', accountId: 'conta-nu' });
});

test('categoria nova pedida pelo nome vira proposta de criação com esse nome', () => {
  const rascunho = interpretacaoParaRascunho(
    { intent: 'lancamento', operacoes: [operacao({ categoria: null, novaCategoria: 'Viagem de férias' })], resposta: '' },
    'Gastei 70 na estrada, lança em Viagem de férias',
  );
  assert.deepEqual(rascunho.overrides, { categoryName: 'Viagem de férias', categoryDecision: 'create_new' });

  const action = buildFinancialIntentAction({
    parsed: rascunho.parsed,
    accounts: [],
    accountTypes: [],
    categories: CATEGORIAS,
    referenceDate: '2026-10-10',
    overrides: rascunho.overrides,
  });
  assert.equal(action.status, 'ready');
  assert.equal(action.proposedCategory?.name, 'Viagem de férias');
});

test('rascunho do modelo monta o card pronto com a categoria escolhida por id', () => {
  const rascunho = interpretacaoParaRascunho(
    { intent: 'lancamento', operacoes: [operacao()], resposta: '' },
    'Fazer um lançamento de teste, categoria educação, valor 350 reais',
  );
  const action = buildFinancialIntentAction({
    parsed: rascunho.parsed,
    accounts: [],
    accountTypes: [],
    categories: CATEGORIAS,
    referenceDate: '2026-10-10',
    overrides: rascunho.overrides,
  });
  assert.equal(action.status, 'ready');
  assert.equal(action.category?.id, 'cat-edu');
  assert.equal(action.amount, 350);
  assert.equal(action.date, '2026-10-05');
});

test('valor ausente fica nulo para a Uni perguntar', () => {
  const rascunho = interpretacaoParaRascunho(
    { intent: 'lancamento', operacoes: [operacao({ valor: null })], resposta: '' },
    'Paguei a escola',
  );
  assert.equal(rascunho.parsed.entities.amount, null);
});

test('interpretação que não é lançamento simples não vira rascunho', () => {
  assert.equal(interpretacaoParaRascunho({ intent: 'consulta', operacoes: [], resposta: '' }, 'quanto gastei?'), null);
  assert.equal(
    interpretacaoParaRascunho({ intent: 'lancamento', operacoes: [operacao(), operacao()], resposta: '' }, 'x'),
    null,
  );
});

const CONTAS = [
  { id: 'conta-cc', name: 'Conta corrente', account_type: 'checking', is_active: true },
  { id: 'conta-pp', name: 'Poupança', account_type: 'savings', is_active: true },
];
const CATEGORIAS_PLANO = [
  ...CATEGORIAS,
  { id: 'cat-ali', name: 'Alimentação', category_type: 'expense' },
  { id: 'cat-trf', name: 'Transferência', category_type: 'transfer' },
];

test('parcela ou recorrência numa operação única vão para o plano', () => {
  assert.equal(
    escolherRotaDaInterpretacao({ intent: 'lancamento', operacoes: [operacao({ parcelas: 12 })], resposta: '' }),
    ROTAS_INTERPRETACAO.PLANO,
  );
  assert.equal(
    escolherRotaDaInterpretacao({ intent: 'lancamento', operacoes: [operacao({ recorrente: true })], resposta: '' }),
    ROTAS_INTERPRETACAO.PLANO,
  );
});

test('plano do modelo: duas saídas ficam prontas com a categoria e a data escolhidas', () => {
  const plano = interpretacaoParaPlano({
    intent: 'lancamento',
    operacoes: [
      operacao({ valor: 40, descricao: 'Táxi', categoria: null, novaCategoria: null }),
      operacao({ valor: 25, descricao: 'Lanche', categoria: { id: 'cat-ali', name: 'Alimentação' } }),
    ],
    resposta: '',
  });
  assert.equal(plano.operations.length, 2);
  assert.equal(plano.operations[1].categoryReference, 'Alimentação');
  assert.equal(plano.operations[1].date, '2026-10-05');

  const pendente = createPendingFinancialPlan({
    plan: plano, phrase: 'x', accounts: CONTAS, categories: CATEGORIAS_PLANO, referenceDate: '2026-10-10',
  });
  const lanche = pendente.operations[1];
  assert.equal(lanche.status, PLAN_OPERATION_STATUS.READY);
  assert.equal(lanche.action.category?.id, 'cat-ali');
  assert.equal(lanche.action.date, '2026-10-05');
});

test('plano do modelo: transferência resolve origem e destino pelas contas escolhidas', () => {
  const plano = interpretacaoParaPlano({
    intent: 'lancamento',
    operacoes: [operacao({
      tipo: 'transferencia', valor: 500, categoria: null,
      conta: { id: 'conta-cc', name: 'Conta corrente' }, contaDestino: { id: 'conta-pp', name: 'Poupança' },
    })],
    resposta: '',
  });
  assert.equal(plano.operations[0].operationType, 'transfer');
  assert.equal(plano.operations[0].categoryReference, null);
  const pendente = createPendingFinancialPlan({
    plan: plano, phrase: 'x', accounts: CONTAS, categories: CATEGORIAS_PLANO, referenceDate: '2026-10-10',
  });
  const [transferencia] = pendente.operations;
  assert.equal(transferencia.action.account?.id, 'conta-cc');
  assert.equal(transferencia.destinationAccountResolution.account?.id, 'conta-pp');
});

test('plano do modelo: parcela e recorrência viram operação entendida mas ainda não registrável', () => {
  const plano = interpretacaoParaPlano({
    intent: 'lancamento',
    operacoes: [operacao({ valor: 3600, parcelas: 12 }), operacao({ tipo: 'entrada', recorrente: true })],
    resposta: '',
  });
  assert.deepEqual(plano.operations.map((item) => item.operationType), ['installment_purchase', 'recurring_income']);
  const pendente = createPendingFinancialPlan({
    plan: plano, phrase: 'x', accounts: CONTAS, categories: CATEGORIAS_PLANO, referenceDate: '2026-10-10',
  });
  assert.ok(pendente.operations.every((item) => item.capabilityPending && item.status === PLAN_OPERATION_STATUS.BLOCKED));
});

test('lançamento simples não vira plano', () => {
  assert.equal(interpretacaoParaPlano({ intent: 'lancamento', operacoes: [operacao()], resposta: '' }), null);
});
