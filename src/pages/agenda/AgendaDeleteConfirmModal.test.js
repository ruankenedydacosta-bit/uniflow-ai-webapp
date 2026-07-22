import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('./', import.meta.url);
const source = (path) => readFile(new URL(path, ROOT), 'utf8');

test('titulo e "Excluir compromisso"', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.match(contents, /title="Excluir compromisso"/);
});

test('descricao usa o titulo do item entre aspas e informa que a exclusao e permanente', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.match(
    contents,
    /description=\{`Excluir "\$\{item\.title\}"\? Esta ação é permanente e não pode ser desfeita\.`\}/,
  );
});

test('botao principal: texto "Excluir definitivamente", variante danger', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.match(
    contents,
    /<Button variant="danger" loading=\{isMutating\} disabled=\{isMutating\} onClick=\{handleConfirm\}>\s*\n\s*Excluir definitivamente\s*\n\s*<\/Button>/,
  );
});

test('botao secundario: "Cancelar", variante ghost, chama handleClose', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.match(
    contents,
    /<Button variant="ghost" onClick=\{handleClose\} disabled=\{isMutating\}>\s*\n\s*Cancelar\s*\n\s*<\/Button>/,
  );
});

test('chama agenda.removeItem(item.id) -- nao usa agenda.deleteItem (nao existe no hook)', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.match(contents, /agenda\.removeItem\(item\.id\)/);
  assert.doesNotMatch(contents, /agenda\.deleteItem/);
});

test('nao envia payload nem objeto com id -- removeItem recebe somente item.id como argumento primitivo', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.doesNotMatch(contents, /removeItem\(\{/);
  assert.doesNotMatch(contents, /payload/);
});

test('AGENDA_ITEM_NOT_FOUND continua seguro (getAgendaItemErrorMessage ja cobre, sem logica nova de erro aqui)', async () => {
  const contents = await source('agendaFormUtils.js');
  assert.match(contents, /'AGENDA_ITEM_NOT_FOUND'/);
});

test('sucesso chama agenda.refresh() e depois onClose', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.match(
    contents,
    /if \(result && !result\.error\) \{\s*\n\s*await agenda\.refresh\(\);\s*\n\s*onClose\(\);\s*\n\s*return;\s*\n\s*\}/,
  );
});

test('erro mantem modal aberto e usa getAgendaItemErrorMessage com fallback especifico', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.match(
    contents,
    /setLocalError\(\s*\n\s*getAgendaItemErrorMessage\(result\?\.error, 'Não foi possível excluir o compromisso\. Tente novamente\.'\),\s*\n\s*\);/,
  );
  assert.doesNotMatch(contents, /setLocalError\([\s\S]{0,150}onClose\(\);/);
});

test('importa getAgendaItemErrorMessage de agendaFormUtils.js (funcao renomeada, reutilizada sem nova logica de erro)', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.match(contents, /import \{ getAgendaItemErrorMessage \} from '\.\/agendaFormUtils\.js';/);
});

test('loading e disabled no botao principal durante mutacao', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.match(contents, /variant="danger" loading=\{isMutating\} disabled=\{isMutating\}/);
});

test('bloqueia fechamento por overlay e Esc durante mutation', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.match(contents, /closeOnOverlayClick=\{!isMutating\}/);
  assert.match(contents, /closeOnEsc=\{!isMutating\}/);
});

test('handleClose nao fecha durante mutation', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.match(contents, /function handleClose\(\) \{\s*\n\s*if \(isMutating\) return;/);
});

test('handleConfirm ignora chamadas concorrentes enquanto isMutating (previne duplo submit)', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.match(contents, /async function handleConfirm\(\) \{\s*\n\s*if \(isMutating\) return;/);
});

test('nao cria icones, menu, botao/funcao de restauracao nem exclusao em massa', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.doesNotMatch(contents, /<svg/);
  assert.doesNotMatch(contents, /role="menu"/);
  assert.doesNotMatch(contents, /function handleRestore|onClick=\{handleRestore\}|Restaurar/);
  assert.doesNotMatch(contents, /items\.map|selectedItems/);
});
