import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LIMITE_DA_SEQUENCIA,
  atrasosDaSequencia,
  lerMilissegundos,
  prefereMovimentoReduzido,
  trajetoriasDasFaiscas,
  valorDaContagem,
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
  for (const nome of [
    'toque', 'saida', 'entrada', 'navegar', 'contar', 'reduzido', 'sequencia',
    'fundo', 'linha', 'brilho', 'faisca', 'anel',
  ]) {
    assert.match(token(nome) ?? '', /^\d+ms$/, `--uf-motion-${nome}`);
  }
  for (const nome of ['saida', 'navegar', 'acelera', 'faisca']) {
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

test('valorDaContagem sai do valor antigo, assenta no novo e não passa dele', () => {
  assert.equal(valorDaContagem(100, 148.9, 0), 100);
  assert.equal(valorDaContagem(100, 148.9, 1), 148.9);
  assert.equal(valorDaContagem(100, 148.9, 2), 148.9);
  assert.equal(valorDaContagem(100, 148.9, -1), 100);
  // Ease-out: na metade do tempo já andou mais da metade do caminho.
  assert.ok(valorDaContagem(0, 100, 0.5) > 50);
  assert.ok(valorDaContagem(100, 0, 0.5) < 50);
});

test('trajetoriasDasFaiscas espalha as 12 faíscas do salvar em volta do ponto, com as cores da marca', () => {
  const meio = () => 0.5;
  const faiscas = trajetoriasDasFaiscas(12, 0.7, { voo: 900, aleatorio: meio });
  assert.equal(faiscas.length, 12);
  for (const faisca of faiscas) {
    const distancia = Math.hypot(faisca.dx, faisca.dy);
    assert.ok(Math.abs(distancia - 110 * 0.7) < 1e-9);
    assert.equal(faisca.duracao, 1100);
    assert.match(faisca.cor, /^var\(--uf-app-brand-/);
  }
  assert.notEqual(faiscas[0].cor, faiscas[1].cor);
  // Uma volta inteira: há faíscas para a esquerda e para a direita.
  assert.ok(faiscas.some((faisca) => faisca.dx > 0) && faiscas.some((faisca) => faisca.dx < 0));
});

test('trajetoriasDasFaiscas mantém a distância entre 70 e 150 px vezes a força', () => {
  for (const sorteio of [0, 0.999]) {
    const [faisca] = trajetoriasDasFaiscas(1, 1, { voo: 900, aleatorio: () => sorteio });
    const distancia = Math.hypot(faisca.dx, faisca.dy);
    assert.ok(distancia >= 70 && distancia < 150.1, String(distancia));
  }
});
