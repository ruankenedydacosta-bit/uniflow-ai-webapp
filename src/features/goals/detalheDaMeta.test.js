import assert from 'node:assert/strict';
import test from 'node:test';
import { dataDoAporte, numerosDaMeta, precisaDeAjuste, previsaoDaUni } from './detalheDaMeta.js';

const HOJE = new Date(2026, 9, 12);

// formatCurrency separa "R$" do número com espaço não separável.
function previsao(...argumentos) {
  return previsaoDaUni(...argumentos)?.replace(/\u00a0/g, ' ') ?? null;
}

function meta(campos = {}) {
  return {
    status: 'active',
    target_amount: 4000,
    current_amount: 1000,
    start_date: '2026-10-01',
    target_date: '2027-03-31',
    ...campos,
  };
}

function aportes(...valores) {
  return valores.map((amount, indice) => ({ id: String(indice), amount, contribution_date: '2026-10-01' }));
}

test('números da meta: falta, mês do prazo e valor por mês arredondado para cima', () => {
  const numeros = numerosDaMeta(meta({ target_date: null, planned_monthly_amount: 333.4 }));
  assert.equal(numeros.guardado, 1000);
  assert.equal(numeros.falta, 3000);
  assert.equal(numeros.porMes, 334);
  assert.equal(numeros.data, null);
  assert.equal(numerosDaMeta(meta()).data, 'março de 2027');
});

test('números da meta: valor alcançado não pede valor por mês', () => {
  assert.equal(numerosDaMeta(meta({ current_amount: 4000 })).porMes, null);
  assert.equal(numerosDaMeta(meta({ status: 'completed' })).porMes, null);
});

test('previsão da Uni: média dos últimos 3 aportes, ignorando o quarto', () => {
  const texto = previsao(meta(), aportes(500, 500, 500, 10), HOJE);
  assert.equal(texto, 'Pela média dos últimos 3 aportes (R$ 500,00), você chega lá em abril de 2027. Isso é 1 mês depois do prazo.');
});

test('previsão da Uni: dentro do prazo', () => {
  const texto = previsao(meta(), aportes(1000, 1000), HOJE);
  assert.equal(texto, 'Pela média dos últimos 2 aportes (R$ 1.000,00), você chega lá em janeiro de 2027. Isso fica dentro do prazo.');
});

test('previsão da Uni: um aporte só e meta sem prazo', () => {
  const texto = previsao(meta({ target_date: null }), aportes(3000), HOJE);
  assert.equal(texto, 'Pelo último aporte (R$ 3.000,00), você chega lá em novembro de 2026.');
});

test('previsão da Uni: média em centavos', () => {
  const texto = previsao(meta({ target_date: null, current_amount: 0 }), aportes(0.1, 0.2), HOJE);
  assert.match(texto, /R\$ 0,15/);
  assert.match(texto, /mais de 50 anos/);
});

test('previsão da Uni: sem aporte, convida a registrar', () => {
  assert.equal(previsaoDaUni(meta(), [], HOJE), 'Registre um aporte para a Uni prever quando você chega lá.');
});

test('previsão da Uni: meta concluída, pausada ou com valor alcançado não tem previsão', () => {
  assert.equal(previsaoDaUni(meta({ status: 'completed' }), aportes(500), HOJE), null);
  assert.equal(previsaoDaUni(meta({ status: 'paused' }), aportes(500), HOJE), null);
  assert.equal(previsaoDaUni(meta({ current_amount: 4000 }), aportes(500), HOJE), null);
});

test('ajustar plano só em meta ativa em Atenção ou Atrasada', () => {
  const atrasada = meta({ start_date: '2025-01-01', target_date: '2026-01-31', current_amount: 0 });
  assert.equal(precisaDeAjuste(atrasada), true);
  assert.equal(precisaDeAjuste({ ...atrasada, status: 'paused' }), false);
  assert.equal(precisaDeAjuste(meta({ target_date: null })), false);
});

test('data do aporte: ano só quando é outro ano', () => {
  assert.equal(dataDoAporte('2026-10-05', HOJE), '5 de out');
  assert.equal(dataDoAporte('2025-12-20', HOJE), '20 de dez de 2025');
});
