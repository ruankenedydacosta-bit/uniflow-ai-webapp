import assert from 'node:assert/strict';
import test from 'node:test';
import {
  atalhosDeValor,
  erroDoMovimento,
  mensagemDoErro,
  mensagemDoErroAoExcluir,
  montarMovimento,
  MOVIMENTOS,
  transferenciaDaMeta,
  valorSugerido,
} from './aporteDaMeta.js';

const HOJE = new Date(2026, 9, 12);

// Sem data-alvo, o valor do mês é o planejado: o teste não depende do dia.
function meta(campos = {}) {
  return {
    status: 'active',
    target_amount: 4000,
    current_amount: 1000,
    planned_monthly_amount: 500,
    target_date: null,
    linked_account_id: 'poupanca',
    ...campos,
  };
}

function formulario(campos = {}) {
  return {
    movimento: MOVIMENTOS.APORTE,
    centavos: 50000,
    data: '2026-10-12',
    observacao: '',
    registrarNoFinanceiro: true,
    contaId: 'corrente',
    ...campos,
  };
}

const CONTAS = [
  { id: 'corrente', name: 'Corrente' },
  { id: 'poupanca', name: 'Poupança' },
];

test('aporte já vem com o valor do mês; retirada começa vazia', () => {
  assert.equal(valorSugerido(meta(), MOVIMENTOS.APORTE), 50000);
  assert.equal(valorSugerido(meta(), MOVIMENTOS.RETIRADA), 0);
  assert.equal(valorSugerido(meta({ planned_monthly_amount: null }), MOVIMENTOS.APORTE), 0);
});

test('atalhos do aporte: valor do mês e o que falta, sem repetir', () => {
  assert.deepEqual(atalhosDeValor(meta(), MOVIMENTOS.APORTE), [
    { value: 50000, label: 'Valor do mês' },
    { value: 300000, label: 'Tudo o que falta' },
  ]);
  // Falta R$ 500 e o mês pede R$ 500: um atalho só.
  assert.deepEqual(atalhosDeValor(meta({ current_amount: 3500 }), MOVIMENTOS.APORTE), [
    { value: 50000, label: 'Valor do mês' },
  ]);
});

test('atalho da retirada: tudo o que está guardado; meta vazia não tem atalho', () => {
  assert.deepEqual(atalhosDeValor(meta(), MOVIMENTOS.RETIRADA), [
    { value: 100000, label: 'Tudo o que está guardado' },
  ]);
  assert.deepEqual(atalhosDeValor(meta({ current_amount: 0 }), MOVIMENTOS.RETIRADA), []);
});

test('transferência exige conta vinculada e outra conta para a ponta oposta', () => {
  const comConta = transferenciaDaMeta(meta(), CONTAS);
  assert.equal(comConta.disponivel, true);
  assert.equal(comConta.vinculada.id, 'poupanca');
  assert.deepEqual(comConta.contas.map((conta) => conta.id), ['corrente']);

  const semVinculada = transferenciaDaMeta(meta({ linked_account_id: null }), CONTAS);
  assert.equal(semVinculada.disponivel, false);
  assert.match(semVinculada.motivo, /vincule uma conta à meta/);

  // Conta vinculada desativada conta como sem conta vinculada.
  assert.equal(transferenciaDaMeta(meta({ linked_account_id: 'antiga' }), CONTAS).disponivel, false);

  const soAVinculada = transferenciaDaMeta(meta(), [CONTAS[1]]);
  assert.equal(soAVinculada.disponivel, false);
  assert.match(soAVinculada.motivo, /cadastre outra conta/);
});

test('validação: valor, retirada até o guardado, data até hoje e conta com Financeiro ligado', () => {
  assert.equal(erroDoMovimento(formulario(), meta(), HOJE), null);
  assert.equal(erroDoMovimento(formulario({ centavos: 0 }), meta(), HOJE), 'Informe o valor.');
  assert.equal(erroDoMovimento(formulario({ data: '' }), meta(), HOJE), 'Escolha a data.');
  assert.equal(erroDoMovimento(formulario({ data: '2026-10-13' }), meta(), HOJE), 'Escolha uma data até hoje.');
  assert.equal(erroDoMovimento(formulario({ contaId: '' }), meta(), HOJE), 'Escolha a conta de origem.');
  assert.equal(erroDoMovimento(formulario({ contaId: '', registrarNoFinanceiro: false }), meta(), HOJE), null);

  const retirada = { movimento: MOVIMENTOS.RETIRADA };
  assert.equal(erroDoMovimento(formulario({ ...retirada, centavos: 100000 }), meta(), HOJE), null);
  assert.equal(
    erroDoMovimento(formulario({ ...retirada, centavos: 100001 }), meta(), HOJE)?.replace(/\u00a0/g, ' '),
    'A retirada passa do valor guardado (R$ 1.000,00).',
  );
  assert.equal(erroDoMovimento(formulario({ ...retirada, contaId: '' }), meta(), HOJE), 'Escolha a conta de destino.');
});

test('payload: retirada vai negativa; conta só segue com o Financeiro ligado', () => {
  assert.deepEqual(montarMovimento(formulario({ observacao: '  13º  ' }), 'op-1'), {
    amount: 500,
    contribution_date: '2026-10-12',
    note: '13º',
    linked_account_id: 'corrente',
    registrar_no_financeiro: true,
    client_operation_id: 'op-1',
  });
  const retirada = montarMovimento(formulario({ movimento: MOVIMENTOS.RETIRADA, centavos: 1999, registrarNoFinanceiro: false }), 'op-2');
  assert.equal(retirada.amount, -19.99);
  assert.equal(retirada.linked_account_id, undefined);
  assert.equal(retirada.note, undefined);
});

test('erros do banco viram texto de tela; erro desconhecido pede nova tentativa', () => {
  assert.equal(mensagemDoErro({ message: 'meta_concluida' }), 'A meta está concluída e não recebe aporte nem retirada.');
  assert.equal(mensagemDoErro({ message: 'Failed to fetch' }, MOVIMENTOS.RETIRADA), 'Não foi possível registrar a retirada. Tente de novo.');
  assert.equal(mensagemDoErro(null, MOVIMENTOS.APORTE), 'Não foi possível registrar o aporte. Tente de novo.');
  assert.match(mensagemDoErroAoExcluir({ message: 'retirada_maior_que_guardado' }), /Exclua antes a retirada/);
  assert.equal(mensagemDoErroAoExcluir({ message: 'x' }), 'Não foi possível excluir. Tente de novo.');
});
