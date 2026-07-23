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

test('nunca retorna NaN para nenhuma entrada testada', () => {
  const inputs = ['', '-', '+', '.', '1500', '-300', '12abc', null, undefined, '   '];
  for (const input of inputs) {
    assert.equal(Number.isNaN(parseSimulationDeltaInput(input)), false);
  }
});
