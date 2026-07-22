import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('./', import.meta.url);
const source = (path) => readFile(new URL(path, ROOT), 'utf8');

test('ClientDeleteConfirmModal nao usa window.confirm', async () => {
  const contents = await source('ClientDeleteConfirmModal.jsx');
  assert.doesNotMatch(contents, /window\.confirm/);
});

test('ClientDeleteConfirmModal menciona o nome do cliente e deixa a acao explicitamente permanente', async () => {
  const contents = await source('ClientDeleteConfirmModal.jsx');
  assert.match(contents, /client\.name/);
  assert.match(contents, /permanente/i);
});

test('ClientDeleteConfirmModal tem Cancelar e Excluir definitivamente, com variante destrutiva', async () => {
  const contents = await source('ClientDeleteConfirmModal.jsx');
  assert.match(contents, /Cancelar/);
  assert.match(contents, /Excluir definitivamente/);
  assert.match(contents, /variant="danger"/);
});

test('ClientDeleteConfirmModal bloqueia fechamento (X/ESC/overlay/botão) durante isMutating', async () => {
  const contents = await source('ClientDeleteConfirmModal.jsx');
  assert.match(contents, /if \(isMutating\) return;/);
  assert.match(contents, /closeOnOverlayClick=\{!isMutating\}/);
  assert.match(contents, /closeOnEsc=\{!isMutating\}/);
  assert.match(contents, /disabled=\{isMutating\}/);
});

test('ClientDeleteConfirmModal fecha somente quando removeClient confirma sucesso (result sem error)', async () => {
  const contents = await source('ClientDeleteConfirmModal.jsx');
  assert.match(contents, /clientState\.removeClient\(client\.id\)/);
  assert.match(contents, /if \(result && !result\.error\)/);
});

test('ClientDeleteConfirmModal trata resultado ausente/mal-formado como falha (nunca como sucesso)', async () => {
  const contents = await source('ClientDeleteConfirmModal.jsx');
  assert.match(contents, /result\?\.error/);
});

test('ClientDeleteConfirmModal usa Modal real do Design System, não confirmação inline', async () => {
  const contents = await source('ClientDeleteConfirmModal.jsx');
  assert.match(contents, /from '\.\.\/\.\.\/components\/ui\/Modal'/);
});
