import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = () => readFile(new URL('./agendaService.js', import.meta.url), 'utf8');

test('updateAgendaItem aplica updated_at esperado na mesma query do workspace e item', async () => {
  const content = await source();
  const body = content.slice(
    content.indexOf('export async function updateAgendaItem'),
    content.indexOf('export async function setAgendaItemStatus'),
  );

  assert.match(body, /\{ expectedUpdatedAt \} = \{\}/);
  assert.match(body, /\.eq\('workspace_id', workspaceId\)/);
  assert.match(body, /\.eq\('id', itemId\)/);
  assert.match(body, /query = query\.eq\('updated_at', expectedUpdatedAt\);/);
});

test('updateAgendaItem converte ausencia de linha com precondicao em conflito seguro', async () => {
  const content = await source();
  const body = content.slice(
    content.indexOf('export async function updateAgendaItem'),
    content.indexOf('export async function setAgendaItemStatus'),
  );

  assert.match(body, /if \(!error && !data && expectedUpdatedAt\)/);
  assert.match(body, /code: 'AGENDA_ITEM_CONFLICT'/);
  assert.doesNotMatch(body, /throw /);
});

test('setAgendaItemStatus exige e aplica updated_at na mesma operação', async () => {
  const content = await source();
  const body = content.slice(
    content.indexOf('export async function setAgendaItemStatus'),
    content.indexOf('export async function deleteAgendaItem'),
  );

  assert.match(body, /\{ expectedUpdatedAt \} = \{\}/);
  assert.match(body, /if \(!expectedUpdatedAt \|\| Number\.isNaN/);
  assert.match(body, /\.eq\('workspace_id', workspaceId\)/);
  assert.match(body, /\.eq\('id', itemId\)/);
  assert.match(body, /\.eq\('updated_at', expectedUpdatedAt\)/);
});

test('setAgendaItemStatus retorna conflito seguro quando a versão não existe mais', async () => {
  const content = await source();
  const body = content.slice(
    content.indexOf('export async function setAgendaItemStatus'),
    content.indexOf('export async function deleteAgendaItem'),
  );

  assert.match(body, /if \(!error && !data\)/);
  assert.match(body, /code: 'AGENDA_ITEM_CONFLICT'/);
  assert.doesNotMatch(body, /throw /);
});
