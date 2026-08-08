import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('./', import.meta.url);
const source = (path) => readFile(new URL(path, ROOT), 'utf8');

test('estado inicial usa createEmptyAgendaItemForm em criacao e createAgendaItemEditForm(item) em edicao (inicializacao por funcao)', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(contents, /createEmptyAgendaItemForm/);
  assert.match(contents, /createAgendaItemEditForm/);
  assert.match(
    contents,
    /const \[form, setForm\] = useState\(\(\) =>\s*\n\s*isEditing \? createAgendaItemEditForm\(item\) : createEmptyAgendaItemForm\(\),\s*\n\s*\);/,
  );
});

test('nao existe efeito de sincronizacao do form com props (modal desmonta ao fechar, useState basta)', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.doesNotMatch(contents, /useEffect/);
});

test('usa validateAgendaItemForm antes da mutation (mesma funcao, sem parametro de modo)', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(contents, /validateAgendaItemForm\(form\)/);
  assert.doesNotMatch(contents, /validateAgendaItemForm\(form, \{/);
});

test('monta o payload uma unica vez com buildAgendaItemCreationPayload, reutilizado nos dois modos', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(contents, /const payload = buildAgendaItemCreationPayload\(form\);/);
  const occurrences = contents.match(/buildAgendaItemCreationPayload\(/g) ?? [];
  assert.equal(occurrences.length, 1);
});

test('criacao restaura operação persistida e envia seu UUID; edicao envia updated_at esperado', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(
    contents,
    /const creationOperation = isEditing[\s\S]*?getOrCreateAgendaOperation\(\{[\s\S]*?userId,[\s\S]*?workspaceId,[\s\S]*?origin: CREATE_OPERATION_ORIGIN,[\s\S]*?intent: payload,[\s\S]*?\}\);/,
  );
  assert.match(
    contents,
    /client_operation_id: creationOperation\.clientOperationId/,
  );
  assert.match(contents, /clearAgendaOperation\(\{[\s\S]*?clientOperationId: creationOperation\.clientOperationId/);
  assert.match(contents, /AGENDA_ITEM_IDEMPOTENCY_CONFLICT/);
});

test('cancelamento explícito do formulário limpa a operação restaurada da origem', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(
    contents,
    /function handleClose\(\) \{[\s\S]*?clearAgendaOperationsForOrigin\(\{[\s\S]*?userId,[\s\S]*?workspaceId,[\s\S]*?origin: CREATE_OPERATION_ORIGIN/,
  );
});

test('edicao nunca envia id dentro do payload (buildAgendaItemCreationPayload nao inclui id; item.id so e usado como argumento de updateItem)', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.doesNotMatch(contents, /payload\.id/);
  assert.doesNotMatch(contents, /id: item\.id/);
});

test('usa getAgendaItemErrorMessage para mensagens de mutacao', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(contents, /getAgendaItemErrorMessage\(/);
});

test('select de tipo tem placeholder desabilitado "Selecione o tipo" e itera ITEM_TYPE_OPTIONS', async () => {
  const contents = await source('AgendaFormModal.jsx');
  const typeSelectBlock = contents.slice(
    contents.indexOf('id="agenda-form-item-type"'),
    contents.indexOf('</SelectField>', contents.indexOf('id="agenda-form-item-type"')),
  );
  assert.match(typeSelectBlock, /<option value="" disabled>\s*\n\s*Selecione o tipo\s*\n\s*<\/option>/);
  assert.match(typeSelectBlock, /ITEM_TYPE_OPTIONS\.map/);
});

test('ITEM_TYPE_OPTIONS e derivado de AGENDA_ITEM_TYPES/AGENDA_ITEM_TYPE_LABELS (agendaFormUtils.js), nunca uma segunda copia hardcoded do mapa de rotulos', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(
    contents,
    /const ITEM_TYPE_OPTIONS = AGENDA_ITEM_TYPES\.map\(\(value\) => \(\{\s*\n\s*value,\s*\n\s*label: AGENDA_ITEM_TYPE_LABELS\[value\],\s*\n\s*\}\)\);/,
  );
  assert.doesNotMatch(contents, /\{ value: 'meeting', label: 'Reunião' \}/);
});

test('tipo e obrigatorio (SelectField required)', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(contents, /id="agenda-form-item-type"[\s\S]*?required/);
});

test('titulo e obrigatorio (Input required)', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(contents, /id="agenda-form-title"[\s\S]*?required/);
});

test('inicio (starts_at) e obrigatorio e usa type="datetime-local"', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(contents, /id="agenda-form-starts-at"[\s\S]*?type="datetime-local"[\s\S]*?required/);
});

test('termino (ends_at) nao e obrigatorio e usa type="datetime-local"', async () => {
  const contents = await source('AgendaFormModal.jsx');
  const endsAtBlock = contents.slice(
    contents.indexOf('id="agenda-form-ends-at"'),
    contents.indexOf('/>', contents.indexOf('id="agenda-form-ends-at"')),
  );
  assert.match(endsAtBlock, /type="datetime-local"/);
  assert.doesNotMatch(endsAtBlock, /\brequired\b/);
});

test('checkbox "Dia inteiro" existe, acessivel via label/htmlFor', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(
    contents,
    /<label className="uf-flex uf-items-center uf-gap-sm uf-text-caption" htmlFor="agenda-form-all-day">/,
  );
  assert.match(contents, /id="agenda-form-all-day"[\s\S]*?type="checkbox"/);
  assert.match(contents, /checked=\{form\.is_all_day\}/);
});

test('checkbox "Dia inteiro" chama handleAllDayChange, que desabilita e limpa ends_at', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(contents, /onChange=\{\(event\) => handleAllDayChange\(event\.target\.checked\)\}/);
  assert.match(
    contents,
    /function handleAllDayChange\(checked\) \{\s*\n\s*setForm\(\(current\) => \(\{\s*\n\s*\.\.\.current,\s*\n\s*is_all_day: checked,\s*\n\s*ends_at: checked \? '' : current\.ends_at,/,
  );
});

test('ends_at fica desabilitado quando is_all_day esta marcado', async () => {
  const contents = await source('AgendaFormModal.jsx');
  const endsAtBlock = contents.slice(
    contents.indexOf('id="agenda-form-ends-at"'),
    contents.indexOf('/>', contents.indexOf('id="agenda-form-ends-at"')),
  );
  assert.match(endsAtBlock, /disabled=\{isMutating \|\| form\.is_all_day\}/);
});

test('select de cliente usa clientsState.activeClients, nunca clientsState.clients, e nao e obrigatorio', async () => {
  const contents = await source('AgendaFormModal.jsx');
  const clientSelectBlock = contents.slice(
    contents.indexOf('id="agenda-form-client"'),
    contents.indexOf('</SelectField>', contents.indexOf('id="agenda-form-client"')),
  );
  assert.match(clientSelectBlock, /activeClients\.map/);
  assert.doesNotMatch(clientSelectBlock, /clientsState\.clients\.map/);
  assert.doesNotMatch(clientSelectBlock, /\brequired\b/);
  assert.match(clientSelectBlock, /<option value="">Nenhum cliente<\/option>/);
});

test('mensagem informativa (nao bloqueante) quando nao ha clientes ativos', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(
    contents,
    /Nenhum cliente ativo disponível para vincular\. Você ainda pode criar o compromisso\./,
  );
  assert.doesNotMatch(contents, /hasActiveClients[\s\S]{0,40}disabled=\{isSubmitDisabled\}/);
});

test('submit nao fica bloqueado pela ausencia de clientes ativos (client_id e opcional)', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(contents, /<Button type="submit" loading=\{isMutating\} disabled=\{isMutating\}>/);
});

test('sucesso chama agenda.refresh() e depois onClose', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(
    contents,
    /if \(result && !result\.error\) \{[\s\S]*?await agenda\.refresh\(\);\s*\n\s*onClose\(\);\s*\n\s*return;\s*\n\s*\}/,
  );
});

test('erro nao chama onClose e define mutationError local', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(contents, /setMutationError\(/);
  assert.doesNotMatch(
    contents,
    /setMutationError\([\s\S]{0,120}\n\s*\);\s*\n\s*onClose\(\);/,
  );
});

test('mensagem exibida no formulario combina validationError e mutationError', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(contents, /<FormMessage>\{validationError \|\| mutationError\}<\/FormMessage>/);
});

test('bloqueia fechamento (handleClose) durante mutation', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(contents, /function handleClose\(\) \{\s*\n\s*if \(isMutating\) return;/);
});

test('bloqueia ESC e overlay durante mutation', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(contents, /closeOnOverlayClick=\{!isMutating\}/);
  assert.match(contents, /closeOnEsc=\{!isMutating\}/);
});

test('botao Cancelar fica desabilitado durante mutation', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(contents, /<Button variant="ghost" onClick=\{handleClose\} disabled=\{isMutating\}>/);
});

test('botao de submit usa loading={isMutating}, disabled={isMutating} e texto "Criar compromisso"', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(contents, /loading=\{isMutating\}/);
  assert.match(contents, /Criar compromisso/);
});

test('titulo do modal e dinamico: "Novo compromisso" em criacao, "Editar compromisso" em edicao', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(
    contents,
    /title=\{isEditing \? 'Editar compromisso' : 'Novo compromisso'\}/,
  );
});

test('descricao do modal e adequada por modo, sem texto de "criar" durante a edicao', async () => {
  const contents = await source('AgendaFormModal.jsx');
  const descriptionBlock = contents.slice(
    contents.indexOf('description={'),
    contents.indexOf('size="md"'),
  );
  assert.match(descriptionBlock, /'Atualize os dados deste compromisso\.'/);
  assert.match(descriptionBlock, /'Cadastre um novo item na agenda deste espaço\.'/);
  const editingBranch = descriptionBlock.slice(
    descriptionBlock.indexOf('isEditing'),
    descriptionBlock.indexOf(':'),
  );
  assert.doesNotMatch(editingBranch, /[Cc]riar|[Cc]adastre/);
});

test('botao de submit e dinamico: "Criar compromisso" em criacao, "Salvar alterações" em edicao', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(
    contents,
    /\{isEditing \? 'Salvar alterações' : 'Criar compromisso'\}/,
  );
});

test('fallback de erro e dinamico por modo (criar vs. atualizar)', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(
    contents,
    /isEditing\s*\n\s*\? 'Não foi possível atualizar o compromisso\. Tente novamente\.'\s*\n\s*: 'Não foi possível criar o compromisso\. Tente novamente\.'/,
  );
});

test('nao existe nenhuma UI de status no formulario (status permanece fora de escopo nos dois modos)', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.doesNotMatch(contents, /id="agenda-form-status"/);
  assert.doesNotMatch(contents, />Status</);
  assert.doesNotMatch(contents, /setItemStatus/);
});

test('handleSubmit ignora chamadas concorrentes enquanto isMutating', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(
    contents,
    /async function handleSubmit\(event\) \{\s*\n\s*event\.preventDefault\(\);\s*\n\s*if \(isMutating\) return;/,
  );
});

test('nao importa nem usa ClientFormPrimitives/OpportunityFormPrimitives (isolamento de dominio)', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.doesNotMatch(contents, /ClientFormPrimitives/);
  assert.doesNotMatch(contents, /OpportunityFormPrimitives/);
  assert.match(contents, /from '\.\/AgendaFormPrimitives\.jsx'/);
});

test('payload de criacao nunca inclui status ou assigned_user_id (fora de escopo desta subfase)', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.doesNotMatch(contents, /\bstatus\s*:/);
  assert.doesNotMatch(contents, /assigned_user_id/);
});

test('nao implementa acoes de status nem exclusao (fora de escopo das Subfases 8.4/8.5)', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.doesNotMatch(contents, /setItemStatus|removeItem|deleteAgendaItem/);
});

test('mode default e "create"; isEditing deriva de mode === "edit"', async () => {
  const contents = await source('AgendaFormModal.jsx');
  assert.match(
    contents,
    /function AgendaFormModal\(\{[\s\S]*?mode = 'create',[\s\S]*?item = null,[\s\S]*?\}\) \{/,
  );
  assert.match(contents, /const isEditing = mode === 'edit';/);
});
