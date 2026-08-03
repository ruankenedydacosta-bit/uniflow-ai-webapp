import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { formatInspectorTime } from './hooks/useMockInspectorRuntime.js';
import {
  inspectorPipelineStages,
  inspectorRuntimeMock,
} from './mocks/inspectorRuntime.mock.js';

const pageSourceUrl = new URL('./UNIOSInspectorPage.jsx', import.meta.url);
const stylesSourceUrl = new URL('./UNIOSInspectorPage.module.css', import.meta.url);
const routesSourceUrl = new URL('../../../app/routes.jsx', import.meta.url);
const dataCardSourceUrl = new URL('./components/InspectorDataCard.jsx', import.meta.url);

test('mock representa o runtime completo sem permitir execucao', () => {
  assert.equal(inspectorRuntimeMock.shadowMode, true);
  assert.equal(inspectorRuntimeMock.executionAllowed, false);
  assert.equal(inspectorRuntimeMock.featureFlag, false);
  assert.equal(inspectorRuntimeMock.pipeline, 'completed');
});

test('mock e snapshots permanecem profundamente imutaveis', () => {
  assert.equal(Object.isFrozen(inspectorRuntimeMock), true);
  assert.equal(Object.isFrozen(inspectorRuntimeMock.context.workspace), true);
  assert.equal(Object.isFrozen(inspectorRuntimeMock.planning.steps), true);
  assert.equal(Object.isFrozen(inspectorRuntimeMock.communication), true);
});

test('timeline contem as dez etapas obrigatorias na ordem correta', () => {
  assert.deepEqual(
    inspectorPipelineStages.map((stage) => stage.id),
    ['parser', 'context', 'memory', 'planning', 'reflection', 'security', 'permissions', 'cognitive', 'response', 'communication'],
  );
  assert.equal(inspectorPipelineStages.every((stage) => stage.status === 'completed'), true);
});

test('pagina renderiza os dez cards e os paineis laterais', async () => {
  const source = await readFile(pageSourceUrl, 'utf8');
  const renderedCards = source.match(/<Inspector[A-Za-z]+Card data=/g) ?? [];

  assert.equal(renderedCards.length, 10);
  assert.match(source, /<InspectorPipeline stages=/);
  assert.match(source, /<InspectorRuntimePanel runtime=/);
});

test('cards oferecem expansao e copia do JSON sem alterar dados', async () => {
  const source = await readFile(dataCardSourceUrl, 'utf8');

  assert.match(source, /aria-expanded=\{isExpanded\}/);
  assert.match(source, /navigator\.clipboard\.writeText/);
  assert.match(source, /JSON\.stringify\(data, null, 2\)/);
  assert.doesNotMatch(source, /data\.[A-Za-z_$][\w$]*\s*=/);
});

test('painel de runtime expoe todas as metricas pedidas', async () => {
  const source = await readFile(
    new URL('./components/InspectorRuntimePanel.jsx', import.meta.url),
    'utf8',
  );

  for (const label of ['Version', 'Pipeline Status', 'Shadow Mode', 'Execution Allowed', 'Deep Freeze', 'Adapters Executed', 'Execution Time', 'Validation Result', 'Feature Flag']) {
    assert.match(source, new RegExp(label));
  }
});

test('pagina usa runtime real com refresh manual e fallback identificado', async () => {
  const page = await readFile(pageSourceUrl, 'utf8');
  const header = await readFile(
    new URL('./components/InspectorHeader.jsx', import.meta.url),
    'utf8',
  );

  assert.match(page, /useInspectorRuntime\(\)/);
  assert.doesNotMatch(page, /useMockInspectorRuntime\(\)/);
  assert.match(header, /Refresh Runtime/);
  assert.match(header, /Mock Runtime/);
});

test('layout possui contratos responsivos para notebook e tablet', async () => {
  const styles = await readFile(stylesSourceUrl, 'utf8');

  assert.match(styles, /@media \(max-width: 1240px\)/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /overflow-x: auto/);
});

test('rota direta existe somente no conjunto de rotas de desenvolvimento', async () => {
  const routes = await readFile(routesSourceUrl, 'utf8');

  assert.match(routes, /import\.meta\.env\.DEV/);
  assert.match(routes, /path: '\/dev\/uni-os'/);
  assert.doesNotMatch(routes, /navigationItems/);
});

test('horario do snapshot usa formato seguro e fallback para data invalida', () => {
  assert.match(formatInspectorTime(inspectorRuntimeMock.timestamp), /^\d{2}:\d{2}:\d{2}$/);
  assert.equal(formatInspectorTime('invalid-date'), '--:--:--');
});
