import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ROTAS_INTERPRETACAO,
  escolherRotaDaInterpretacao,
  interpretacaoParaAgenda,
  interpretacaoParaPlano,
  interpretacaoParaRascunho,
} from './uniInterpretRoteamento.js';
import { buildFinancialIntentAction } from '../uni-conversation/financialIntentAction.js';
import { createPendingFinancialPlan, PLAN_OPERATION_STATUS } from '../uni-conversation/pendingFinancialPlan.js';
import { describePlanOperation } from '../uni-conversation/financialPlanPresenter.js';

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

test('parcela numa operação única vai para o plano; recorrência abre o card deste lançamento', () => {
  assert.equal(
    escolherRotaDaInterpretacao({ intent: 'lancamento', operacoes: [operacao({ parcelas: 12 })], resposta: '' }),
    ROTAS_INTERPRETACAO.PLANO,
  );
  // Falso positivo de recorrência ("mensalidade do sistema 89") não pode
  // bloquear o registro do mês.
  assert.equal(
    escolherRotaDaInterpretacao({ intent: 'lancamento', operacoes: [operacao({ recorrente: true })], resposta: '' }),
    ROTAS_INTERPRETACAO.LANCAMENTO,
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

test('plano do modelo: parcela vira compra parcelada registrável; recorrência sem frequência vira a entrada comum', () => {
  const plano = interpretacaoParaPlano({
    intent: 'lancamento',
    operacoes: [operacao({ valor: 3600, parcelas: 12 }), operacao({ tipo: 'entrada', recorrente: true })],
    resposta: '',
  });
  assert.deepEqual(plano.operations.map((item) => item.operationType), ['installment_purchase', 'income']);
  assert.deepEqual(plano.operations[0].installments, { count: 12 });
  assert.equal(plano.operations[1].installments, null);
  const pendente = createPendingFinancialPlan({
    plan: plano, phrase: 'x', accounts: CONTAS, categories: CATEGORIAS_PLANO, referenceDate: '2026-10-10',
  });
  const [parcelada, recorrente] = pendente.operations;
  assert.equal(parcelada.capabilityPending, false);
  assert.equal(parcelada.action.amount, 3600);
  assert.equal(parcelada.action.installments.count, 12);
  assert.equal(parcelada.action.installments.installmentAmount, 300);
  assert.equal(recorrente.capabilityPending, false);
  assert.equal(recorrente.action.recurrence, undefined);
});

test('lançamento simples não vira plano', () => {
  assert.equal(interpretacaoParaPlano({ intent: 'lancamento', operacoes: [operacao()], resposta: '' }), null);
});

test('plano do modelo: conta escolhida vai por id, mesmo com duas contas de mesma identidade', () => {
  const contas = [
    { id: 'conta-nu', name: 'Nubank', account_type: 'checking', is_active: true, institution_name: 'Nubank' },
    { id: 'cartao-nu', name: 'Cartão Nubank', account_type: 'credit_card', is_active: true, institution_name: 'Nubank' },
  ];
  const plano = interpretacaoParaPlano({
    intent: 'lancamento',
    operacoes: [
      operacao({ valor: 40, conta: { id: 'conta-nu', name: 'Nubank' } }),
      operacao({ valor: 25, conta: { id: 'cartao-nu', name: 'Cartão Nubank' } }),
    ],
    resposta: '',
  });
  const pendente = createPendingFinancialPlan({
    plan: plano, phrase: 'x', accounts: contas, categories: CATEGORIAS_PLANO, referenceDate: '2026-10-10',
  });
  assert.deepEqual(pendente.operations.map((item) => item.action.account?.id), ['conta-nu', 'cartao-nu']);
  assert.ok(pendente.operations.every((item) => item.action.category?.id === 'cat-edu'));
});

test('plano do modelo: operação sem valor fica sem valor, nunca R$ 0,00', () => {
  const plano = interpretacaoParaPlano({
    intent: 'lancamento',
    operacoes: [operacao({ valor: null, descricao: 'Táxi' }), operacao({ valor: 25 })],
    resposta: '',
  });
  const pendente = createPendingFinancialPlan({
    plan: plano, phrase: 'x', accounts: CONTAS, categories: CATEGORIAS_PLANO, referenceDate: '2026-10-10',
  });
  const [taxi] = pendente.operations;
  assert.equal(taxi.status, PLAN_OPERATION_STATUS.NEEDS_CLARIFICATION);
  assert.doesNotMatch(describePlanOperation(taxi), /R\$ 0,00/);
  assert.match(describePlanOperation(taxi), /valor não informado/);
});

test('agenda: título do modelo com o valor formatado', () => {
  const agenda = (campos) => ({ intent: 'agenda', operacoes: [], agenda: campos, resposta: '' });
  assert.deepEqual(
    interpretacaoParaAgenda(agenda({ titulo: 'Pagar mensalidade das escolas', valor: 2500 })),
    { titulo: 'Pagar mensalidade das escolas no valor de R$\u00a02.500,00' },
  );
  assert.deepEqual(interpretacaoParaAgenda(agenda({ titulo: 'Dentista', valor: null })), { titulo: 'Dentista' });
  assert.deepEqual(
    interpretacaoParaAgenda(agenda({ titulo: 'Pagar IPTU de R$ 300', valor: 300 })),
    { titulo: 'Pagar IPTU de R$ 300' },
    'não repete o valor que o título já traz',
  );
  assert.deepEqual(
    interpretacaoParaAgenda(agenda({ titulo: 'Pagar aluguel de 1.200', valor: 1200 })),
    { titulo: 'Pagar aluguel de 1.200' },
  );
});

// #191: ação sobre um compromisso que já existe vai inteira ao fluxo da agenda.
test('agenda: ação sobre compromisso existente leva ação, alvo e, só em editar, o nome novo', () => {
  const agenda = (campos) => ({ intent: 'agenda', operacoes: [], agenda: campos, resposta: '' });
  assert.deepEqual(
    interpretacaoParaAgenda(agenda({ acao: 'cancelar', alvo: ' Almoço com a Carla ', titulo: null, valor: null })),
    { acao: 'cancelar', alvo: 'Almoço com a Carla', titulo: null },
  );
  assert.deepEqual(
    interpretacaoParaAgenda(agenda({ acao: 'editar', alvo: 'Reunião', titulo: 'Reunião com o João', valor: null })),
    { acao: 'editar', alvo: 'Reunião', titulo: 'Reunião com o João' },
  );
  assert.deepEqual(
    interpretacaoParaAgenda(agenda({ acao: 'consultar', alvo: null, titulo: null, valor: null })),
    { acao: 'consultar', alvo: null, titulo: null },
    'consulta sem compromisso citado também vai ao fluxo da agenda',
  );
  assert.deepEqual(
    interpretacaoParaAgenda(agenda({ acao: 'excluir', alvo: null, titulo: 'Dentista', valor: 50 })),
    { acao: 'excluir', alvo: null, titulo: null },
    'fora de editar, o título do modelo não vale e o valor não entra',
  );
  assert.deepEqual(
    interpretacaoParaAgenda(agenda({ acao: 'criar', alvo: null, titulo: 'Dentista', valor: null })),
    { titulo: 'Dentista' },
    'criar segue o caminho do título',
  );
});

test('agenda: sem título do modelo, ou de uma função anterior ao contrato, a regex segue', () => {
  assert.equal(interpretacaoParaAgenda({ intent: 'agenda', operacoes: [], agenda: { titulo: '  ', valor: 50 }, resposta: '' }), null);
  assert.equal(interpretacaoParaAgenda({ intent: 'agenda', operacoes: [], resposta: '' }), null);
  assert.equal(interpretacaoParaAgenda({ intent: 'consulta', operacoes: [], agenda: { titulo: 'X', valor: null }, resposta: '' }), null);
});

// #80, etapa 2b: saldo declarado e meta saem das regras fixas.
test('saldo e meta têm rota própria e nunca viram rascunho nem plano', () => {
  const comOperacao = [operacao({ tipo: 'entrada', valor: 1250 })];
  for (const [intent, rota] of [['saldo', ROTAS_INTERPRETACAO.SALDO], ['meta', ROTAS_INTERPRETACAO.META]]) {
    assert.equal(escolherRotaDaInterpretacao({ intent, operacoes: [], resposta: '' }), rota);
    assert.equal(interpretacaoParaRascunho({ intent, operacoes: comOperacao, resposta: '' }, 'x'), null);
    assert.equal(interpretacaoParaPlano({ intent, operacoes: comOperacao, resposta: '' }), null);
  }
});

test('pedido de categoria vai para a rota própria; sem ação, não entendi', () => {
  assert.equal(
    escolherRotaDaInterpretacao({ intent: 'categoria', operacoes: [], resposta: '', categoria: { acao: 'criar', tipo: 'saida', alvo: null, nome: 'Impostos' } }),
    ROTAS_INTERPRETACAO.CATEGORIA,
  );
  assert.equal(escolherRotaDaInterpretacao({ intent: 'categoria', operacoes: [], resposta: '' }), ROTAS_INTERPRETACAO.NAO_ENTENDI);
});

test('exclusão de lançamento vai para a rota própria; sem o bloco (função antiga), as regras seguem', () => {
  assert.equal(
    escolherRotaDaInterpretacao({ intent: 'exclusao', operacoes: [], resposta: '', exclusao: { alvo: 'Uber', data: null, valor: null, conta: null, ultimo: false, lote: false } }),
    ROTAS_INTERPRETACAO.EXCLUSAO,
  );
  assert.equal(escolherRotaDaInterpretacao({ intent: 'exclusao', operacoes: [], resposta: '' }), null);
});

test('edição de lançamento salvo vai para a rota própria; sem o bloco (função antiga), as regras seguem', () => {
  assert.equal(
    escolherRotaDaInterpretacao({ intent: 'edicao', operacoes: [], resposta: '', edicao: { alvo: 'Mercado', mudancas: { amount: 50 } } }),
    ROTAS_INTERPRETACAO.EDICAO,
  );
  assert.equal(escolherRotaDaInterpretacao({ intent: 'edicao', operacoes: [], resposta: '' }), null);
});

test('recorrência com frequência vai para o plano e vira série registrável (#222)', () => {
  const interpretacao = {
    intent: 'lancamento',
    operacoes: [operacao({ valor: 1500, descricao: 'Aluguel', data: '2026-10-10', recorrente: true, frequencia: 'mensal', intervalo: 1 })],
    resposta: '',
  };
  assert.equal(escolherRotaDaInterpretacao(interpretacao), ROTAS_INTERPRETACAO.PLANO);
  assert.equal(interpretacaoParaRascunho(interpretacao, 'aluguel de 1500 todo dia 10'), null);

  const plano = interpretacaoParaPlano(interpretacao);
  assert.equal(plano.operations[0].operationType, 'recurring_expense');
  assert.deepEqual(plano.operations[0].recurrence, { frequency: 'monthly', interval: 1 });

  const pendente = createPendingFinancialPlan({
    plan: plano, phrase: 'x', accounts: CONTAS, categories: CATEGORIAS_PLANO, referenceDate: '2026-10-02',
  });
  const [serie] = pendente.operations;
  assert.equal(serie.capabilityPending, false);
  assert.equal(serie.status, PLAN_OPERATION_STATUS.READY);
  assert.deepEqual(serie.action.recurrence, { frequency: 'monthly', interval: 1 });
  assert.equal(serie.action.transactionType, 'expense');
  assert.equal(serie.action.date, '2026-10-10');
  // A série decide o status de cada lançamento: o card não diz "Previsto".
  assert.equal(serie.action.planned, false);
  assert.equal(describePlanOperation(serie), '• Saída de R$ 1500,00 (Aluguel) todo mês, no dia 10, a partir de 10/10, em Educação');
});

test('recorrência: quinzenal vira semanal a cada 2, e entrada vira recurring_income', () => {
  const plano = interpretacaoParaPlano({
    intent: 'lancamento',
    operacoes: [operacao({ tipo: 'entrada', recorrente: true, frequencia: 'semanal', intervalo: 2 })],
    resposta: '',
  });
  assert.equal(plano.operations[0].operationType, 'recurring_income');
  assert.deepEqual(plano.operations[0].recurrence, { frequency: 'weekly', interval: 2 });
});

test('recorrência sem frequência segue como lançamento deste mês, sozinha ou no plano', () => {
  assert.equal(
    escolherRotaDaInterpretacao({ intent: 'lancamento', operacoes: [operacao({ recorrente: true, frequencia: null })], resposta: '' }),
    ROTAS_INTERPRETACAO.LANCAMENTO,
  );
  const plano = interpretacaoParaPlano({
    intent: 'lancamento',
    operacoes: [operacao({ valor: 40 }), operacao({ recorrente: true, frequencia: null })],
    resposta: '',
  });
  assert.equal(plano.operations[1].operationType, 'expense');
  assert.equal(plano.operations[1].recurrence, null);
  const pendente = createPendingFinancialPlan({
    plan: plano, phrase: 'x', accounts: CONTAS, categories: CATEGORIAS_PLANO, referenceDate: '2026-10-10',
  });
  assert.equal(pendente.operations[1].capabilityPending, false);
  assert.equal(pendente.operations[1].status, PLAN_OPERATION_STATUS.READY);
});

test('recorrência: intervalo acima de 365 vira 1, e o início antes de hoje fica marcado no card', () => {
  const plano = interpretacaoParaPlano({
    intent: 'lancamento',
    operacoes: [operacao({ data: '2026-09-10', recorrente: true, frequencia: 'mensal', intervalo: 400 })],
    resposta: '',
  });
  assert.deepEqual(plano.operations[0].recurrence, { frequency: 'monthly', interval: 1 });
  const pendente = createPendingFinancialPlan({
    plan: plano, phrase: 'x', accounts: CONTAS, categories: CATEGORIAS_PLANO, referenceDate: '2026-10-02',
  });
  assert.equal(pendente.operations[0].action.startsBeforeToday, true);
});
