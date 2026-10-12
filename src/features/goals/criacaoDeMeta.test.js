import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calcularPlano,
  erroDoPasso,
  fraseDoPlano,
  montarMetaParaCriar,
  tiposDeMeta,
} from './criacaoDeMeta.js';
import { calcRequiredMonthlyAmount } from './goalCalc.js';

const HOJE = new Date(2026, 9, 11);

function formulario(campos = {}) {
  return {
    tipo: 'travel',
    nome: 'Viagem',
    alvo: 4000,
    guardado: 1000,
    modo: 'data',
    prazo: '2026-12',
    porMes: 0,
    contaId: '',
    prioridade: 'medium',
    lembrete: false,
    diaDoLembrete: 11,
    ...campos,
  };
}

test('no espaço Empresa, o tipo Empresa ocupa o lugar de Educação', () => {
  const pessoais = tiposDeMeta('personal').map((tipo) => tipo.value);
  const empresa = tiposDeMeta('business').map((tipo) => tipo.value);
  assert.ok(pessoais.includes('education'));
  assert.ok(!pessoais.includes('business'));
  assert.ok(!empresa.includes('education'));
  assert.equal(empresa.indexOf('business'), pessoais.indexOf('education'));
});

test('planejar por data calcula o valor por mês, arredondado para cima', () => {
  const plano = calcularPlano({ alvo: 4000, guardado: 1000, modo: 'data', prazo: '2026-12', hoje: HOJE });
  assert.equal(plano.meses, 2);
  assert.equal(plano.porMes, 1500);
  assert.equal(plano.dataAlvo, '2026-12-31');

  const quebrado = calcularPlano({ alvo: 1000, modo: 'data', prazo: '2027-01', hoje: HOJE });
  assert.equal(quebrado.porMes, 334);
});

test('planejar por valor por mês calcula a data', () => {
  const plano = calcularPlano({ alvo: 10000, guardado: 2000, modo: 'mensal', porMes: 750, hoje: HOJE });
  assert.equal(plano.meses, 11);
  assert.equal(plano.dataAlvo, '2027-09-30');
  assert.equal(plano.textoDoPrazo, 'setembro de 2027');
});

test('o prazo precisa ser depois do mês atual', () => {
  assert.equal(calcularPlano({ alvo: 4000, modo: 'data', prazo: '2026-10', hoje: HOJE }), null);
  assert.equal(calcularPlano({ alvo: 4000, modo: 'data', prazo: '2026-09', hoje: HOJE }), null);
  assert.equal(
    erroDoPasso(2, formulario({ prazo: '2026-10' }), null),
    'Escolha um mês depois do atual.',
  );
});

test('o percentual das entradas do mês só aparece com entradas', () => {
  const comEntradas = calcularPlano({ alvo: 4000, modo: 'mensal', porMes: 500, entradasDoMes: 4000, hoje: HOJE });
  assert.equal(comEntradas.percentualDasEntradas, 13);
  assert.match(fraseDoPlano(comEntradas, 'mensal'), /13% das suas entradas deste mês\.$/);

  const semEntradas = calcularPlano({ alvo: 4000, modo: 'mensal', porMes: 500, entradasDoMes: 0, hoje: HOJE });
  assert.equal(semEntradas.percentualDasEntradas, null);
  assert.doesNotMatch(fraseDoPlano(semEntradas, 'mensal'), /entradas/);
});

test('o passo 2 não segue sem valor, com guardado cobrindo a meta ou sem plano', () => {
  assert.equal(erroDoPasso(2, formulario({ alvo: 0 }), null), 'Informe o valor da meta.');
  assert.match(erroDoPasso(2, formulario({ guardado: 4000 }), null), /já cobre a meta/);
  assert.equal(erroDoPasso(2, formulario({ prazo: '' }), null), 'Escolha o mês do prazo.');
  assert.equal(erroDoPasso(2, formulario({ modo: 'mensal', porMes: 0 }), null), 'Informe quanto vai guardar por mês.');

  const lento = formulario({ modo: 'mensal', porMes: 1 });
  const planoLento = calcularPlano({ alvo: lento.alvo, guardado: lento.guardado, modo: 'mensal', porMes: 1, hoje: HOJE });
  assert.match(erroDoPasso(2, lento, planoLento), /mais de 50 anos/);
});

test('o passo 1 pede nome', () => {
  assert.equal(erroDoPasso(1, formulario({ nome: '  ' }), null), 'Escreva um nome para a meta.');
  assert.equal(erroDoPasso(1, formulario(), null), null);
});

test('a meta criada começa hoje e leva o plano, a conta e o lembrete', () => {
  const dados = formulario({ contaId: 'conta-1', lembrete: true, diaDoLembrete: 5, prioridade: 'high' });
  const plano = calcularPlano({ alvo: 4000, guardado: 1000, modo: 'data', prazo: '2026-12', hoje: HOJE });
  assert.deepEqual(montarMetaParaCriar(dados, plano, HOJE), {
    name: 'Viagem',
    category: 'travel',
    target_amount: 4000,
    initial_amount: 1000,
    current_amount: 1000,
    planned_monthly_amount: 1500,
    start_date: '2026-10-11',
    target_date: '2026-12-31',
    priority: 'high',
    status: 'active',
    linked_account_id: 'conta-1',
    reminder_day: 5,
  });

  const semExtras = montarMetaParaCriar(formulario(), plano, HOJE);
  assert.equal(semExtras.linked_account_id, undefined);
  assert.equal(semExtras.reminder_day, undefined);
});

// O card da lista recalcula o valor por mês com goalCalc. A meta recém
// criada não pode mostrar outro valor por mês que o do resumo.
test('o goalCalc chega ao mesmo valor por mês do plano', () => {
  const hoje = new Date();
  const prazo = new Date(hoje.getFullYear(), hoje.getMonth() + 6, 1);
  const mes = `${prazo.getFullYear()}-${String(prazo.getMonth() + 1).padStart(2, '0')}`;
  const dados = formulario({ alvo: 6000, guardado: 0, prazo: mes });
  const plano = calcularPlano({ alvo: 6000, guardado: 0, modo: 'data', prazo: mes, hoje });
  const meta = montarMetaParaCriar(dados, plano, hoje);

  assert.equal(calcRequiredMonthlyAmount(meta), plano.porMes);
});
