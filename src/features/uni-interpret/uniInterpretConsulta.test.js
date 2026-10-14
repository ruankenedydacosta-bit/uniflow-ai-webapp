import assert from 'node:assert/strict';
import test from 'node:test';

import {
  consultaRespondivel,
  memoriaDaConsulta,
  periodoAnterior,
  periodoDaConsulta,
  responderConsulta,
  rotuloDoPeriodo,
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

test('só saídas, entradas e resumo são respondidos com os parâmetros', () => {
  for (const tipo of ['saidas', 'entradas', 'resumo']) assert.equal(consultaRespondivel(consulta({ tipo })), true);
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

// #265: maior gasto, comparação e contas a pagar.
test('período anterior: mês inteiro, mês em andamento e semana', () => {
  assert.deepEqual(periodoAnterior({ inicio: '2026-09-01', fim: '2026-09-30' }, '2026-10-14'), { inicio: '2026-08-01', fim: '2026-08-31' });
  assert.deepEqual(periodoAnterior({ inicio: '2026-10-01', fim: '2026-10-31' }, '2026-10-14'), { inicio: '2026-09-01', fim: '2026-09-14' });
  assert.deepEqual(periodoAnterior({ inicio: '2026-03-01', fim: '2026-03-31' }, '2026-03-31'), { inicio: '2026-02-01', fim: '2026-02-28' });
  assert.deepEqual(periodoAnterior({ inicio: '2026-10-12', fim: '2026-10-18' }, '2026-10-14'), { inicio: '2026-10-05', fim: '2026-10-07' });
});

test('maior gasto agrupa as saídas por categoria e cita as duas seguintes', () => {
  const categorias = [
    { id: 'c-ali', name: 'Alimentação' }, { id: 'c-tra', name: 'Transporte' }, { id: 'c-laz', name: 'Lazer' }, { id: 'c-sau', name: 'Saúde' },
  ];
  const saida = (category_id, amount) => ({ transaction_type: 'expense', category_id, amount });
  const transacoes = [saida('c-ali', 600), saida('c-ali', 200), saida('c-tra', 400), saida('c-laz', 300), saida('c-sau', 100),
    { transaction_type: 'income', category_id: 'c-sal', amount: 5000 }];
  const resposta = responderConsulta({ consulta: { tipo: 'maior_gasto', inicio: '2026-09-01', fim: '2026-09-30' }, transacoes, dataReferencia: '2026-10-14', categorias });
  assert.equal(
    resposta.replace(/\u00a0/g, ' '),
    'No mês passado, onde você mais gastou foi Alimentação: R$ 800,00, 50% das saídas. Depois vêm Transporte, R$ 400,00 e Lazer, R$ 300,00.',
  );
  assert.equal(responderConsulta({ consulta: { tipo: 'maior_gasto' }, transacoes: [], dataReferencia: '2026-10-14' }), 'Neste mês, não encontrei saídas.');
});

test('comparação diz os dois totais e a diferença', () => {
  const saida = (amount, category_id = 'c-ali') => ({ transaction_type: 'expense', category_id, amount });
  const resposta = responderConsulta({
    consulta: { tipo: 'comparacao', inicio: '2026-10-01', fim: '2026-10-31' },
    transacoes: [saida(1000), saida(500)],
    transacoesAnteriores: [saida(1200)],
    dataReferencia: '2026-10-14',
  });
  assert.equal(
    resposta.replace(/\u00a0/g, ' '),
    'Neste mês você gastou R$ 1.500,00; de 01/09 a 14/09, R$ 1.200,00. São R$ 300,00 a mais, 25%.',
  );
  const igual = responderConsulta({
    consulta: { tipo: 'comparacao', inicio: '2026-09-01', fim: '2026-09-30', categoria: { id: 'c-ali', name: 'Alimentação' } },
    transacoes: [saida(100), saida(50, 'c-out')],
    transacoesAnteriores: [saida(100)],
    dataReferencia: '2026-10-14',
  });
  assert.match(igual.replace(/\u00a0/g, ' '), /^No mês passado você gastou R\$ 100,00 com Alimentação; em agosto, R\$ 100,00\. Ficou igual\.$/);
});

test('a pagar: sem período, os próximos 7 dias, da saída mais próxima à mais distante', () => {
  assert.deepEqual(periodoDaConsulta({ tipo: 'a_pagar' }, '2026-10-14'), { inicio: '2026-10-14', fim: '2026-10-21' });
  const previstas = [
    { transaction_type: 'expense', description: 'Internet', amount: 120, transaction_date: '2026-10-20' },
    { transaction_type: 'expense', description: 'Aluguel', amount: 1500, transaction_date: '2026-10-15' },
    { transaction_type: 'income', description: 'Salário', amount: 5000, transaction_date: '2026-10-16' },
  ];
  const resposta = responderConsulta({ consulta: { tipo: 'a_pagar' }, transacoes: previstas, dataReferencia: '2026-10-14' });
  assert.equal(
    resposta.replace(/\u00a0/g, ' '),
    'De 14/10 a 21/10, você tem 2 saídas previstas, que somam R$ 1.620,00: 15/10, Aluguel, R$ 1.500,00; 20/10, Internet, R$ 120,00.',
  );
  assert.equal(responderConsulta({ consulta: { tipo: 'a_pagar' }, transacoes: [], dataReferencia: '2026-10-14' }), 'De 14/10 a 21/10, você não tem saídas previstas.');
});
