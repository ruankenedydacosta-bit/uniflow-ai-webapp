import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('./', import.meta.url);
const source = (path) => readFile(new URL(path, ROOT), 'utf8');

// --- Renderizacao -------------------------------------------------------------------

test('isEditing deriva de Boolean(client) -- modo criacao quando client e null, modo edicao quando client existe', async () => {
  const contents = await source('ClientFormModal.jsx');
  assert.match(contents, /function ClientFormModal\(\{ client = null, clientState, onClose, open \}\)/);
  assert.match(contents, /const isEditing = Boolean\(client\);/);
});

test('estado inicial usa createEmptyClientForm em criacao e createClientEditForm\\(client\\) em edicao (inicializacao por funcao)', async () => {
  const contents = await source('ClientFormModal.jsx');
  assert.match(
    contents,
    /const \[form, setForm\] = useState\(\(\) =>\s*\n\s*client \? createClientEditForm\(client\) : createEmptyClientForm\(\),\s*\n\s*\);/,
  );
});

test('titulo do modal e dinamico: "Novo cliente" em criacao, "Editar cliente" em edicao', async () => {
  const contents = await source('ClientFormModal.jsx');
  assert.match(contents, /title=\{isEditing \? 'Editar cliente' : 'Novo cliente'\}/);
});

test('campos principais existem: nome, tipo, estagio, condicao operacional, contato, e-mail, telefone, documento, valor, ultimo contato, proxima acao', async () => {
  const contents = await source('ClientFormModal.jsx');
  for (const id of [
    'client-form-name',
    'client-form-entity-type',
    'client-form-lifecycle-stage',
    'client-form-relationship-status',
    'client-form-primary-contact-name',
    'client-form-email',
    'client-form-phone',
    'client-form-document-number',
    'client-form-estimated-value',
    'client-form-last-contact-at',
    'client-form-next-action',
  ]) {
    assert.match(contents, new RegExp(`id="${id}"`));
  }
});

test('createEmptyClientForm (criacao) retorna todos os campos vazios/defaults seguros', async () => {
  const utils = await source('clientFormUtils.js');
  assert.match(utils, /export function createEmptyClientForm\(\) \{\s*\n\s*return \{\s*\n\s*name: '',/);
});

test('createClientEditForm (edicao) preenche os campos a partir do cliente real, incluindo conversao de last_contact_at', async () => {
  const utils = await source('clientFormUtils.js');
  assert.match(utils, /export function createClientEditForm\(client\) \{/);
  assert.match(utils, /last_contact_at: formatDatetimeLocalValue\(client\.last_contact_at\),/);
});

// --- Validacao ------------------------------------------------------------------------

test('nome e obrigatorio (Input required) e validado explicitamente antes do submit', async () => {
  const contents = await source('ClientFormModal.jsx');
  assert.match(contents, /id="client-form-name"[\s\S]*?required/);
  const utils = await source('clientFormUtils.js');
  assert.match(utils, /if \(!form\.name\?\.trim\(\)\) \{\s*\n\s*return 'Nome do cliente e obrigatorio\.';/);
});

test('tipo de entidade (person\\/company) e estagio de ciclo de vida sao validados contra os enums reais', async () => {
  const utils = await source('clientFormUtils.js');
  assert.match(utils, /ENTITY_TYPES = Object\.freeze\(\['person', 'company'\]\);/);
  assert.match(utils, /if \(!ENTITY_TYPES\.includes\(form\.entity_type\)\) \{/);
  assert.match(utils, /if \(!LIFECYCLE_STAGES\.includes\(form\.lifecycle_stage\)\) \{/);
});

test('valor estimado invalido (negativo ou nao-numerico) e rejeitado; vazio e valido (campo opcional)', async () => {
  const utils = await source('clientFormUtils.js');
  assert.match(
    utils,
    /if \(!Number\.isFinite\(numericValue\) \|\| numericValue < 0\) \{\s*\n\s*return 'Valor estimado deve ser um numero maior ou igual a zero\.';/,
  );
});

test('data do ultimo contato invalida e rejeitada -- mensagem de erro dedicada', async () => {
  const utils = await source('clientFormUtils.js');
  assert.match(
    utils,
    /if \(!isValidDatetimeLocalValue\(form\.last_contact_at\)\) \{\s*\n\s*return 'Data do ultimo contato invalida\.';/,
  );
});

test('validacao roda antes do submit e bloqueia o envio invalido -- setValidationError impede a chamada de saveClient', async () => {
  const contents = await source('ClientFormModal.jsx');
  assert.match(
    contents,
    /const validationMessage = validateClientForm\(form\);\s*\n\s*if \(validationMessage\) \{\s*\n\s*setValidationError\(validationMessage\);\s*\n\s*return;\s*\n\s*\}/,
  );
});

test('mensagem de erro combina validationError e o erro de mutacao (getClientErrorMessage), nunca clientState.error cru', async () => {
  const contents = await source('ClientFormModal.jsx');
  assert.match(
    contents,
    /<FormMessage>\s*\n\s*\{validationError \|\|\s*\n\s*getClientErrorMessage\(\s*\n\s*clientState\.error,/,
  );
});

// --- Payload --------------------------------------------------------------------------

test('buildClientMutationPayload monta lista fechada de campos, nunca produz workspace_id/created_by/assigned_user_id/id/is_archived', async () => {
  const utils = await source('clientFormUtils.js');
  assert.match(utils, /export function buildClientMutationPayload\(form\) \{/);
  assert.doesNotMatch(
    utils.slice(utils.indexOf('export function buildClientMutationPayload')),
    /workspace_id|created_by|assigned_user_id|is_archived/,
  );
});

test('campos de texto opcionais vazios viram null no payload (contato, e-mail, telefone, documento, proxima acao)', async () => {
  const utils = await source('clientFormUtils.js');
  const payloadFn = utils.slice(utils.indexOf('export function buildClientMutationPayload'));
  assert.match(payloadFn, /primary_contact_name: form\.primary_contact_name\?\.trim\(\)\s*\n\s*\? form\.primary_contact_name\.trim\(\)\s*\n\s*: null,/);
  assert.match(payloadFn, /email: form\.email\?\.trim\(\) \? form\.email\.trim\(\) : null,/);
  assert.match(payloadFn, /phone: form\.phone\?\.trim\(\) \? form\.phone\.trim\(\) : null,/);
});

test('nome e sempre trim() antes de entrar no payload', async () => {
  const utils = await source('clientFormUtils.js');
  const payloadFn = utils.slice(utils.indexOf('export function buildClientMutationPayload'));
  assert.match(payloadFn, /name: form\.name\.trim\(\),/);
});

test('valor estimado vazio vira 0; last_contact_at usa parseDatetimeLocalValue (local -> ISO)', async () => {
  const utils = await source('clientFormUtils.js');
  const payloadFn = utils.slice(utils.indexOf('export function buildClientMutationPayload'));
  assert.match(payloadFn, /estimated_value: form\.estimated_value === '' \? 0 : Number\(form\.estimated_value\),/);
  assert.match(payloadFn, /last_contact_at: parseDatetimeLocalValue\(form\.last_contact_at\),/);
});

test('criacao chama saveClient(payload, null); edicao chama saveClient(payload, client.id)', async () => {
  const contents = await source('ClientFormModal.jsx');
  assert.match(
    contents,
    /const result = await clientState\.saveClient\(payload, client\?\.id \?\? null\);/,
  );
});

// --- Interacoes -----------------------------------------------------------------------

test('updateField atualiza um unico campo do form sem recriar os demais', async () => {
  const contents = await source('ClientFormModal.jsx');
  assert.match(
    contents,
    /function updateField\(field, value\) \{\s*\n\s*setForm\(\(current\) => \(\{ \.\.\.current, \[field\]: value \}\)\);\s*\n\s*\}/,
  );
});

test('sucesso (result sem error) chama onClose; erro mantem o modal aberto', async () => {
  const contents = await source('ClientFormModal.jsx');
  assert.match(
    contents,
    /if \(!result\.error\) \{\s*\n\s*onClose\(\);\s*\n\s*\}/,
  );
});

test('cancelamento/fechamento: botao Cancelar e handleClose chamam onClose, exceto durante mutacao', async () => {
  const contents = await source('ClientFormModal.jsx');
  assert.match(contents, /function handleClose\(\) \{\s*\n\s*if \(isMutating\) return;\s*\n\s*onClose\(\);\s*\n\s*\}/);
  assert.match(contents, /<Button variant="ghost" onClick=\{handleClose\} disabled=\{isMutating\}>\s*\n\s*Cancelar/);
});

test('bloqueia fechamento por overlay e Esc durante mutacao (isMutating = clientState.isMutating)', async () => {
  const contents = await source('ClientFormModal.jsx');
  assert.match(contents, /const isMutating = clientState\.isMutating;/);
  assert.match(contents, /closeOnOverlayClick=\{!isMutating\}/);
  assert.match(contents, /closeOnEsc=\{!isMutating\}/);
});

test('submit unico: handleSubmit ignora chamadas concorrentes enquanto isMutating (previne duplo envio)', async () => {
  const contents = await source('ClientFormModal.jsx');
  assert.match(
    contents,
    /async function handleSubmit\(event\) \{\s*\n\s*event\.preventDefault\(\);\s*\n\s*if \(isMutating\) return;/,
  );
});

test('botao de submit usa loading={isMutating} -- reflete o isBusy propagado por ClientesPage (clientState.isMutating)', async () => {
  const contents = await source('ClientFormModal.jsx');
  assert.match(contents, /<Button type="submit" loading=\{isMutating\}>/);
});

// --- Acessibilidade basica --------------------------------------------------------------

test('todos os campos tem label associada via Input/SelectField (label prop + htmlFor/id internos)', async () => {
  const contents = await source('ClientFormModal.jsx');
  assert.match(contents, /id="client-form-name"\s*\n\s*label="Nome"/);
  assert.match(contents, /id="client-form-entity-type"\s*\n\s*label="Tipo"/);
});

test('botao de envio e identificavel pelo texto dinamico ("Criar cliente"/"Salvar cliente")', async () => {
  const contents = await source('ClientFormModal.jsx');
  assert.match(contents, /\{isEditing \? 'Salvar cliente' : 'Criar cliente'\}/);
});

test('botao de cancelamento e identificavel pelo texto "Cancelar"', async () => {
  const contents = await source('ClientFormModal.jsx');
  assert.match(contents, />\s*\n\s*Cancelar\s*\n\s*<\/Button>/);
});

test('campos ficam desabilitados durante mutacao onde aplicavel (Cancelar), sem depender so de required/min', async () => {
  const contents = await source('ClientFormModal.jsx');
  assert.match(contents, /disabled=\{isMutating\}/);
});

test('nao acessa Supabase diretamente -- toda mutacao passa por clientState.saveClient (contrato do hook)', async () => {
  const contents = await source('ClientFormModal.jsx');
  assert.doesNotMatch(contents, /supabase/i);
  assert.match(contents, /clientState\.saveClient/);
});
