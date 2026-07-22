import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('./', import.meta.url);
const source = (path) => readFile(new URL(path, ROOT), 'utf8');

test('usa createEmptyOpportunityForm e inicializa stage_id com a primeira etapa', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /createEmptyOpportunityForm/);
  assert.match(contents, /function createInitialForm\(stages\) \{\s*\n\s*return \{\s*\n\s*\.\.\.createEmptyOpportunityForm\(\),\s*\n\s*stage_id: stages\[0\]\?\.id \?\? '',/);
});

test('usa validateOpportunityForm com mode dependente de isEditing (create/edit)', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /validateOpportunityForm\(form, \{ mode: isEditing \? 'edit' : 'create' \}\)/);
});

test('usa buildOpportunityCreationPayload', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /buildOpportunityCreationPayload\(form\)/);
});

test('usa getOpportunityCreationErrorMessage para mensagens de mutacao', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /getOpportunityCreationErrorMessage\(/);
});

test('select de cliente (criacao) usa clientsState.activeClients, nunca clientsState.clients como fonte de opcoes', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /clientsState\.activeClients/);
  const clientSelectBlock = contents.slice(
    contents.indexOf('id="opportunity-form-client"'),
    contents.indexOf('</SelectField>', contents.indexOf('id="opportunity-form-client"')),
  );
  assert.match(clientSelectBlock, /activeClients\.map/);
  assert.doesNotMatch(clientSelectBlock, /clientsState\.clients\.map/);
});

test('usa pipeline.stages para as opcoes de etapa', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /pipeline\.stages/);
});

test('titulo e obrigatorio (Input required)', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /id="opportunity-form-title"[\s\S]*?required/);
});

test('cliente e obrigatorio (SelectField required)', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /id="opportunity-form-client"[\s\S]*?required/);
});

test('etapa e obrigatoria (SelectField required)', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /id="opportunity-form-stage"[\s\S]*?required/);
});

test('valor estimado usa type number, min 0 e step 0.01', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /id="opportunity-form-estimated-value"[\s\S]*?type="number"/);
  assert.match(contents, /min="0"/);
  assert.match(contents, /step="0\.01"/);
});

test('mensagem quando nao ha clientes ativos', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /Cadastre um cliente ativo antes de criar uma oportunidade\./);
});

test('mensagem quando nao ha etapas', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /Configure ao menos uma etapa antes de criar uma oportunidade\./);
});

test('submit (criacao) fica desabilitado sem clientes ativos e sem etapas', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(
    contents,
    /const isSubmitDisabled = isEditing \? isMutating : isMutating \|\| !hasActiveClients \|\| !hasStages;/,
  );
  assert.match(contents, /disabled=\{isSubmitDisabled\}/);
});

test('valida se o cliente selecionado ainda esta em activeClients antes da mutation', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(
    contents,
    /if \(form\.client_id && !activeClients\.some\(\(client\) => client\.id === form\.client_id\)\) \{/,
  );
  assert.match(contents, /O cliente selecionado não está mais ativo\. Escolha outro cliente\./);
});

test('valida se a etapa selecionada ainda existe em pipeline.stages antes da mutation', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(
    contents,
    /if \(form\.stage_id && !stages\.some\(\(stage\) => stage\.id === form\.stage_id\)\) \{/,
  );
  assert.match(contents, /A etapa selecionada não está mais disponível\. Escolha outra etapa\./);
});

test('chama pipeline.createOpportunity (create) ou pipeline.updateOpportunity (edit) conforme o modo', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(
    contents,
    /const result = isEditing\s*\n\s*\? await pipeline\.updateOpportunity\(opportunity\.id, buildOpportunityUpdatePayload\(form\)\)\s*\n\s*: await pipeline\.createOpportunity\(buildOpportunityCreationPayload\(form\)\);/,
  );
});

test('sucesso (result sem error) chama onClose', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(
    contents,
    /if \(result && !result\.error\) \{\s*\n\s*onClose\(\);\s*\n\s*return;\s*\n\s*\}/,
  );
});

test('erro nao chama onClose e define mutationError local', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /setMutationError\(/);
});

test('mensagem exibida no formulario combina validationError e mutationError, nunca pipeline.error', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /<FormMessage>\{validationError \|\| mutationError\}<\/FormMessage>/);
  assert.doesNotMatch(contents, /pipeline\.error/);
});

test('bloqueia fechamento (handleClose) durante mutation', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /function handleClose\(\) \{\s*\n\s*if \(isMutating\) return;/);
});

test('bloqueia ESC e overlay durante mutation', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /closeOnOverlayClick=\{!isMutating\}/);
  assert.match(contents, /closeOnEsc=\{!isMutating\}/);
});

test('botao Cancelar fica desabilitado durante mutation', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /<Button variant="ghost" onClick=\{handleClose\} disabled=\{isMutating\}>/);
});

test('botao de submit usa loading={isMutating} e texto "Criar oportunidade"', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /loading=\{isMutating\}/);
  assert.match(contents, /Criar oportunidade/);
});

test('nao importa nem usa ClientFormPrimitives (isolamento de dominio)', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.doesNotMatch(contents, /ClientFormPrimitives/);
  assert.match(contents, /from '\.\/OpportunityFormPrimitives\.jsx'/);
});

// --- Subfase 7.5.7: modo edit ---------------------------------------------------------

test('7. modo edit inicia o formulario preenchido via createOpportunityEditForm(opportunity)', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(
    contents,
    /const \[form, setForm\] = useState\(\(\) =>\s*\n\s*isEditing \? createOpportunityEditForm\(opportunity\) : createInitialForm\(stages\),\s*\n\s*\);/,
  );
});

test('8. usa validateOpportunityForm em modo edit quando isEditing', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(
    contents,
    /validateOpportunityForm\(form, \{ mode: isEditing \? 'edit' : 'create' \}\)/,
  );
});

test('9. usa buildOpportunityUpdatePayload (payload seguro, so title/estimated_value) na edicao', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /buildOpportunityUpdatePayload\(form\)/);
});

test('10. edicao chama pipeline.updateOpportunity(opportunity.id, ...)', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /pipeline\.updateOpportunity\(opportunity\.id, buildOpportunityUpdatePayload\(form\)\)/);
});

test('11/12/13. sucesso fecha modal; erro mantem modal aberto e mutationError local (mesmo fluxo de create/edit)', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(
    contents,
    /if \(result && !result\.error\) \{\s*\n\s*onClose\(\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*\n\s*setMutationError\(/,
  );
});

test('edicao usa getOpportunityErrorMessage (nao getOpportunityCreationErrorMessage) com fallback proprio', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(
    contents,
    /getOpportunityErrorMessage\(\s*\n\s*result\?\.error,\s*\n\s*'Não foi possível atualizar a oportunidade\. Tente novamente\.',/,
  );
});

test('14/15. edicao nao chama refresh nem recarrega a pagina', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.doesNotMatch(contents, /\.refresh\(\)/);
  assert.doesNotMatch(contents, /window\.location|location\.reload/);
});

test('cliente e etapa aparecem so como contexto somente leitura em modo edit, sem SelectField', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /clientDisplayName/);
  assert.match(contents, /stageDisplayName/);
  assert.match(
    contents,
    /isEditing \? \(\s*\n\s*<>\s*\n\s*<div className="uf-flex uf-flex-column uf-gap-sm uf-text-caption">\s*\n\s*<span className="uf-text-primary">Cliente<\/span>/,
  );
});

test('client_id permanece imutavel: comentario documenta a restricao de trigger de banco', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /client_id e imutavel por trigger de banco/);
});

test('submit em modo edit fica desabilitado somente por isMutating (nao exige clientes/etapas ativos)', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(
    contents,
    /const isSubmitDisabled = isEditing \? isMutating : isMutating \|\| !hasActiveClients \|\| !hasStages;/,
  );
});

test('titulo do modal e do botao de submit mudam conforme o modo', async () => {
  const contents = await source('OpportunityFormModal.jsx');
  assert.match(contents, /title=\{isEditing \? 'Editar oportunidade' : 'Nova oportunidade'\}/);
  assert.match(contents, /\{isEditing \? 'Salvar alterações' : 'Criar oportunidade'\}/);
});
