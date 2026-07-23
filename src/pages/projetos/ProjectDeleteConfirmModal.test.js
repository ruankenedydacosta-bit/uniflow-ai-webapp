import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('./', import.meta.url);
const source = (path) => readFile(new URL(path, ROOT), 'utf8');

test('assinatura recebe isOpen, project, isDeleting, error, onClose, onConfirm', async () => {
  const contents = await source('ProjectDeleteConfirmModal.jsx');
  assert.match(
    contents,
    /function ProjectDeleteConfirmModal\(\{ isOpen, project, isDeleting = false, error = null, onClose, onConfirm \}\) \{/,
  );
});

test('possui localMutationRef via useRef(false)', async () => {
  const contents = await source('ProjectDeleteConfirmModal.jsx');
  assert.match(contents, /const localMutationRef = useRef\(false\);/);
});

test('localMutationRef.current NUNCA e lido fora dos handlers (nao le ref durante o render)', async () => {
  const contents = await source('ProjectDeleteConfirmModal.jsx');
  const bodyBeforeHandlers = contents.slice(
    contents.indexOf('const localMutationRef'),
    contents.indexOf('function handleClose'),
  );
  assert.doesNotMatch(bodyBeforeHandlers, /localMutationRef\.current(?!\s*=\s*(?:false|true)\s*;)/s);
  assert.doesNotMatch(contents, /const isBusy = isDeleting \|\| localMutationRef\.current;/);
});

test('handleClose retorna cedo se isDeleting ou a trava local estiverem ativas', async () => {
  const contents = await source('ProjectDeleteConfirmModal.jsx');
  assert.match(
    contents,
    /function handleClose\(\) \{\s*\n\s*if \(isDeleting \|\| localMutationRef\.current\) return;\s*\n\s*onClose\(\);/,
  );
});

test('handleConfirm retorna cedo (defesa) antes de qualquer await', async () => {
  const contents = await source('ProjectDeleteConfirmModal.jsx');
  assert.match(
    contents,
    /async function handleConfirm\(\) \{\s*\n\s*if \(isDeleting \|\| localMutationRef\.current\) return;/,
  );
});

test('trava local e setada para true ANTES do await onConfirm e liberada em finally', async () => {
  const contents = await source('ProjectDeleteConfirmModal.jsx');
  assert.match(
    contents,
    /localMutationRef\.current = true;\s*\n\s*try \{\s*\n\s*await onConfirm\(\);\s*\n\s*\} finally \{\s*\n\s*localMutationRef\.current = false;\s*\n\s*\}/,
  );
});

test('exibe o nome do projeto na descricao', async () => {
  const contents = await source('ProjectDeleteConfirmModal.jsx');
  assert.match(contents, /description=\{`Excluir "\$\{project\.name\}"\? Esta ação é permanente e não pode ser desfeita\.`\}/);
});

test('informa explicitamente que a exclusao e permanente e irreversivel', async () => {
  const contents = await source('ProjectDeleteConfirmModal.jsx');
  assert.match(contents, /permanente e não pode ser desfeita/);
});

test('Modal recebe closeOnOverlayClick/closeOnEsc dependentes de isDeleting', async () => {
  const contents = await source('ProjectDeleteConfirmModal.jsx');
  assert.match(contents, /closeOnOverlayClick=\{!isDeleting\}/);
  assert.match(contents, /closeOnEsc=\{!isDeleting\}/);
});

test('botao Cancelar fica desabilitado durante exclusao', async () => {
  const contents = await source('ProjectDeleteConfirmModal.jsx');
  assert.match(contents, /<Button variant="ghost" onClick=\{handleClose\} disabled=\{isDeleting\}>\s*\n\s*Cancelar/);
});

test('botao "Excluir definitivamente" usa loading e disabled ambos dependentes de isDeleting', async () => {
  const contents = await source('ProjectDeleteConfirmModal.jsx');
  assert.match(
    contents,
    /<Button variant="danger" loading=\{isDeleting\} disabled=\{isDeleting\} onClick=\{handleConfirm\}>/,
  );
});

test('exibe erro externo traduzido por getProjectErrorMessage quando presente', async () => {
  const contents = await source('ProjectDeleteConfirmModal.jsx');
  assert.match(contents, /getProjectErrorMessage\(error, 'Não foi possível excluir o projeto\. Tente novamente\.'\)/);
});

test('retorna null quando project esta ausente (guarda contra render sem dados)', async () => {
  const contents = await source('ProjectDeleteConfirmModal.jsx');
  assert.match(contents, /if \(!project\) return null;/);
});

test('nao contem console.log/debugger nem marcadores de debug', async () => {
  const contents = await source('ProjectDeleteConfirmModal.jsx');
  assert.doesNotMatch(contents, /console\.log|debugger/);
});
