import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('./', import.meta.url);
const source = (path) => readFile(new URL(path, ROOT), 'utf8');

// Tela 22g: folha sem cabeçalho. A pergunta leva o título do compromisso e
// é o nome acessível do diálogo; o texto diz que a exclusão é definitiva.
test('pergunta usa o titulo do item entre aspas e da nome ao dialogo', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.match(contents, /<h2 id=\{titleId\}>Excluir “\{item\.title\}”\?<\/h2>/);
  assert.match(contents, /aria-labelledby=\{titleId\}/);
  assert.match(contents, /hideCloseButton/);
});

test('texto informa que a exclusao e permanente', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.match(contents, /O compromisso sai da sua agenda\. Não é possível desfazer\./);
  assert.match(contents, /aria-describedby=\{descriptionId\}/);
});

// O padrão não tem cor de perigo: o botão é contornado neutro (secondary).
test('botao principal: texto "Excluir definitivamente", variante secondary', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.match(
    contents,
    /<OutlineButton variant="secondary" className=\{styles\.confirm\} loading=\{isMutating\} disabled=\{isMutating\} onClick=\{handleConfirm\}>\s*\n\s*Excluir definitivamente\s*\n\s*<\/OutlineButton>/,
  );
});

test('botao secundario: "Cancelar", variante ghost, chama handleClose', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.match(
    contents,
    /<OutlineButton variant="ghost" onClick=\{handleClose\} disabled=\{isMutating\}>\s*\n\s*Cancelar\s*\n\s*<\/OutlineButton>/,
  );
});

test('chama removeItem com a versão esperada para impedir delete stale', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.match(contents, /agenda\.removeItem\(item\.id, \{ expectedUpdatedAt: item\.updated_at \}\)/);
  assert.doesNotMatch(contents, /agenda\.deleteItem/);
});

test('não envia payload de dados; removeItem recebe apenas id e precondição de versão', async () => {
  const contents = await source('AgendaDeleteConfirmModal.jsx');
  assert.doesNotMatch(contents, /removeItem\(\{/);
  assert.doesNotMatch(contents, /payload/);
  assert.match(contents, /expectedUpdatedAt: item\.updated_at/);
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
  assert.match(contents, /loading=\{isMutating\} disabled=\{isMutating\} onClick=\{handleConfirm\}/);
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
