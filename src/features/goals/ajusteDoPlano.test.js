import assert from 'node:assert/strict';
import test from 'node:test';
import { AJUSTES, mensagemDoErroAoAjustar, opcoesDeAjuste, primeiraOpcaoDisponivel } from './ajusteDoPlano.js';
import { calcRhythmStatus } from './goalCalc.js';

const HOJE = new Date(2026, 9, 12);

// formatCurrency separa "R$" do número com espaço não separável.
function texto(valor) {
  return valor.replace(/\u00a0/g, ' ');
}

// Criada em outubro para março com R$ 600 por mês (5 meses), e nada
// guardado até dezembro: em dezembro sobram 3 meses para R$ 3.000.
function meta(campos = {}) {
  return {
    name: 'Viagem',
    status: 'active',
    target_amount: 3000,
    current_amount: 0,
    planned_monthly_amount: 600,
    start_date: '2026-10-01',
    target_date: '2027-03-31',
    ...campos,
  };
}

const DEZEMBRO = new Date(2026, 11, 5);

function porValor(opcoes) {
  return Object.fromEntries(opcoes.map((opcao) => [opcao.value, opcao]));
}

test('ajuste: a meta do exemplo está atrasada antes do ajuste', () => {
  assert.equal(calcRhythmStatus(meta(), DEZEMBRO), 'late');
});

test('ajuste: as quatro opções na ordem do handoff', () => {
  const valores = opcoesDeAjuste(meta(), DEZEMBRO).map((opcao) => opcao.value);
  assert.deepEqual(valores, [AJUSTES.MENSAL, AJUSTES.DATA, AJUSTES.VALOR, AJUSTES.PAUSAR]);
});

test('ajuste: guardar mais por mês mantém a data', () => {
  const { mensal } = porValor(opcoesDeAjuste(meta(), DEZEMBRO));
  assert.deepEqual(mensal.alteracoes, { planned_monthly_amount: 1000 });
  assert.equal(texto(mensal.descricao), 'Guarde R$ 1.000,00 por mês e chegue lá em março de 2027.');
});

test('ajuste: mudar a data mantém o valor por mês', () => {
  const { data } = porValor(opcoesDeAjuste(meta(), DEZEMBRO));
  assert.deepEqual(data.alteracoes, { target_date: '2027-05-31' });
  assert.equal(texto(data.descricao), 'Guardando R$ 600,00 por mês, você chega lá em maio de 2027.');
});

test('ajuste: reduzir a meta mantém data e valor por mês', () => {
  const { valor } = porValor(opcoesDeAjuste(meta({ current_amount: 150.5 }), DEZEMBRO));
  assert.deepEqual(valor.alteracoes, { target_amount: 1950.5 });
  assert.equal(texto(valor.descricao), 'A meta passa para R$ 1.950,50, guardando R$ 600,00 por mês até março de 2027.');
});

test('ajuste: pausar muda só o status', () => {
  const { pausar } = porValor(opcoesDeAjuste(meta(), DEZEMBRO));
  assert.deepEqual(pausar.alteracoes, { status: 'paused' });
});

test('ajuste: depois de salvar qualquer opção de plano, a meta volta ao ritmo', () => {
  const opcoes = opcoesDeAjuste(meta(), DEZEMBRO).filter((opcao) => opcao.value !== AJUSTES.PAUSAR);
  for (const opcao of opcoes) {
    assert.equal(calcRhythmStatus(meta(opcao.alteracoes), DEZEMBRO), 'on_track', opcao.value);
  }
});

test('ajuste: prazo vencido deixa só mudar a data e pausar', () => {
  const vencida = meta({ target_date: '2026-11-30' });
  const opcoes = porValor(opcoesDeAjuste(vencida, DEZEMBRO));
  assert.equal(opcoes.mensal.alteracoes, null);
  assert.equal(opcoes.valor.alteracoes, null);
  assert.deepEqual(opcoes.data.alteracoes, { target_date: '2027-05-31' });
  assert.equal(primeiraOpcaoDisponivel(Object.values(opcoes)), AJUSTES.DATA);
});

test('ajuste: sem valor por mês definido, mudar a data e reduzir ficam desabilitados', () => {
  const opcoes = porValor(opcoesDeAjuste(meta({ planned_monthly_amount: null }), DEZEMBRO));
  assert.deepEqual(opcoes.mensal.alteracoes, { planned_monthly_amount: 1000 });
  assert.equal(opcoes.data.alteracoes, null);
  assert.equal(opcoes.valor.alteracoes, null);
  assert.match(opcoes.data.descricao, /Escolha antes quanto guardar por mês/);
});

test('ajuste: valor por mês que levaria mais de 50 anos não vira data', () => {
  const { data } = porValor(opcoesDeAjuste(meta({ planned_monthly_amount: 1, target_amount: 100000 }), DEZEMBRO));
  assert.equal(data.alteracoes, null);
});

test('ajuste: a mensagem de erro segue a opção', () => {
  assert.equal(mensagemDoErroAoAjustar(AJUSTES.PAUSAR), 'Não foi possível pausar a meta. Tente de novo.');
  assert.equal(mensagemDoErroAoAjustar(AJUSTES.DATA), 'Não foi possível ajustar o plano. Tente de novo.');
});

test('ajuste: o mês do prazo conta como o último mês de aporte', () => {
  const { mensal } = porValor(opcoesDeAjuste(meta({ target_date: '2026-10-31' }), HOJE));
  assert.deepEqual(mensal.alteracoes, { planned_monthly_amount: 3000 });
});
