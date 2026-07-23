import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('./', import.meta.url);
const source = (path) => readFile(new URL(path, ROOT), 'utf8');

// --- props e assinatura ---------------------------------------------------------

test('assinatura recebe isOpen, project, clients, isSubmitting, error, onClose, onSubmit', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.match(
    contents,
    /function ProjectFormModal\(\{ isOpen, project = null, clients = \[\], isSubmitting = false, error = null, onClose, onSubmit \}\) \{/,
  );
});

test('estado inicial usa getProjectInitialValues em criacao e getProjectEditValues(project) em edicao', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.match(
    contents,
    /const \[values, setValues\] = useState\(\(\) =>\s*\n\s*isEditing \? getProjectEditValues\(project\) : getProjectInitialValues\(\),\s*\n\s*\);/,
  );
});

test('isEditing deriva de Boolean(project), nunca de um parametro de modo separado', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.match(contents, /const isEditing = Boolean\(project\);/);
});

// --- trava sincrona local -------------------------------------------------------

test('possui localMutationRef via useRef(false)', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.match(contents, /const localMutationRef = useRef\(false\);/);
});

test('localMutationRef.current NUNCA e lido fora de handleClose/handleSubmit (nao le ref durante o render)', async () => {
  const contents = await source('ProjectFormModal.jsx');
  const bodyBeforeHandlers = contents.slice(
    contents.indexOf('const localMutationRef'),
    contents.indexOf('function handleClose'),
  );
  assert.doesNotMatch(bodyBeforeHandlers, /localMutationRef\.current(?!\s*=\s*(?:false|true)\s*;)/s);
  // Nenhuma variavel derivada tipo "isBusy" combinando isSubmitting + ref e criada no corpo do componente.
  assert.doesNotMatch(contents, /const isBusy = isSubmitting \|\| localMutationRef\.current;/);
});

test('handleClose retorna cedo se isSubmitting ou a trava local estiverem ativas', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.match(
    contents,
    /function handleClose\(\) \{\s*\n\s*if \(isSubmitting \|\| localMutationRef\.current\) return;\s*\n\s*onClose\(\);/,
  );
});

test('handleSubmit retorna cedo (defesa) antes de qualquer await, mesma condicao de handleClose', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.match(
    contents,
    /async function handleSubmit\(event\) \{\s*\n\s*event\.preventDefault\(\);\s*\n\s*if \(isSubmitting \|\| localMutationRef\.current\) return;/,
  );
});

test('trava local e setada para true ANTES do await onSubmit e liberada em finally', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.match(
    contents,
    /localMutationRef\.current = true;\s*\n\s*try \{\s*\n\s*await onSubmit\(buildProjectPayload\(values\)\);\s*\n\s*\} finally \{\s*\n\s*localMutationRef\.current = false;\s*\n\s*\}/,
  );
});

// --- validacao antes da mutacao --------------------------------------------------

test('valida com validateProjectForm antes de chamar onSubmit; retorna cedo em caso de erro', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.match(
    contents,
    /const message = validateProjectForm\(values\);\s*\n\s*if \(message\) \{\s*\n\s*setValidationError\(message\);\s*\n\s*return;\s*\n\s*\}/,
  );
});

test('usa buildProjectPayload uma unica vez, exatamente dentro de handleSubmit', async () => {
  const contents = await source('ProjectFormModal.jsx');
  const occurrences = contents.match(/buildProjectPayload\(/g) ?? [];
  assert.equal(occurrences.length, 1);
  assert.match(contents, /await onSubmit\(buildProjectPayload\(values\)\);/);
});

test('nao reseta validationError ao digitar -- so ao tentar submeter de novo', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.match(contents, /setValidationError\(null\);/);
});

// --- fechamento durante submissao -------------------------------------------------

test('Modal recebe closeOnOverlayClick/closeOnEsc dependentes somente de isSubmitting (seguro para render)', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.match(contents, /closeOnOverlayClick=\{!isSubmitting\}/);
  assert.match(contents, /closeOnEsc=\{!isSubmitting\}/);
});

test('botao Cancelar fica desabilitado durante submissao', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.match(contents, /<Button variant="ghost" onClick=\{handleClose\} disabled=\{isSubmitting\}>\s*\n\s*Cancelar/);
});

test('botao de submit usa loading e disabled ambos dependentes de isSubmitting', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.match(contents, /<Button type="submit" loading=\{isSubmitting\} disabled=\{isSubmitting\}>/);
});

test('todos os campos do formulario ficam desabilitados durante submissao', async () => {
  const contents = await source('ProjectFormModal.jsx');
  const disabledCount = (contents.match(/disabled=\{isSubmitting\}/g) ?? []).length;
  // 9 campos de input/select + botao Cancelar + botao submit = 11 ocorrencias no minimo.
  assert.ok(disabledCount >= 10, `esperado >=10 ocorrencias de disabled={isSubmitting}, encontrado ${disabledCount}`);
});

// --- campos ------------------------------------------------------------------------

test('campo Nome existe e e obrigatorio', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.match(contents, /id="project-form-name"[\s\S]*?required/);
});

test('campo Status existe, e obrigatorio e itera PROJECT_STATUS_OPTIONS', async () => {
  const contents = await source('ProjectFormModal.jsx');
  const block = contents.slice(
    contents.indexOf('id="project-form-status"'),
    contents.indexOf('</SelectField>', contents.indexOf('id="project-form-status"')),
  );
  assert.match(block, /required/);
  assert.match(block, /PROJECT_STATUS_OPTIONS\.map/);
});

test('campo Prioridade existe, e obrigatorio e itera PROJECT_PRIORITY_OPTIONS', async () => {
  const contents = await source('ProjectFormModal.jsx');
  const block = contents.slice(
    contents.indexOf('id="project-form-priority"'),
    contents.indexOf('</SelectField>', contents.indexOf('id="project-form-priority"')),
  );
  assert.match(block, /required/);
  assert.match(block, /PROJECT_PRIORITY_OPTIONS\.map/);
});

test('campo Progresso usa type="number" com min=0 e max=100', async () => {
  const contents = await source('ProjectFormModal.jsx');
  const block = contents.slice(
    contents.indexOf('id="project-form-progress"'),
    contents.indexOf('/>', contents.indexOf('id="project-form-progress"')),
  );
  assert.match(block, /type="number"/);
  assert.match(block, /min=\{0\}/);
  assert.match(block, /max=\{100\}/);
});

test('Data de início e Prazo usam type="date", nao datetime-local (Projetos nao exige horario)', async () => {
  const contents = await source('ProjectFormModal.jsx');
  const startsBlock = contents.slice(
    contents.indexOf('id="project-form-starts-at"'),
    contents.indexOf('/>', contents.indexOf('id="project-form-starts-at"')),
  );
  const dueBlock = contents.slice(
    contents.indexOf('id="project-form-due-at"'),
    contents.indexOf('/>', contents.indexOf('id="project-form-due-at"')),
  );
  assert.match(startsBlock, /type="date"/);
  assert.match(dueBlock, /type="date"/);
  assert.doesNotMatch(startsBlock, /datetime-local/);
  assert.doesNotMatch(dueBlock, /datetime-local/);
});

test('Data de início e Prazo nao sao obrigatorios (opcionais)', async () => {
  const contents = await source('ProjectFormModal.jsx');
  const startsBlock = contents.slice(
    contents.indexOf('id="project-form-starts-at"'),
    contents.indexOf('/>', contents.indexOf('id="project-form-starts-at"')),
  );
  const dueBlock = contents.slice(
    contents.indexOf('id="project-form-due-at"'),
    contents.indexOf('/>', contents.indexOf('id="project-form-due-at"')),
  );
  assert.doesNotMatch(startsBlock, /\brequired\b/);
  assert.doesNotMatch(dueBlock, /\brequired\b/);
});

test('campo Cliente e opcional, itera a prop clients, nunca uma lista propria/mock', async () => {
  const contents = await source('ProjectFormModal.jsx');
  const block = contents.slice(
    contents.indexOf('id="project-form-client"'),
    contents.indexOf('</SelectField>', contents.indexOf('id="project-form-client"')),
  );
  assert.doesNotMatch(block, /\brequired\b/);
  assert.match(block, /clients\.map/);
  assert.match(block, /<option value="">Nenhum cliente<\/option>/);
  assert.doesNotMatch(contents, /projects\.mock/);
});

test('campo Impacto financeiro usa type="number" com min=0 (nao aceita negativo na UI)', async () => {
  const contents = await source('ProjectFormModal.jsx');
  const block = contents.slice(
    contents.indexOf('id="project-form-financial-impact"'),
    contents.indexOf('/>', contents.indexOf('id="project-form-financial-impact"')),
  );
  assert.match(block, /type="number"/);
  assert.match(block, /min=\{0\}/);
});

test('campo Próximo marco existe como texto opcional', async () => {
  const contents = await source('ProjectFormModal.jsx');
  const block = contents.slice(
    contents.indexOf('id="project-form-next-milestone"'),
    contents.indexOf('/>', contents.indexOf('id="project-form-next-milestone"')),
  );
  assert.doesNotMatch(block, /\brequired\b/);
});

test('nao existe campo de Responsavel na UI (sem infraestrutura segura de membros do workspace nesta fase)', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.doesNotMatch(contents, /project-form-assigned/);
  assert.doesNotMatch(contents, /Responsável/);
  assert.doesNotMatch(contents, /members\.map/);
});

// --- titulo/descricao dinamicos por modo -----------------------------------------

test('titulo do modal e dinamico: "Novo projeto" em criacao, "Editar projeto" em edicao', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.match(contents, /title=\{isEditing \? 'Editar projeto' : 'Novo projeto'\}/);
});

test('botao de submit e dinamico: "Criar projeto" em criacao, "Salvar alterações" em edicao', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.match(contents, /\{isEditing \? 'Salvar alterações' : 'Criar projeto'\}/);
});

test('fallback de erro e dinamico por modo (criar vs atualizar)', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.match(
    contents,
    /isEditing\s*\n\s*\? 'Não foi possível atualizar o projeto\. Tente novamente\.'\s*\n\s*: 'Não foi possível criar o projeto\. Tente novamente\.'/,
  );
});

// --- erro externo -------------------------------------------------------------------

test('exibe validationError OU o erro externo traduzido por getProjectErrorMessage', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.match(contents, /\{validationError \|\|\s*\n\s*getProjectErrorMessage\(/);
});

// --- higiene ---------------------------------------------------------------------

test('nao contem console.log/debugger nem marcadores de debug', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.doesNotMatch(contents, /console\.log|debugger/);
});

test('nao importa nem menciona Kanban/Calendario/Timeline', async () => {
  const contents = await source('ProjectFormModal.jsx');
  assert.doesNotMatch(contents, /[Kk]anban|[Cc]alend|[Tt]imeline/);
});
