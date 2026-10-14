import assert from 'node:assert/strict';
import test from 'node:test';

import {
  consultaRespondivel,
  memoriaDaConsulta,
  periodoDaConsulta,
  responderConsulta,
  rotuloDoPeriodo,
  statusDaConsulta,
} from './uniInterpretConsulta.js';

// Sexta, 02/10/2026.
const HOJE = '2026-10-02';
const SAUDE = { id: 'cat-sau', name: 'Saúde' };
const NUBANK = { id: 'conta-nu', name: 'Nubank' };

const TRANSACOES = [
  { transaction_type: 'expense', amount: 120.1, category_id: 'cat-sau', account_id: 'conta-nu', description: 'Farmácia São João' },
  { transaction_type: 'expense', amount: 80.2, category_id: 'cat-sau', account_id: 'conta-it', description: 'Consulta' },
  { transaction_type: 'expense', amount: 35, category_id: 'cat-tra', account_id: 'conta-nu', description: 'Estacionamento' },
  { transaction_type: 'income', amount: 5000, category_id: 'cat-sal', account_id: 'conta-it', description: 'Salário' },
  { transaction_type: 'transfer', amount: 900, category_id: 'cat-trf', account_id: 'conta-nu', description: 'Para a poupança' },
];

// Intl separa "R$" do valor com espaço sem quebra.
function responder(argumentos) {
  return responderConsulta(argumentos).replace(/\u00a0/g, ' ');
}

function consulta(campos = {}) {
  return { tipo: 'saidas', inicio: null, fim: null, categoria: null, conta: null, termo: null, ...campos };
}

test('só saídas, entradas, resumo e previsão são respondidos com os parâmetros', () => {
  for (const tipo of ['saidas', 'entradas', 'resumo', 'previsao']) assert.equal(consultaRespondivel(consulta({ tipo })), true);
  assert.equal(consultaRespondivel(consulta({ tipo: 'outra' })), false);
  assert.equal(consultaRespondivel(undefined), false);
});

test('sem período, vale o mês da data de referência', () => {
  assert.deepEqual(periodoDaConsulta(consulta(), HOJE), { inicio: '2026-10-01', fim: '2026-10-31' });
  assert.deepEqual(periodoDaConsulta(consulta(), '2028-02-10'), { inicio: '2028-02-01', fim: '2028-02-29' });
  assert.deepEqual(
    periodoDaConsulta(consulta({ inicio: '2026-08-01', fim: '2026-08-31' }), HOJE),
    { inicio: '2026-08-01', fim: '2026-08-31' },
  );
});

test('rótulo do período fala como a pessoa', () => {
  const rotulo = (inicio, fim) => rotuloDoPeriodo({ inicio, fim }, HOJE);
  assert.equal(rotulo('2026-10-02', '2026-10-02'), 'hoje');
  assert.equal(rotulo('2026-10-01', '2026-10-01'), 'ontem');
  assert.equal(rotulo('2026-09-15', '2026-09-15'), 'em 15/09');
  assert.equal(rotulo('2026-10-01', '2026-10-31'), 'neste mês');
  assert.equal(rotulo('2026-09-01', '2026-09-30'), 'no mês passado');
  assert.equal(rotulo('2026-08-01', '2026-08-31'), 'em agosto');
  assert.equal(rotulo('2025-08-01', '2025-08-31'), 'em agosto de 2025');
  assert.equal(rotulo('2026-09-28', '2026-10-04'), 'nesta semana');
  assert.equal(rotulo('2026-09-21', '2026-09-27'), 'na semana passada');
  assert.equal(rotulo('2026-01-01', '2026-12-31'), 'neste ano');
  assert.equal(rotulo('2025-01-01', '2025-12-31'), 'em 2025');
  assert.equal(rotulo('2026-03-01', '2026-10-02'), 'de 01/03 a 02/10');
  assert.equal(rotulo('2025-12-01', '2026-01-15'), 'de 01/12/2025 a 15/01/2026');
});

test('saídas por categoria somam só a categoria, sem transferência', () => {
  assert.equal(
    responder({ consulta: consulta({ categoria: SAUDE }), transacoes: TRANSACOES, dataReferencia: HOJE }),
    'Neste mês, você gastou R$ 200,30 com Saúde, em 2 saídas.',
  );
  assert.equal(
    responder({ consulta: consulta(), transacoes: TRANSACOES, dataReferencia: HOJE }),
    'Neste mês, você gastou R$ 235,30, em 3 saídas.',
  );
});

test('termo busca na descrição sem acento nem caixa, e a conta filtra junto', () => {
  assert.equal(
    responder({
      consulta: consulta({ termo: 'FARMACIA', conta: NUBANK, inicio: '2026-08-01', fim: '2026-08-31' }),
      transacoes: TRANSACOES,
      dataReferencia: HOJE,
    }),
    'Em agosto, você gastou R$ 120,10 com FARMACIA na conta Nubank, em 1 saída.',
  );
});

test('entradas e nada encontrado', () => {
  assert.equal(
    responder({ consulta: consulta({ tipo: 'entradas' }), transacoes: TRANSACOES, dataReferencia: HOJE }),
    'Neste mês, você recebeu R$ 5.000,00, em 1 entrada.',
  );
  assert.equal(
    responder({ consulta: consulta({ tipo: 'entradas', conta: NUBANK }), transacoes: TRANSACOES, dataReferencia: HOJE }),
    'Neste mês, não encontrei entradas na conta Nubank.',
  );
  assert.equal(
    responder({ consulta: consulta({ termo: 'cinema' }), transacoes: [], dataReferencia: HOJE }),
    'Neste mês, não encontrei saídas com cinema.',
  );
});

test('resumo junta entradas e saídas, sem saldo', () => {
  assert.equal(
    responder({ consulta: consulta({ tipo: 'resumo' }), transacoes: TRANSACOES, dataReferencia: HOJE }),
    'Neste mês, você teve 1 entrada, que soma R$ 5.000,00, e 3 saídas, que somam R$ 235,30.',
  );
  assert.equal(
    responder({ consulta: consulta({ tipo: 'resumo', conta: NUBANK }), transacoes: TRANSACOES, dataReferencia: HOJE }),
    'Neste mês, na conta Nubank, você teve 2 saídas, que somam R$ 155,10, e nenhuma entrada.',
  );
  assert.equal(
    responder({ consulta: consulta({ tipo: 'resumo' }), transacoes: [], dataReferencia: HOJE }),
    'Neste mês, você não registrou entradas nem saídas.',
  );
});

const NOVEMBRO = { inicio: '2026-11-01', fim: '2026-11-30' };

test('previsão e período futuro leem os previstos; o resto, os concluídos', () => {
  assert.equal(statusDaConsulta(consulta({ tipo: 'previsao' }), HOJE), 'pending');
  for (const tipo of ['saidas', 'entradas', 'resumo', 'lancamentos']) {
    assert.equal(statusDaConsulta(consulta({ tipo, ...NOVEMBRO }), HOJE), 'pending');
    assert.equal(statusDaConsulta(consulta({ tipo }), HOJE), 'completed');
    assert.equal(statusDaConsulta(consulta({ tipo, inicio: '2026-10-01', fim: '2026-10-31' }), HOJE), 'completed');
  }
});

test('previsão junta entradas e saídas previstas', () => {
  const previsao = consulta({ tipo: 'previsao', ...NOVEMBRO });
  assert.equal(
    responder({ consulta: previsao, transacoes: TRANSACOES, dataReferencia: HOJE }),
    'Em novembro, a previsão é de 1 entrada, que soma R$ 5.000,00, e 3 saídas, que somam R$ 235,30.',
  );
  assert.equal(
    responder({ consulta: { ...previsao, conta: NUBANK }, transacoes: TRANSACOES, dataReferencia: HOJE }),
    'Em novembro, na conta Nubank, a previsão é de 2 saídas, que somam R$ 155,10, e nenhuma entrada.',
  );
  assert.equal(
    responder({ consulta: consulta({ tipo: 'previsao' }), transacoes: [], dataReferencia: HOJE }),
    'Neste mês, você não tem entradas nem saídas previstas.',
  );
  assert.equal(
    responder({ consulta: consulta({ tipo: 'resumo', ...NOVEMBRO }), transacoes: TRANSACOES, dataReferencia: HOJE }),
    'Em novembro, a previsão é de 1 entrada, que soma R$ 5.000,00, e 3 saídas, que somam R$ 235,30.',
  );
});

test('período futuro de um lado só responde a previsão daquele lado, com os filtros', () => {
  assert.equal(
    responder({ consulta: consulta({ ...NOVEMBRO, categoria: SAUDE }), transacoes: TRANSACOES, dataReferencia: HOJE }),
    'Em novembro, a previsão de saídas com Saúde é de R$ 200,30, em 2 saídas.',
  );
  assert.equal(
    responder({ consulta: consulta({ tipo: 'entradas', ...NOVEMBRO }), transacoes: TRANSACOES, dataReferencia: HOJE }),
    'Em novembro, a previsão de entradas é de R$ 5.000,00, em 1 entrada.',
  );
  assert.equal(
    responder({ consulta: consulta({ tipo: 'entradas', ...NOVEMBRO }), transacoes: [], dataReferencia: HOJE }),
    'Em novembro, não encontrei entradas previstas.',
  );
});

test('lista de previstos vai do mais próximo ao mais distante', () => {
  const previstos = [
    { transaction_type: 'expense', amount: 650, account_id: 'conta-nu', description: 'Condomínio', transaction_date: '2026-11-20' },
    { transaction_type: 'expense', amount: 90, account_id: 'conta-nu', description: 'Internet', transaction_date: '2026-11-05' },
  ];
  assert.equal(
    responder({ consulta: consulta({ tipo: 'lancamentos', ...NOVEMBRO }), transacoes: previstos, dataReferencia: HOJE, contas: [NUBANK] }),
    'Em novembro, encontrei 2 saídas previstas, que somam R$ 740,00. 05/11, Internet, R$ 90,00, no Nubank; 20/11, Condomínio, R$ 650,00, no Nubank.',
  );
  assert.equal(
    responder({ consulta: consulta({ tipo: 'lancamentos', ...NOVEMBRO }), transacoes: [], dataReferencia: HOJE }),
    'Em novembro, não encontrei lançamentos previstos.',
  );
});

test('previsão além de 3 meses avisa que os recorrentes ainda não estão lá', () => {
  const marco = consulta({ tipo: 'previsao', inicio: '2027-03-01', fim: '2027-03-31' });
  assert.equal(
    responder({ consulta: marco, transacoes: [], dataReferencia: HOJE }),
    'Em março de 2027, você não tem entradas nem saídas previstas. '
      + 'Os lançamentos recorrentes só aparecem na previsão até 3 meses à frente.',
  );
  assert.doesNotMatch(
    responder({ consulta: consulta({ tipo: 'previsao', ...NOVEMBRO }), transacoes: [], dataReferencia: HOJE }),
    /recorrentes/,
  );
});

test('categoria e termo juntos: a frase diz que é só parte da categoria', () => {
  assert.equal(
    responder({ consulta: consulta({ categoria: SAUDE, termo: 'farmácia' }), transacoes: TRANSACOES, dataReferencia: HOJE }),
    'Neste mês, você gastou R$ 120,10 com farmácia em Saúde, em 1 saída.',
  );
});

test('memória guarda conta e categoria e troca a última consulta', () => {
  assert.deepEqual(memoriaDaConsulta(consulta({ categoria: SAUDE, conta: NUBANK }), 'Neste mês...'), {
    account: 'Nubank',
    category: 'Saúde',
    queryType: 'uni_interpret_consulta',
    queryParams: { kind: 'uni_interpret_consulta' },
    response: 'Neste mês...',
  });
});

// #190: a pessoa quer ver os lançamentos, não o total.
const CONTAS = [{ id: 'conta-nu', name: 'Nubank' }, { id: 'conta-it', name: 'Itaú' }];
const COM_DATA = TRANSACOES.map((transacao, indice) => ({ ...transacao, transaction_date: `2026-10-0${indice + 1}` }));

test('lancamentos: lista do mais recente ao mais antigo, com conta e total do mesmo tipo', () => {
  assert.equal(
    responder({ consulta: consulta({ tipo: 'lancamentos', categoria: SAUDE }), transacoes: COM_DATA, dataReferencia: HOJE, contas: CONTAS }),
    'Neste mês, encontrei 2 saídas com Saúde, que somam R$ 200,30. 02/10, Consulta, R$ 80,20, no Itaú; 01/10, Farmácia São João, R$ 120,10, no Nubank.',
  );
  assert.equal(
    responder({ consulta: consulta({ tipo: 'lancamentos', termo: 'salario' }), transacoes: COM_DATA, dataReferencia: HOJE, contas: CONTAS }),
    'Neste mês, encontrei 1 entrada com salario: 04/10, Salário, R$ 5.000,00, no Itaú.',
  );
});

test('lancamentos: tipos misturados não somam, e o que passa de 5 fica para a tela', () => {
  const muitas = [...COM_DATA, ...COM_DATA.map((transacao) => ({ ...transacao, transaction_date: '2026-09-30' }))];
  assert.equal(
    responder({ consulta: consulta({ tipo: 'lancamentos' }), transacoes: muitas, dataReferencia: HOJE, contas: CONTAS }),
    'Neste mês, encontrei 10 lançamentos. Os mais recentes: 05/10, Para a poupança, R$ 900,00, no Nubank; '
    + '04/10, Salário, R$ 5.000,00, no Itaú; 03/10, Estacionamento, R$ 35,00, no Nubank; 02/10, Consulta, R$ 80,20, no Itaú; '
    + '01/10, Farmácia São João, R$ 120,10, no Nubank. E mais 5 lançamentos, que você vê em Financeiro.',
  );
  assert.equal(
    responder({ consulta: consulta({ tipo: 'lancamentos', termo: 'cinema', conta: NUBANK }), transacoes: COM_DATA, dataReferencia: HOJE }),
    'Neste mês, não encontrei lançamentos com cinema na conta Nubank.',
  );
});

test('categorias: lista o catálogo por tipo, sem ir ao banco', () => {
  const categorias = [
    { name: 'Transporte', category_type: 'expense' },
    { name: 'Alimentação', category_type: 'expense' },
    { name: 'Salário', category_type: 'income' },
  ];
  assert.equal(consultaRespondivel(consulta({ tipo: 'categorias' })), true);
  assert.equal(
    responder({ consulta: consulta({ tipo: 'categorias' }), transacoes: [], dataReferencia: HOJE, categorias }),
    'Você tem 3 categorias: 2 de saída, Alimentação e Transporte; e 1 de entrada, Salário.',
  );
  // Arquivada não é lida em voz alta, como na tela Categorias.
  assert.equal(
    responder({
      consulta: consulta({ tipo: 'categorias' }), transacoes: [], dataReferencia: HOJE,
      categorias: [...categorias.slice(0, 1), { name: 'Arquivada', category_type: 'expense', is_active: false }],
    }),
    'Você tem 1 categoria de saída: Transporte.',
  );
  assert.equal(
    responder({ consulta: consulta({ tipo: 'categorias' }), transacoes: [], dataReferencia: HOJE, categorias: categorias.slice(0, 1) }),
    'Você tem 1 categoria de saída: Transporte.',
  );
  assert.equal(
    responder({ consulta: consulta({ tipo: 'categorias' }), transacoes: [], dataReferencia: HOJE, categorias: [] }),
    'Você ainda não tem categorias. Crie uma pela conversa ou em Categorias, no menu Mais.',
  );
});

test('lancamentos: transferência entra pela conta de destino e diz de onde para onde', () => {
  const ITAU = { id: 'conta-it', name: 'Itaú' };
  const transferencia = { ...COM_DATA[4], account_id: 'conta-it', destination_account_id: 'conta-nu' };
  assert.equal(
    responder({ consulta: consulta({ tipo: 'lancamentos', conta: NUBANK, termo: 'poupança' }), transacoes: [transferencia], dataReferencia: HOJE, contas: CONTAS }),
    'Neste mês, encontrei 1 lançamento com poupança na conta Nubank: 05/10, Para a poupança, R$ 900,00, do Itaú para o Nubank.',
  );
  // Saída e entrada seguem só pela conta de origem.
  assert.equal(
    responder({ consulta: consulta({ conta: ITAU, termo: 'poupança' }), transacoes: [transferencia], dataReferencia: HOJE, contas: CONTAS }),
    'Neste mês, não encontrei saídas com poupança na conta Itaú.',
  );
});

test('lancamentos: no mesmo dia, o registrado por último vem primeiro', () => {
  const doDia = ['a', 'b', 'c'].map((letra, indice) => ({
    transaction_type: 'expense', amount: 10, description: `Compra ${letra}`, transaction_date: '2026-10-02',
    account_id: 'conta-nu', created_at: `2026-10-02T1${indice}:00:00Z`,
  }));
  assert.equal(
    responder({ consulta: consulta({ tipo: 'lancamentos' }), transacoes: doDia, dataReferencia: HOJE, contas: CONTAS }),
    'Neste mês, encontrei 3 saídas, que somam R$ 30,00. 02/10, Compra c, R$ 10,00, no Nubank; 02/10, Compra b, R$ 10,00, no Nubank; 02/10, Compra a, R$ 10,00, no Nubank.',
  );
});

test('tipo que não é respondido aqui devolve null, em vez de somar tudo como entrada', () => {
  assert.equal(responderConsulta({ consulta: consulta({ tipo: 'outra' }), transacoes: TRANSACOES, dataReferencia: HOJE }), null);
});
