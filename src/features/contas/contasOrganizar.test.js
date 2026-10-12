import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANTECEDENCIA_DO_LEMBRETE_DIAS,
  TIPOS_DE_CONTA,
  cicloDoCartao,
  dataDoLembreteDoCartao,
  proximoVencimento,
  ehContaDoOpenFinance,
  faturaAberta,
  formatarDiaCurto,
  lancamentosDaConta,
  limiteUsado,
  montarListaDeCartoes,
  montarListaDeContas,
  periodoDosCartoes,
  permissoesDaConta,
  resumoDaConta,
  rotuloDoTipo,
  saldoDaConta,
  sinalDoLancamento,
  textoDoLembreteDoCartao,
  validarCartao,
} from './contasOrganizar.js';

const contas = [
  { id: 'c1', name: 'Nubank', account_type: 'checking', initial_balance: 100, source_type: 'manual' },
  { id: 'c2', name: 'Carteira', account_type: 'cash', initial_balance: 50, source_type: 'manual' },
  { id: 'c3', name: 'Cartão Inter', account_type: 'credit_card', initial_balance: 0, source_type: 'manual' },
  { id: 'c4', name: 'Antiga', account_type: 'savings', initial_balance: 999, is_active: false },
  { id: 'c5', name: 'Itaú', account_type: 'checking', initial_balance: 0, source_type: 'open_finance' },
];

test('montarListaDeContas: contas ativas em ordem alfabética, cartões separados, total só das contas', () => {
  const lista = montarListaDeContas({
    accounts: contas,
    balances: [{ account_id: 'c1', derived_balance: '250.5' }, { account_id: 'c3', derived_balance: -80 }],
  });
  assert.deepEqual(lista.contas.map((c) => c.name), ['Carteira', 'Itaú', 'Nubank']);
  assert.deepEqual(lista.cartoes.map((c) => c.name), ['Cartão Inter']);
  assert.equal(lista.contas.find((c) => c.id === 'c1').saldo, 250.5);
  assert.equal(lista.contas.find((c) => c.id === 'c2').saldo, 50);
  assert.equal(lista.cartoes[0].saldo, -80);
  assert.equal(lista.total, 300.5);
  assert.equal(lista.contas.find((c) => c.id === 'c5').openFinance, true);
  assert.equal(lista.contas.find((c) => c.id === 'c1').tipoRotulo, 'Conta corrente');
});

test('montarListaDeContas aceita entradas vazias', () => {
  assert.deepEqual(montarListaDeContas({ accounts: null, balances: undefined }), { contas: [], cartoes: [], total: 0 });
});

test('saldoDaConta usa o saldo derivado e cai no inicial sem RPC', () => {
  assert.equal(saldoDaConta(contas[0], []), 100);
  assert.equal(saldoDaConta(contas[0], [{ account_id: 'c1', derived_balance: 0 }]), 0);
});

test('rotuloDoTipo cobre os 7 tipos e cai em "Outra conta" para valor desconhecido', () => {
  assert.equal(rotuloDoTipo('digital_wallet'), 'Carteira digital');
  assert.equal(rotuloDoTipo('inexistente'), 'Outra conta');
});

test('a folha de nova conta não oferece cartão de crédito (fica para a folha própria)', () => {
  assert.ok(!TIPOS_DE_CONTA.includes('credit_card'));
  assert.equal(TIPOS_DE_CONTA.length, 6);
});

test('conta do Open Finance não edita, não ajusta saldo nem exclui, mesmo com permissão', () => {
  assert.equal(ehContaDoOpenFinance(contas[4]), true);
  assert.deepEqual(
    permissoesDaConta(contas[4], { canUpdate: true, canDelete: true }),
    { editar: false, ajustarSaldo: false, excluir: false },
  );
});

test('conta manual segue o papel no espaço; papel carregando nega tudo', () => {
  assert.deepEqual(
    permissoesDaConta(contas[0], { canUpdate: true, canDelete: false }),
    { editar: true, ajustarSaldo: true, excluir: false },
  );
  assert.deepEqual(
    permissoesDaConta(contas[0], { canUpdate: true, canDelete: true, isLoading: true }),
    { editar: false, ajustarSaldo: false, excluir: false },
  );
  assert.deepEqual(permissoesDaConta(null, { canUpdate: true }), { editar: false, ajustarSaldo: false, excluir: false });
});

const lancamentos = [
  { id: 't1', account_id: 'c1', transaction_type: 'income', amount: 1000, status: 'completed', transaction_date: '2026-10-02' },
  { id: 't2', account_id: 'c1', transaction_type: 'expense', amount: 200, status: 'completed', transaction_date: '2026-10-05' },
  { id: 't3', account_id: 'c2', destination_account_id: 'c1', transaction_type: 'transfer', amount: 50, status: 'completed', transaction_date: '2026-10-07' },
  { id: 't4', account_id: 'c1', destination_account_id: 'c2', transaction_type: 'transfer', amount: 30, status: 'completed', transaction_date: '2026-10-01' },
  { id: 't5', account_id: 'c1', transaction_type: 'adjustment', amount: 10, adjustment_delta: -10, status: 'completed', transaction_date: '2026-10-08' },
  { id: 't6', account_id: 'c1', transaction_type: 'expense', amount: 999, status: 'pending', transaction_date: '2026-10-09' },
  { id: 't7', account_id: null, transaction_type: 'expense', amount: 5, status: 'completed', transaction_date: '2026-10-09' },
];

test('lancamentosDaConta pega origem e destino, só concluídos, do mais recente ao mais antigo', () => {
  assert.deepEqual(lancamentosDaConta(lancamentos, 'c1').map((t) => t.id), ['t5', 't3', 't2', 't1', 't4']);
  assert.deepEqual(lancamentosDaConta(lancamentos, 'c2').map((t) => t.id), ['t3', 't4']);
});

test('sinalDoLancamento: entrada e transferência recebida somam; saída, transferência enviada e ajuste negativo subtraem', () => {
  assert.equal(sinalDoLancamento(lancamentos[0], 'c1'), 1);
  assert.equal(sinalDoLancamento(lancamentos[1], 'c1'), -1);
  assert.equal(sinalDoLancamento(lancamentos[2], 'c1'), 1);
  assert.equal(sinalDoLancamento(lancamentos[2], 'c2'), -1);
  assert.equal(sinalDoLancamento(lancamentos[3], 'c1'), -1);
  assert.equal(sinalDoLancamento(lancamentos[4], 'c1'), -1);
});

test('resumoDaConta soma entradas e saídas do mês pela conta', () => {
  assert.deepEqual(resumoDaConta(lancamentos, 'c1'), { entradas: 1050, saidas: 240, quantidade: 5 });
  assert.deepEqual(resumoDaConta(lancamentos, 'c9'), { entradas: 0, saidas: 0, quantidade: 0 });
});

// ----- Cartões -----

const cartao = { id: 'k1', name: 'Inter', account_type: 'credit_card', credit_limit: 2000, closing_day: 25, due_day: 5 };

test('cicloDoCartao: antes do fechamento, o ciclo fecha neste mês e vence no mês seguinte', () => {
  assert.deepEqual(cicloDoCartao(cartao, new Date(2026, 9, 12)), {
    inicio: '2026-09-26',
    fechamento: '2026-10-25',
    vencimento: '2026-11-05',
  });
});

test('cicloDoCartao: no dia do fechamento ainda é este ciclo; no dia seguinte vira o próximo', () => {
  assert.equal(cicloDoCartao(cartao, new Date(2026, 9, 25)).fechamento, '2026-10-25');
  assert.deepEqual(cicloDoCartao(cartao, new Date(2026, 9, 26)), {
    inicio: '2026-10-26',
    fechamento: '2026-11-25',
    vencimento: '2026-12-05',
  });
});

test('cicloDoCartao: vencimento depois do fechamento no mesmo mês e virada de ano', () => {
  const ciclo = cicloDoCartao({ closing_day: 10, due_day: 20 }, new Date(2026, 11, 28));
  assert.deepEqual(ciclo, { inicio: '2026-12-11', fechamento: '2027-01-10', vencimento: '2027-01-20' });
});

test('cicloDoCartao: dia 31 encosta no último dia de mês curto', () => {
  assert.deepEqual(cicloDoCartao({ closing_day: 31, due_day: 10 }, new Date(2026, 1, 15)), {
    inicio: '2026-02-01',
    fechamento: '2026-02-28',
    vencimento: '2026-03-10',
  });
  assert.equal(cicloDoCartao({ closing_day: 31, due_day: 10 }, new Date(2026, 2, 1)).inicio, '2026-03-01');
});

test('cicloDoCartao: sem dia de fechamento usa o mês civil e não tem vencimento', () => {
  assert.deepEqual(cicloDoCartao({ closing_day: null, due_day: null }, new Date(2026, 9, 12)), {
    inicio: '2026-10-01',
    fechamento: '2026-10-31',
    vencimento: null,
  });
});

const compras = [
  { id: 'k-a', account_id: 'k1', transaction_type: 'expense', amount: 100, status: 'completed', transaction_date: '2026-09-25' },
  { id: 'k-b', account_id: 'k1', transaction_type: 'expense', amount: 300, status: 'completed', transaction_date: '2026-09-26' },
  { id: 'k-c', account_id: 'k1', transaction_type: 'expense', amount: 50.5, status: 'completed', transaction_date: '2026-10-12' },
  { id: 'k-d', account_id: 'c1', destination_account_id: 'k1', transaction_type: 'transfer', amount: 20, status: 'completed', transaction_date: '2026-10-01' },
  { id: 'k-e', account_id: 'k1', transaction_type: 'expense', amount: 999, status: 'pending', transaction_date: '2026-10-02' },
  { id: 'k-f', account_id: 'k1', transaction_type: 'expense', amount: 70, status: 'completed', transaction_date: '2026-10-26' },
];

test('faturaAberta soma só as saídas do ciclo, desconta pagamento e ignora pendente', () => {
  const ciclo = { inicio: '2026-09-26', fechamento: '2026-10-25' };
  assert.equal(faturaAberta(compras, 'k1', ciclo), 330.5);
  assert.equal(faturaAberta([compras[3]], 'k1', ciclo), 0);
  assert.equal(faturaAberta([], 'k1', ciclo), 0);
});

test('limiteUsado: saldo negativo é o que o cartão deve; sem limite não tem percentual', () => {
  assert.deepEqual(limiteUsado(-500, 2000), { usado: 500, limite: 2000, disponivel: 1500, percentual: 25 });
  assert.deepEqual(limiteUsado(-2500, 2000), { usado: 2500, limite: 2000, disponivel: -500, percentual: 125 });
  assert.deepEqual(limiteUsado(120, 2000), { usado: 0, limite: 2000, disponivel: 2000, percentual: 0 });
  assert.deepEqual(limiteUsado(-500, null), { usado: 500, limite: null, disponivel: null, percentual: null });
});

test('montarListaDeCartoes junta ciclo, fatura e limite; periodoDosCartoes cobre todos os ciclos', () => {
  const hoje = new Date(2026, 9, 12);
  const { cartoes } = montarListaDeContas({
    accounts: [cartao, { ...cartao, id: 'k2', name: 'Nu', closing_day: 3, due_day: 10 }],
    balances: [{ account_id: 'k1', derived_balance: -400 }],
  });
  const lista = montarListaDeCartoes({ cartoes, transactions: compras, hoje });
  assert.equal(lista[0].fatura, 330.5);
  assert.equal(lista[0].limite.percentual, 20);
  assert.equal(lista[0].ciclo.vencimento, '2026-11-05');
  assert.deepEqual(periodoDosCartoes(cartoes, hoje), { dateFrom: '2026-09-26', dateTo: '2026-11-03' });
  assert.equal(periodoDosCartoes([], hoje), null);
});

test('validarCartao cobre nome, limite e dias', () => {
  assert.equal(validarCartao({ nome: 'Inter', limite: 2000, fechamento: 25, vencimento: 5 }), null);
  assert.equal(validarCartao({ nome: 'Inter', limite: 0, fechamento: 25, vencimento: 5 }), null);
  assert.match(validarCartao({ nome: '  ', limite: 2000, fechamento: 25, vencimento: 5 }), /nome/);
  assert.match(validarCartao({ nome: 'Inter', limite: -1, fechamento: 25, vencimento: 5 }), /limite/);
  assert.match(validarCartao({ nome: 'Inter', limite: 2000, fechamento: 0, vencimento: 5 }), /fechamento/);
  assert.match(validarCartao({ nome: 'Inter', limite: 2000, fechamento: 25, vencimento: 32 }), /vencimento/);
  assert.match(validarCartao({ nome: 'Inter', limite: 2000, fechamento: '', vencimento: 5 }), /fechamento/);
  assert.match(validarCartao({ nome: 'Inter', limite: 2000, fechamento: 5, vencimento: 5 }), /diferente/);
});

test('formatarDiaCurto', () => {
  assert.equal(formatarDiaCurto('2026-10-05'), '5 out');
});

// #184: lembrete do vencimento, espelho de proxima_data_de_vencimento (migration 067).
test('proximoVencimento: este mês se ainda não passou, senão o seguinte; dia 31 vira o último dia', () => {
  const hoje = new Date(2026, 9, 12);
  assert.equal(proximoVencimento({ due_day: 5 }, hoje), '2026-11-05');
  assert.equal(proximoVencimento({ due_day: 12 }, hoje), '2026-10-12');
  assert.equal(proximoVencimento({ due_day: 20 }, hoje), '2026-10-20');
  assert.equal(proximoVencimento({ due_day: 31 }, new Date(2026, 1, 10)), '2026-02-28');
  assert.equal(proximoVencimento({ due_day: 31 }, new Date(2026, 3, 30)), '2026-04-30');
  assert.equal(proximoVencimento({ due_day: 1 }, new Date(2026, 11, 15)), '2027-01-01');
});

test('dataDoLembreteDoCartao: 2 dias antes do próximo vencimento, atravessando o mês', () => {
  assert.equal(ANTECEDENCIA_DO_LEMBRETE_DIAS, 2);
  const hoje = new Date(2026, 9, 12);
  assert.equal(dataDoLembreteDoCartao({ due_day: 20 }, hoje), '2026-10-18');
  assert.equal(dataDoLembreteDoCartao({ due_day: 5 }, hoje), '2026-11-03');
  assert.equal(dataDoLembreteDoCartao({ due_day: 1 }, hoje), '2026-10-30');
  assert.equal(dataDoLembreteDoCartao({ due_day: 1 }, new Date(2026, 2, 5)), '2026-03-30');
  // Vencimento hoje: o lembrete já passou (o worker cobre de 0 a 2 dias antes).
  assert.equal(dataDoLembreteDoCartao({ due_day: 12 }, hoje), '2026-10-10');
});

test('textoDoLembreteDoCartao: dia do próximo aviso, só a regra depois do aviso, e como ativar', () => {
  const hoje = new Date(2026, 9, 12);
  assert.equal(
    textoDoLembreteDoCartao({ due_day: 20 }, hoje),
    'Com as notificações ativadas, você recebe um aviso 2 dias antes de cada vencimento. O próximo chega em 18 out.',
  );
  // Vence amanhã: o worker ainda envia hoje, então a linha não mostra data passada.
  assert.equal(
    textoDoLembreteDoCartao({ due_day: 13 }, hoje),
    'Com as notificações ativadas, você recebe um aviso 2 dias antes de cada vencimento.',
  );
  assert.match(textoDoLembreteDoCartao({ due_day: null }, hoje), /Cadastre o dia do vencimento/);
});

test('cartão sem due_day não tem lembrete', () => {
  const hoje = new Date(2026, 9, 12);
  assert.equal(proximoVencimento({ due_day: null }, hoje), null);
  assert.equal(dataDoLembreteDoCartao({}, hoje), null);
  assert.equal(dataDoLembreteDoCartao({ due_day: 0 }, hoje), null);
  assert.equal(dataDoLembreteDoCartao({ due_day: 32 }, hoje), null);
  assert.equal(dataDoLembreteDoCartao(null, hoje), null);
});
