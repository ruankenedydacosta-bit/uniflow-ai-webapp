import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('FutureHomePreview aceita financialData injetado pelo Dashboard', async () => {
  const content = await source('FutureHomePreview.jsx');
  assert.match(content, /export default function FutureHomePreview\(\{ financialData = null \}\)/);
});

test('com financialData injetado, usa os dados recebidos e não chama useFutureData', async () => {
  const content = await source('FutureHomePreview.jsx');
  const injectedBlock = content.slice(
    content.indexOf('export default function FutureHomePreview'),
  );
  const ifBlock = injectedBlock.slice(0, injectedBlock.indexOf('return <ConnectedFutureHomePreview'));
  assert.match(ifBlock, /if \(financialData\) \{/);
  assert.match(ifBlock, /projections=\{financialData\.projections\}/);
  assert.match(ifBlock, /hasData=\{financialData\.hasData\}/);
  assert.doesNotMatch(ifBlock, /useFutureData/);
});

test('sem financialData, usa ConnectedFutureHomePreview com dados reais (useFutureData)', async () => {
  const content = await source('FutureHomePreview.jsx');
  assert.match(content, /function ConnectedFutureHomePreview\(\)/);
  assert.match(content, /const financialData = useFutureData\(\{/);
  assert.match(content, /return <ConnectedFutureHomePreview \/>;/);
});

test('FutureHomePreview não importa dados mockados', async () => {
  const content = await source('FutureHomePreview.jsx');
  assert.doesNotMatch(content, /mock/i);
});

test('estado vazio e de carregamento não fabricam valores financeiros', async () => {
  const content = await source('FutureHomePreview.jsx');
  assert.match(content, /if \(isLoading\) \{/);
  assert.match(content, /if \(!hasData\) \{/);
  assert.match(content, /Cadastre transações financeiras para ver projeções/);
});

test('CTA de projeção completa navega para /futuro, rota existente', async () => {
  const content = await source('FutureHomePreview.jsx');
  assert.match(content, /navigate\('\/futuro'\)/);
});
