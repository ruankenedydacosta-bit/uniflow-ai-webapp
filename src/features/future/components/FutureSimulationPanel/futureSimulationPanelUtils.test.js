import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSimulationDeltaInput } from './futureSimulationPanelUtils.js';

test('campo vazio representa 0', () => {
  assert.equal(parseSimulationDeltaInput(''), 0);
});

test('apenas "-" durante digitação nao quebra e vira 0 temporariamente', () => {
  assert.equal(parseSimulationDeltaInput('-'), 0);
});

test('apenas "+" durante digitação vira 0', () => {
  assert.equal(parseSimulationDeltaInput('+'), 0);
});

test('numero positivo valido e convertido corretamente', () => {
  assert.equal(parseSimulationDeltaInput('1500'), 1500);
});

test('numero negativo valido e convertido corretamente', () => {
  assert.equal(parseSimulationDeltaInput('-300'), -300);
});

test('numero decimal valido e convertido corretamente', () => {
  assert.equal(parseSimulationDeltaInput('150.50'), 150.5);
});

test('numero negativo decimal e convertido corretamente', () => {
  assert.equal(parseSimulationDeltaInput('-150.50'), -150.5);
});

test('texto arbitrario nunca e aceito parcialmente (nao usa parseFloat)', () => {
  assert.equal(parseSimulationDeltaInput('12abc'), 0);
  assert.equal(parseSimulationDeltaInput('abc12'), 0);
  assert.equal(parseSimulationDeltaInput('R$ 100'), 0);
});

test('entrada nao-string nunca gera NaN', () => {
  assert.equal(parseSimulationDeltaInput(null), 0);
  assert.equal(parseSimulationDeltaInput(undefined), 0);
  assert.equal(parseSimulationDeltaInput(1500), 0);
  assert.equal(Number.isNaN(parseSimulationDeltaInput(null)), false);
});

test('espacos ao redor sao tolerados', () => {
  assert.equal(parseSimulationDeltaInput('  200  '), 200);
});

// F5.6: auditoria de valores extremos/ambiguos — "-0" e formatos como "0,00"
// (nao suportados, ja que o campo e type="number" com separador de ponto)
// nunca podem virar simulacao "ativa" nem exibir sinal negativo espurio.
test('"-0" e convertido para um valor que nunca ativa a simulacao (-0 !== 0 e falso em JS)', () => {
  const result = parseSimulationDeltaInput('-0');
  assert.equal(result !== 0, false);
});

test('notacao cientifica nao e aceita (rejeitada, nunca vira numero via conversao parcial)', () => {
  assert.equal(parseSimulationDeltaInput('1e5'), 0);
  assert.equal(parseSimulationDeltaInput('1E5'), 0);
});

test('multiplos separadores decimais sao rejeitados, nunca truncados silenciosamente', () => {
  assert.equal(parseSimulationDeltaInput('1.2.3'), 0);
});

test('sinais duplicados sao rejeitados', () => {
  assert.equal(parseSimulationDeltaInput('--5'), 0);
  assert.equal(parseSimulationDeltaInput('++5'), 0);
});

test('valor extremo finito e aceito sem truncar (o motor/clamp decide o efeito, nao o parser)', () => {
  assert.equal(parseSimulationDeltaInput('999999999'), 999999999);
});

test('Infinity como texto nao e aceito (nao ha "Infinity" numerico via regex)', () => {
  assert.equal(parseSimulationDeltaInput('Infinity'), 0);
});

test('nunca retorna NaN para nenhuma entrada testada', () => {
  const inputs = ['', '-', '+', '.', '1500', '-300', '12abc', null, undefined, '   '];
  for (const input of inputs) {
    assert.equal(Number.isNaN(parseSimulationDeltaInput(input)), false);
  }
});
