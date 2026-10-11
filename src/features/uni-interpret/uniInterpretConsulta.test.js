import assert from 'node:assert/strict';
import test from 'node:test';

import { consultaRespondivel, periodoDaConsulta, responderConsulta, rotuloDoPeriodo } from './uniInterpretConsulta.js';

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
