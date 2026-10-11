import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LIMITE_DA_SEQUENCIA,
  atrasosDaSequencia,
  lerMilissegundos,
  prefereMovimentoReduzido,
} from './movimento.js';

const tema = readFileSync(new URL('../styles/theme.css', import.meta.url), 'utf8');

function token(nome) {
  return tema.match(new RegExp(`--uf-motion-${nome}:\\s*([^;]+);`))?.[1].trim();
}

test('lerMilissegundos converte o valor do token e zera o que não é número', () => {
  assert.equal(lerMilissegundos('120ms'), 120);
  assert.equal(lerMilissegundos(' 45ms'), 45);
  assert.equal(lerMilissegundos(''), 0);
  assert.equal(lerMilissegundos(undefined), 0);
});

test('a sequência de entrada pega no máximo 8 blocos, com intervalo fixo', () => {
  assert.deepEqual(atrasosDaSequencia(3, { inicio: 90, intervalo: 45 }), [90, 135, 180]);
  assert.equal(atrasosDaSequencia(20, { inicio: 0, intervalo: 45 }).length, LIMITE_DA_SEQUENCIA);
  assert.deepEqual(atrasosDaSequencia(0, { inicio: 90, intervalo: 45 }), []);
});

test('prefereMovimentoReduzido segue a preferência do sistema e tolera ambiente sem matchMedia', () => {
  assert.equal(prefereMovimentoReduzido({ matchMedia: () => ({ matches: true }) }), true);
  assert.equal(prefereMovimentoReduzido({ matchMedia: () => ({ matches: false }) }), false);
  assert.equal(prefereMovimentoReduzido({}), false);
  assert.equal(prefereMovimentoReduzido(undefined), false);
});

test('theme.css define as durações e curvas que o movimento lê', () => {
  for (const nome of ['toque', 'saida', 'entrada', 'navegar', 'contar', 'reduzido', 'sequencia']) {
    assert.match(token(nome) ?? '', /^\d+ms$/, `--uf-motion-${nome}`);
  }
  for (const nome of ['saida', 'navegar', 'acelera']) {
    assert.match(token(`curva-${nome}`) ?? '', /^cubic-bezier\(/, `--uf-motion-curva-${nome}`);
  }
});

test('cada mola tem curva linear() de 0 a 1 e a duração até assentar', () => {
  for (const nome of ['salto', 'macio', 'estalo', 'folha']) {
    const curva = token(`mola-${nome}`) ?? '';
    const pontos = curva.replace(/^linear\(|\)$/g, '').split(',').map(Number);
    assert.equal(pontos[0], 0, `início da mola ${nome}`);
    assert.equal(pontos.at(-1), 1, `fim da mola ${nome}`);
    assert.match(token(`mola-${nome}-duracao`) ?? '', /^\d+ms$/, `duração da mola ${nome}`);
  }
});
