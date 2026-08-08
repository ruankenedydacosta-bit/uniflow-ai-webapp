import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('./', import.meta.url);
const source = (path) => readFile(new URL(path, ROOT), 'utf8');

test('define isCompleting a partir de targetStatus === "completed"', async () => {
  const contents = await source('AgendaStatusConfirmModal.jsx');
  assert.match(contents, /const isCompleting = targetStatus === 'completed';/);
});

test('titulo: "Concluir compromisso" para completed, "Cancelar compromisso" para cancelled', async () => {
  const contents = await source('AgendaStatusConfirmModal.jsx');
  assert.match(
    contents,
    /title=\{isCompleting \? 'Concluir compromisso' : 'Cancelar compromisso'\}/,
  );
});

test('descricao dinamica com o titulo do item, mensagem de irreversibilidade em ambos os casos', async () => {
  const contents = await source('AgendaStatusConfirmModal.jsx');
  assert.match(
    contents,
    /`Marcar "\$\{item\.title\}" como concluído\? Esta ação não pode ser desfeita nesta versão\.`/,
  );
  assert.match(
    contents,
    /`Cancelar "\$\{item\.title\}"\? Esta ação não pode ser desfeita nesta versão\.`/,
  );
});

test('botao principal: texto dinamico "Concluir compromisso"/"Cancelar compromisso"', async () => {
  const contents = await source('AgendaStatusConfirmModal.jsx');
  assert.match(
    contents,
    /\{isCompleting \? 'Concluir compromisso' : 'Cancelar compromisso'\}/,
  );
});

test('variante secondary para completed, ghost para cancelled', async () => {
  const contents = await source('AgendaStatusConfirmModal.jsx');
  assert.match(contents, /variant=\{isCompleting \? 'secondary' : 'ghost'\}/);
});

test('rodapé tem um botao ghost de dismiss com texto "Cancelar" (distinto do botao principal)', async () => {
  const contents = await source('AgendaStatusConfirmModal.jsx');
  assert.match(
    contents,
    /<Button variant="ghost" onClick=\{handleClose\} disabled=\{isMutating\}>\s*\n\s*Cancelar\s*\n\s*<\/Button>/,
  );
});

test('chama setItemStatus com a versão exibida -- nunca chama com scheduled nem monta payload com id', async () => {
  const contents = await source('AgendaStatusConfirmModal.jsx');
  assert.match(
    contents,
    /agenda\.setItemStatus\(\s*\n\s*item\.id,\s*\n\s*targetStatus,\s*\n\s*\{ expectedUpdatedAt: item\.updated_at \},\s*\n\s*\)/,
  );
  assert.doesNotMatch(contents, /setItemStatus\([^)]*'scheduled'/);
  assert.doesNotMatch(contents, /\{\s*id:\s*item\.id/);
});

test('sucesso chama agenda.refresh() e depois onClose', async () => {
  const contents = await source('AgendaStatusConfirmModal.jsx');
  assert.match(
    contents,
    /if \(result && !result\.error\) \{[\s\S]*?await agenda\.refresh\(\);\s*\n\s*onClose\(\);\s*\n\s*return;\s*\n\s*\}/,
  );
});

test('erro mantem modal aberto e usa getAgendaItemErrorMessage com fallback especifico por status', async () => {
  const contents = await source('AgendaStatusConfirmModal.jsx');
  assert.match(contents, /setLocalError\(\s*\n\s*getAgendaItemErrorMessage\(/);
  assert.match(
    contents,
    /'Não foi possível concluir o compromisso\. Tente novamente\.'/,
  );
  assert.match(
    contents,
    /'Não foi possível cancelar o compromisso\. Tente novamente\.'/,
  );
  assert.doesNotMatch(contents, /setLocalError\([\s\S]{0,150}onClose\(\);/);
});

test('importa getAgendaItemErrorMessage de agendaFormUtils.js (funcao renomeada, sem alias legado)', async () => {
  const contents = await source('AgendaStatusConfirmModal.jsx');
  assert.match(contents, /import \{ getAgendaItemErrorMessage \} from '\.\/agendaFormUtils\.js';/);
  assert.doesNotMatch(contents, /getAgendaItemCreationErrorMessage/);
});

test('loading e disabled no botao principal durante mutacao', async () => {
  const contents = await source('AgendaStatusConfirmModal.jsx');
  const primaryButtonBlock = contents.slice(
    contents.indexOf('variant={isCompleting'),
    contents.indexOf('</Button>', contents.indexOf('variant={isCompleting')),
  );
  assert.match(primaryButtonBlock, /loading=\{isMutating\}/);
  assert.match(primaryButtonBlock, /disabled=\{isMutating\}/);
});

test('bloqueia fechamento por overlay e Esc durante mutation', async () => {
  const contents = await source('AgendaStatusConfirmModal.jsx');
  assert.match(contents, /closeOnOverlayClick=\{!isMutating\}/);
  assert.match(contents, /closeOnEsc=\{!isMutating\}/);
});

test('handleClose nao fecha durante mutation', async () => {
  const contents = await source('AgendaStatusConfirmModal.jsx');
  assert.match(contents, /function handleClose\(\) \{\s*\n\s*if \(isMutating\) return;/);
});

test('handleConfirm ignora chamadas concorrentes enquanto isMutating (previne duplo submit)', async () => {
  const contents = await source('AgendaStatusConfirmModal.jsx');
  assert.match(
    contents,
    /async function handleConfirm\(\) \{\s*\n\s*if \(isMutating\) return;/,
  );
});

test('nao cria icones nem menu', async () => {
  const contents = await source('AgendaStatusConfirmModal.jsx');
  assert.doesNotMatch(contents, /<svg/);
  assert.doesNotMatch(contents, /role="menu"/);
});
