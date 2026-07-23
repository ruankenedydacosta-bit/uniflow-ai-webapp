import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('informa que a projecao usa o historico de receitas e despesas registradas', async () => {
  const content = await source('FutureExplanation.jsx');
  assert.match(content, /histórico de receitas e despesas/);
});

test('informa que lancamentos recorrentes ainda nao sao adicionados automaticamente ao futuro', async () => {
  const content = await source('FutureExplanation.jsx');
  assert.match(content, /recorrentes ainda não são adicionados automaticamente aos meses futuros/);
});

test('nao afirma que recorrencias ja entram no calculo', async () => {
  const content = await source('FutureExplanation.jsx');
  assert.doesNotMatch(content, /recorrentes (são|entram|já entram|já são) (considerad|inclu|som)/i);
});

test('nao usa termos tecnicos internos (schema, recurrence_rule, scheduler, Edge Function)', async () => {
  const content = await source('FutureExplanation.jsx');
  assert.doesNotMatch(content, /schema|recurrence_rule|scheduler|Edge Function/i);
});

test('disclaimer de estimativa continua presente', async () => {
  const content = await source('FutureExplanation.jsx');
  assert.match(content, /Aviso importante/);
  assert.match(content, /Esta é uma projeção baseada exclusivamente nos seus dados atuais e em premissas simplificadas/);
  assert.match(content, /Resultados reais podem ser diferentes/);
});

test('nao repete o aviso de recorrencia mais de uma vez', async () => {
  const content = await source('FutureExplanation.jsx');
  const occurrences = content.match(/adicionados automaticamente aos meses futuros/g) ?? [];
  assert.equal(occurrences.length, 1);
});
