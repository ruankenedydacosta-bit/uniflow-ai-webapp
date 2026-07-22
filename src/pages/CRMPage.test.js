import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('./', import.meta.url);
const source = (path) => readFile(new URL(path, ROOT), 'utf8');

test('CRMPage nao usa mais o mock (crm.mock.js/crmMock)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.doesNotMatch(contents, /crm\.mock\.js/);
  assert.doesNotMatch(contents, /crmMock/);
});

test('CRMPage usa uma unica instancia de useCrmPipeline, com includeClosedOpportunities:true (abertas+encerradas juntas)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /useCrmPipeline\(\{/);
  assert.match(contents, /includeArchivedStages:\s*false/);
  assert.match(contents, /includeClosedOpportunities:\s*true/);
  // Garante que so existe uma chamada ao hook nesta pagina.
  const hookCalls = contents.match(/useCrmPipeline\(/g) ?? [];
  assert.equal(hookCalls.length, 1);
});

test('CRMPage usa useClients para resolver o nome dos clientes', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /useClients\(/);
});

test('colunas do Kanban vem de pipeline.stages, nao de um array fixo', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /pipeline\.stages\.map/);
  assert.doesNotMatch(contents, /repeat\(5,/);
});

test('cards vem de pipeline.opportunities, agrupadas por stage_id', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /pipeline\.opportunities/);
  assert.match(contents, /opportunity\.stage_id/);
});

test('agrupamento usa opportunitiesByStageId com um Map inicializado a partir das etapas carregadas', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /const opportunitiesByStageId = useMemo\(/);
  assert.match(contents, /grouped\.set\(stage\.id, \[\]\)/);
});

test('cada coluna exibe um contador de oportunidades', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /stageOpportunities\.length/);
});

test('cada coluna exibe a soma de estimated_value formatada, tratando valores invalidos como zero', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /function sumEstimatedValue\(opportunities\) \{/);
  assert.match(contents, /Number\.isFinite\(value\) \? value : 0/);
  assert.match(contents, /formatCurrency\(sumEstimatedValue\(stageOpportunities\)\)/);
});

test('cliente ausente usa o fallback "Cliente indisponível", sem ocultar o card', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /Cliente indisponível/);
  assert.match(contents, /clientsById\.get\(opportunity\.client_id\)\?\.name \?\? 'Cliente indisponível'/);
});

test('loading combinado considera pipeline e clientes juntos', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /pipeline\.isLoading \|\| clientsState\.isLoading/);
  assert.match(contents, /Carregando pipeline\.\.\./);
});

test('erro do pipeline usa mensagem amigavel, sem expor error.message cru', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /Não foi possível carregar o pipeline\./);
  assert.doesNotMatch(contents, /pipeline\.error\.message/);
});

test('erro de clientes usa mensagem amigavel, sem expor error.message cru', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /Não foi possível carregar os clientes do pipeline\./);
  assert.doesNotMatch(contents, /clientsState\.error\.message/);
});

test('retry chama pipeline.refresh e clientsState.refresh via Promise.all', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /async function handleRetry\(\) \{\s*\n\s*await Promise\.all\(\[pipeline\.refresh\(\), clientsState\.refresh\(\)\]\);/,
  );
  assert.match(contents, /onClick=\{handleRetry\}/);
});

test('Supabase nao configurado exibe estado explicito, sem dados falsos', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /!pipeline\.isConfigured/);
  assert.match(contents, /O pipeline está indisponível porque a conexão de dados ainda não está configurada\./);
});

test('nenhuma etapa exibe mensagem dedicada, sem criar colunas falsas', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /pipeline\.stages\.length === 0/);
  assert.match(contents, /O pipeline ainda não possui etapas configuradas\./);
});

test('etapa sem oportunidades mostra estado vazio local, nao um empty state global', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /Nenhuma oportunidade/);
  assert.match(contents, /stageOpportunities\.length === 0/);
});

test('oportunidade orfa (aberta) nao cria coluna ficticia (comentario explica a omissao)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /orphanOpportunityCount/);
  assert.match(contents, /nunca viram uma coluna "Sem etapa"[\s\S]{0,20}ficticia/);
  assert.doesNotMatch(contents, /Sem etapa</);
});

test('botao "Nova oportunidade" fica visivel e usa canOpenCreate + handleOpenCreate', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /Nova oportunidade/);
  assert.match(contents, /disabled=\{!canOpenCreate\}/);
  assert.match(contents, /onClick=\{handleOpenCreate\}/);
});

test('movimentacao usa select controlado no card, sem drag and drop', async () => {
  const contents = await source('CRMPage.jsx');
  assert.doesNotMatch(contents, /draggable/);
  assert.doesNotMatch(contents, /onDragStart/);
  assert.doesNotMatch(contents, /onDrop/);
  assert.match(contents, /<select/);
  assert.match(contents, /value=\{opportunity\.stage_id\}/);
  assert.match(contents, /pipeline\.moveOpportunityStage\(opportunity\.id, nextStageId\)/);
});

test('CRMPage nao contem as areas removidas do mock (focusGrid/guidanceGrid)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.doesNotMatch(contents, /focusGrid/);
  assert.doesNotMatch(contents, /guidanceGrid/);
  assert.doesNotMatch(contents, /attention/i);
  assert.doesNotMatch(contents, /nextAction/);
  assert.doesNotMatch(contents, /followUps/);
  assert.doesNotMatch(contents, /uniReading/);
});

test('cards nao exibem campos do mock (priority/variant/status/lastInteraction/nextStep)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.doesNotMatch(contents, /opportunity\.priority/);
  assert.doesNotMatch(contents, /opportunity\.variant/);
  assert.doesNotMatch(contents, /opportunity\.status/);
  assert.doesNotMatch(contents, /opportunity\.lastInteraction/);
  assert.doesNotMatch(contents, /opportunity\.nextStep/);
});

test('clientsById usa clientsState.clients (nao activeClients), para resolver clientes arquivados', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /clientsState\.clients\.map\(\(client\) => \[client\.id, client\]\)/);
  assert.doesNotMatch(contents, /clientsState\.activeClients/);
});

test('botao "Perguntar à Uni", se presente, fica desabilitado e sem handler', async () => {
  const contents = await source('CRMPage.jsx');
  const button = contents.match(/<Button variant="secondary" disabled[^>]*>\s*Perguntar à Uni/);
  assert.ok(button, 'botão "Perguntar à Uni" deveria estar presente e desabilitado');
  assert.doesNotMatch(contents, /onClick=\{[^}]*\}\s*>\s*Perguntar à Uni/);
});

test('ordem de estados: workspace ausente e checado antes de qualquer query visual', async () => {
  const contents = await source('CRMPage.jsx');
  const workspaceCheckIndex = contents.indexOf('!workspaceId');
  const configuredCheckIndex = contents.indexOf('!pipeline.isConfigured');
  const loadingCheckIndex = contents.indexOf('isLoading) {');
  assert.ok(workspaceCheckIndex > -1 && configuredCheckIndex > -1 && loadingCheckIndex > -1);
  assert.ok(workspaceCheckIndex < configuredCheckIndex);
  assert.ok(configuredCheckIndex < loadingCheckIndex);
});

test('CRMPage consulta o papel do usuario via useWorkspaceRole', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /useWorkspaceRole\(/);
});

// --- Subfase 7.5.5: criacao de oportunidades -----------------------------------------

test('canOpenCreate exige workspace, isConfigured, canUpdate, papel carregado e sem mutation em andamento', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /const canOpenCreate =\s*\n\s*Boolean\(workspaceId\) &&\s*\n\s*pipeline\.isConfigured &&\s*\n\s*workspaceRole\.canUpdate === true &&\s*\n\s*!workspaceRole\.isLoading &&\s*\n\s*!pipeline\.isMutating;/,
  );
});

test('handleOpenCreate tem guarda defensiva independente do disabled do botao', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /function handleOpenCreate\(\) \{\s*\n\s*if \(!workspaceId\) return;\s*\n\s*if \(!pipeline\.isConfigured\) return;\s*\n\s*if \(workspaceRole\.isLoading\) return;\s*\n\s*if \(workspaceRole\.canUpdate !== true\) return;\s*\n\s*if \(pipeline\.isMutating\) return;/,
  );
  assert.match(contents, /setIsCreateOpen\(true\);/);
});

test('viewer (canUpdate=false), papel carregando, mutation, sem workspace e Supabase nao configurado desabilitam via canOpenCreate', async () => {
  const contents = await source('CRMPage.jsx');
  // canOpenCreate ja cobre todos os cinco casos numa unica expressao usada
  // pelo botao -- nao ha um caminho alternativo que habilite o botao sem
  // passar por todas as condicoes.
  assert.match(contents, /workspaceRole\.canUpdate === true/);
  assert.match(contents, /!workspaceRole\.isLoading/);
  assert.match(contents, /!pipeline\.isMutating/);
  assert.match(contents, /Boolean\(workspaceId\)/);
  assert.match(contents, /pipeline\.isConfigured &&/);
});

test('owner/admin/member habilitam o botao via workspaceRole.canUpdate === true, sem logica de papel duplicada', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /workspaceRole\.canUpdate === true/);
  assert.doesNotMatch(contents, /workspaceRole\.role === 'owner'/);
  assert.doesNotMatch(contents, /workspaceRole\.role === 'admin'/);
});

test('modal e renderizado condicionalmente por isCreateOpen, recebendo pipeline e clientsState', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /const \[isCreateOpen, setIsCreateOpen\] = useState\(false\);/);
  assert.match(contents, /\{isCreateOpen \? \(/);
  assert.match(contents, /<OpportunityFormModal/);
  assert.match(contents, /pipeline=\{pipeline\}/);
  assert.match(contents, /clientsState=\{clientsState\}/);
  assert.match(contents, /onClose=\{\(\) => setIsCreateOpen\(false\)\}/);
});

test('sucesso da criacao nao chama pipeline.refresh nem clientsState.refresh (Kanban atualiza via estado local do hook)', async () => {
  const contents = await source('CRMPage.jsx');
  // O unico refresh disparado pela pagina e o do handleRetry (erro de
  // carregamento) -- a criacao de oportunidade nao aciona reload nenhum
  // aqui, pois useCrmPipeline.createOpportunity ja atualiza o array local.
  const refreshCalls = contents.match(/\.refresh\(\)/g) ?? [];
  assert.equal(refreshCalls.length, 2); // pipeline.refresh() + clientsState.refresh(), ambos so dentro de handleRetry
});

test('CRMPage delega updateOpportunity/setOpportunityOutcome aos modais dedicados, nao chama diretamente', async () => {
  const contents = await source('CRMPage.jsx');
  // Edicao e encerramento sao feitos dentro de OpportunityFormModal/
  // OpportunityOutcomeConfirmModal (recebem `pipeline` inteiro como prop) --
  // CRMPage.jsx so aciona movimentacao de etapa diretamente.
  assert.doesNotMatch(contents, /updateOpportunity\(/);
  assert.doesNotMatch(contents, /setOpportunityOutcome\(/);
  assert.match(contents, /moveOpportunityStage\(/);
});

test('"Perguntar à Uni" continua desabilitado e sem handler', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /<Button variant="secondary" disabled title="Disponível em breve\.">/);
});

test('texto "em breve" foi removido do botao de criacao (funcionalidade ja implementada)', async () => {
  const contents = await source('CRMPage.jsx');
  const createButtonBlock = contents.slice(
    contents.indexOf('<Button disabled={!canOpenCreate}'),
    contents.indexOf('</Button>', contents.indexOf('<Button disabled={!canOpenCreate}')),
  );
  assert.doesNotMatch(createButtonBlock, /em breve/i);
});

// --- Subfase 7.5.6: movimentacao entre etapas --------------------------------------

test('select lista todas as etapas com id e nome e possui rotulo acessivel', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /pipeline\.stages\.map\(\(availableStage\) => \(/);
  assert.match(contents, /<option key=\{availableStage\.id\} value=\{availableStage\.id\}>/);
  assert.match(contents, /\{availableStage\.name\}/);
  assert.match(
    contents,
    /aria-label=\{`Mover oportunidade \$\{opportunity\.title\} para outra etapa`\}/,
  );
});

test('select permanece renderizado para viewer e disabled depende de canManageOpportunity', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /disabled=\{!canManageOpportunity\}/);
  assert.doesNotMatch(contents, /\{canManageOpportunity \? \(\s*<select/);
});

test('canManageOpportunity exige canUpdate, papel carregado e pipeline sem mutation (compartilhada por mover/editar/encerrar)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /const canManageOpportunity =\s*\n\s*workspaceRole\.canUpdate === true &&\s*\n\s*!workspaceRole\.isLoading &&\s*\n\s*!pipeline\.isMutating;/,
  );
});

test('handler possui todas as guardas defensivas antes da mutation', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /async function handleMoveOpportunity\(opportunity, nextStageId\)/);
  assert.match(contents, /if \(!workspaceId\) return;/);
  assert.match(contents, /if \(workspaceRole\.isLoading\) return;/);
  assert.match(contents, /if \(workspaceRole\.canUpdate !== true\) return;/);
  assert.match(contents, /if \(pipeline\.isMutating\) return;/);
  assert.match(contents, /if \(!opportunity\?\.id\) return;/);
  assert.match(contents, /if \(nextStageId === opportunity\.stage_id\) return;/);
});

test('handler valida etapa alvo e oportunidade ainda presentes no snapshot', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /pipeline\.stages\.some\(\(stage\) => stage\.id === nextStageId\)/);
  assert.match(contents, /if \(!stageExists\) return;/);
  assert.match(
    contents,
    /pipeline\.opportunities\.some\(\(item\) => item\.id === opportunity\.id\)/,
  );
  assert.match(contents, /if \(!opportunityExists\) return;/);
});

test('handler limpa erro e chama moveOpportunityStage com ids corretos', async () => {
  const contents = await source('CRMPage.jsx');
  const clearIndex = contents.indexOf('setMoveError(null);');
  const mutationIndex = contents.indexOf(
    'pipeline.moveOpportunityStage(opportunity.id, nextStageId)',
  );
  assert.ok(clearIndex > -1 && mutationIndex > clearIndex);
});

test('onChange encaminha oportunidade e valor selecionado diretamente ao handler', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /onChange=\{\(event\) =>\s*\n\s*handleMoveOpportunity\(opportunity, event\.target\.value\)/,
  );
});

test('erro de movimentacao e local, seguro e renderizado antes do Kanban sem substitui-lo', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /const \[moveError, setMoveError\] = useState\(null\);/);
  assert.match(contents, /getOpportunityMoveErrorMessage\(/);
  assert.match(contents, /<p className=\{styles\.moveError\} role="alert">/);
  assert.ok(contents.indexOf('{moveError ? (') < contents.indexOf('{content}'));
  assert.doesNotMatch(contents, /pipeline\.error\.message/);
});

test('movimentacao nao usa refresh, recarregamento ou estado otimista de etapa', async () => {
  const contents = await source('CRMPage.jsx');
  const handler = contents.slice(
    contents.indexOf('async function handleMoveOpportunity'),
    contents.indexOf('function handleOpenCreate'),
  );
  assert.doesNotMatch(handler, /refresh\(/);
  assert.doesNotMatch(handler, /window\.location|location\.reload/);
  assert.doesNotMatch(handler, /setOpportunities|stage_id\s*:/);
  assert.doesNotMatch(contents, /setSelectedStage|optimisticStage/);
});

test('erro ausente ou retornado pela mutation recebe mensagem segura', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /if \(!result \|\| result\.error\)/);
  assert.match(contents, /result\?\.error/);
  assert.match(contents, /Não foi possível mover a oportunidade\. Tente novamente\./);
});

test('criacao continua bloqueada por pipeline.isMutating durante movimentacao', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /const canOpenCreate =[\s\S]*?!pipeline\.isMutating;/);
  assert.match(contents, /disabled=\{!canOpenCreate\}/);
});

test('movimentacao nao cria modal dedicado e preserva o modal exclusivo de criacao', async () => {
  const contents = await source('CRMPage.jsx');
  assert.doesNotMatch(contents, /MoveOpportunityModal|isMoveOpen|moveModal/);
  assert.match(contents, /<OpportunityFormModal/);
});

// --- Subfase 7.5.7: edicao e encerramento de oportunidades --------------------------

test('1. acao "Editar" aparece no card, chamando handleOpenEdit', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, />\s*Editar\s*<\/Button>/);
  assert.match(contents, /onClick=\{\(\) => handleOpenEdit\(opportunity\)\}/);
});

test('2/3/4. "Editar" fica desabilitado para viewer, loading de papel e mutation via canManageOpportunity', async () => {
  const contents = await source('CRMPage.jsx');
  const editButtonBlock = contents.slice(
    contents.indexOf('onClick={() => handleOpenEdit(opportunity)}') - 120,
    contents.indexOf('onClick={() => handleOpenEdit(opportunity)}') + 60,
  );
  assert.match(editButtonBlock, /disabled=\{!canManageOpportunity\}/);
});

test('5. handleOpenEdit possui guardas defensivas (canManageOpportunity, id, outcome open)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /function handleOpenEdit\(opportunity\) \{\s*\n\s*if \(!canManageOpportunity\) return;\s*\n\s*if \(!opportunity\?\.id\) return;\s*\n\s*if \(opportunity\.outcome !== 'open'\) return;/,
  );
});

test('6. handleOpenEdit fecha outros modais e abre a edicao com a oportunidade selecionada', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /function handleOpenEdit\(opportunity\) \{[\s\S]*?setIsCreateOpen\(false\);\s*\n\s*setOutcomeOpportunity\(null\);\s*\n\s*setEditingOpportunity\(opportunity\);/,
  );
});

test('modal de edicao e renderizado condicionalmente por editingOpportunity, mode="edit", recebendo a oportunidade', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /\{editingOpportunity \? \(/);
  assert.match(contents, /mode="edit"/);
  assert.match(contents, /opportunity=\{editingOpportunity\}/);
  assert.match(contents, /onClose=\{\(\) => setEditingOpportunity\(null\)\}/);
});

test('16/18. acoes de encerramento existem no card ("Encerrar") e abrem modal de confirmacao dedicado', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, />\s*Encerrar\s*<\/Button>/);
  assert.match(contents, /onClick=\{\(\) => handleOpenOutcomeConfirm\(opportunity\)\}/);
  assert.match(contents, /<OpportunityOutcomeConfirmModal/);
});

test('17. "Encerrar" fica desabilitado para viewer/loading/mutation via canManageOpportunity', async () => {
  const contents = await source('CRMPage.jsx');
  const closeButtonBlock = contents.slice(
    contents.indexOf('onClick={() => handleOpenOutcomeConfirm(opportunity)}') - 120,
    contents.indexOf('onClick={() => handleOpenOutcomeConfirm(opportunity)}') + 60,
  );
  assert.match(closeButtonBlock, /disabled=\{!canManageOpportunity\}/);
});

test('19/20/22/23. handleOpenOutcomeConfirm valida permissao, id da oportunidade e outcome open', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /function handleOpenOutcomeConfirm\(opportunity\) \{\s*\n\s*if \(!canManageOpportunity\) return;\s*\n\s*if \(!opportunity\?\.id\) return;\s*\n\s*if \(opportunity\.outcome !== 'open'\) return;/,
  );
});

test('somente um modal por vez: abrir edicao ou encerramento fecha os demais', async () => {
  const contents = await source('CRMPage.jsx');
  const editFn = contents.slice(
    contents.indexOf('function handleOpenEdit'),
    contents.indexOf('function handleOpenOutcomeConfirm'),
  );
  const outcomeFn = contents.slice(
    contents.indexOf('function handleOpenOutcomeConfirm'),
    contents.indexOf('function getCreateButtonTitle'),
  );
  assert.match(editFn, /setIsCreateOpen\(false\);/);
  assert.match(editFn, /setOutcomeOpportunity\(null\);/);
  assert.match(outcomeFn, /setIsCreateOpen\(false\);/);
  assert.match(outcomeFn, /setEditingOpportunity\(null\);/);
});

test('modal de encerramento e renderizado condicionalmente por outcomeOpportunity, recebendo pipeline', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /\{outcomeOpportunity \? \(/);
  assert.match(contents, /<OpportunityOutcomeConfirmModal/);
  assert.match(contents, /onClose=\{\(\) => setOutcomeOpportunity\(null\)\}/);
});

test('29/30. edicao e encerramento so operam sobre oportunidades com outcome open (nao ha reabertura nem transicao entre encerrados)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.doesNotMatch(contents, /outcome === 'won'|outcome === 'lost'|outcome === 'cancelled'/);
  const guardOccurrences = contents.match(/if \(opportunity\.outcome !== 'open'\) return;/g) ?? [];
  assert.equal(guardOccurrences.length, 2); // handleOpenEdit + handleOpenOutcomeConfirm
});

test('31/32. abertura de edicao/encerramento nao chama refresh nem altera pipeline.opportunities manualmente', async () => {
  const contents = await source('CRMPage.jsx');
  const editFn = contents.slice(
    contents.indexOf('function handleOpenEdit'),
    contents.indexOf('function handleOpenOutcomeConfirm'),
  );
  const outcomeFn = contents.slice(
    contents.indexOf('function handleOpenOutcomeConfirm'),
    contents.indexOf('function getCreateButtonTitle'),
  );
  assert.doesNotMatch(editFn, /refresh\(\)/);
  assert.doesNotMatch(outcomeFn, /refresh\(\)/);
  assert.doesNotMatch(editFn, /setOpportunities/);
  assert.doesNotMatch(outcomeFn, /setOpportunities/);
});

test('35. todos os controles do card (mover, editar, encerrar) e o botao de criacao dependem de pipeline.isMutating', async () => {
  const contents = await source('CRMPage.jsx');
  // canOpenCreate e canManageOpportunity sao as duas unicas fontes de
  // "disabled" nesses controles, e ambas incluem !pipeline.isMutating.
  assert.match(contents, /const canOpenCreate =[\s\S]*?!pipeline\.isMutating;/);
  assert.match(contents, /const canManageOpportunity =[\s\S]*?!pipeline\.isMutating;/);
});

// --- Subfase 7.5.8: visualizacao e gestao de oportunidades encerradas ---------------

test('1/2. navegacao Pipeline aberto / Encerradas existe, com "open" selecionado inicialmente', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /const \[view, setView\] = useState\('open'\);/);
  assert.match(contents, /onClick=\{\(\) => setView\('open'\)\}/);
  assert.match(contents, /onClick=\{\(\) => setView\('closed'\)\}/);
  assert.match(contents, /Pipeline aberto/);
  assert.match(contents, />\s*Encerradas\s*<\/Button>/);
});

test('3/7. Kanban agrupa somente openOpportunities (outcome === open); abertas nao entram em closedOpportunities', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /const openOpportunities = useMemo\(\s*\n\s*\(\) => pipeline\.opportunities\.filter\(\(opportunity\) => opportunity\.outcome === 'open'\),/,
  );
  assert.match(
    contents,
    /const closedOpportunities = useMemo\(\s*\n\s*\(\) => pipeline\.opportunities\.filter\(\(opportunity\) => opportunity\.outcome !== 'open'\),/,
  );
  assert.match(
    contents,
    /for \(const opportunity of searchedOpenOpportunities\) \{/,
  );
  // searchedOpenOpportunities e sempre um subconjunto (filtrado por busca)
  // de openOpportunities -- nunca inclui encerradas.
  assert.match(
    contents,
    /const searchedOpenOpportunities = useMemo\(\s*\n\s*\(\) =>\s*\n\s*openOpportunities\.filter\(/,
  );
});

test('4/5/6. visao Encerradas cobre won/lost/cancelled via OUTCOME_LABELS/OUTCOME_BADGE_VARIANTS', async () => {
  const contents = await source('CRMPage.jsx');
  for (const outcome of ['won', 'lost', 'cancelled']) {
    assert.match(contents, new RegExp(`${outcome}: '`));
  }
  assert.match(contents, /Ganha/);
  assert.match(contents, /Perdida/);
  assert.match(contents, /Cancelada/);
});

test('8-11. filtro local por resultado (Todas/Ganhas/Perdidas/Canceladas)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /const OUTCOME_FILTERS = \[\s*\n\s*\{ value: 'all', label: 'Todas' \},\s*\n\s*\{ value: 'won', label: 'Ganhas' \},\s*\n\s*\{ value: 'lost', label: 'Perdidas' \},\s*\n\s*\{ value: 'cancelled', label: 'Canceladas' \},/,
  );
  assert.match(contents, /const \[outcomeFilter, setOutcomeFilter\] = useState\('all'\);/);
});

test('12/13. filtro e 100% local -- setOutcomeFilter nunca aparece perto de refresh ou reload', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /onClick=\{\(\) => setOutcomeFilter\(filter\.value\)\}/);
  const filterBlock = contents.slice(
    contents.indexOf('const filteredClosedOpportunities = useMemo'),
    contents.indexOf('const clientsById = useMemo'),
  );
  assert.doesNotMatch(filterBlock, /refresh\(/);
  assert.doesNotMatch(contents, /window\.location|location\.reload/);
});

test('14-20. cada registro encerrado mostra titulo, cliente (com fallback), valor, outcome traduzido e etapa (com fallback)', async () => {
  const contents = await source('CRMPage.jsx');
  const closedBlock = contents.slice(
    contents.indexOf("// view === 'closed'"),
    contents.indexOf('}\n\n  return (\n    <div className={styles.page}>'),
  );
  assert.match(closedBlock, /\{opportunity\.title\}/);
  assert.match(closedBlock, /clientsById\.get\(opportunity\.client_id\)\?\.name \?\? 'Cliente indisponível'/);
  assert.match(closedBlock, /stagesById\.get\(opportunity\.stage_id\)\?\.name \?\? 'Etapa indisponível'/);
  assert.match(closedBlock, /formatCurrency\(opportunity\.estimated_value\)/);
  assert.match(closedBlock, /getOutcomeLabel\(opportunity\.outcome\)/);
});

test('21/22. usa updated_at (rotulado "Atualizado em") via formatUpdatedAt, que valida a data antes de formatar', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /Atualizado em \{formatUpdatedAt\(opportunity\.updated_at\)\}/);
  assert.match(
    contents,
    /function formatUpdatedAt\(value\) \{\s*\n\s*if \(!value\) return '—';\s*\n\s*const date = new Date\(value\);\s*\n\s*if \(Number\.isNaN\(date\.getTime\(\)\)\) return '—';\s*\n\s*return formatDate\(value\);/,
  );
});

test('23/24. estado vazio geral e vazio por filtro tem mensagens distintas', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /Nenhuma oportunidade encerrada encontrada\./);
  assert.match(contents, /Nenhuma oportunidade encontrada para este resultado\./);
});

test('27. viewer consegue visualizar a aba Encerradas (view nao e restringida por canManageOpportunity)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.doesNotMatch(contents, /disabled=\{!canManageOpportunity\}[\s\S]{0,80}onClick=\{\(\) => setView/);
  assert.doesNotMatch(contents, /canManageOpportunity[\s\S]{0,40}setView\('closed'\)/);
});

test('28/29/30. registros encerrados nao possuem Editar, Encerrar nem select de movimentacao de etapa (o select de ordenacao da 7.5.10 e permitido)', async () => {
  const contents = await source('CRMPage.jsx');
  const closedBlock = contents.slice(
    contents.indexOf("// view === 'closed'"),
    contents.indexOf('}\n\n  return (\n    <div className={styles.page}>'),
  );
  assert.doesNotMatch(closedBlock, /handleOpenEdit/);
  assert.doesNotMatch(closedBlock, /handleOpenOutcomeConfirm/);
  // Nenhum select de MOVIMENTACAO de etapa (esse so existe no Kanban
  // aberto) -- o select de ORDENACAO (crm-closed-sort, 7.5.10) e permitido.
  assert.doesNotMatch(closedBlock, /handleMoveOpportunity/);
  assert.doesNotMatch(closedBlock, /className=\{styles\.stageSelect\}/);
  assert.doesNotMatch(closedBlock, /Mover oportunidade/);
  assert.match(closedBlock, /id="crm-closed-sort"/);
  assert.doesNotMatch(closedBlock, />\s*Editar\s*</);
  assert.doesNotMatch(closedBlock, />\s*Encerrar\s*</);
});

test('31. nao existe reabertura (nenhuma opcao para voltar a "open" a partir de uma oportunidade encerrada)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.doesNotMatch(contents, /setOpportunityOutcome\([^)]*'open'\)/);
  assert.doesNotMatch(contents, /Reabrir/i);
});

test('32/33/34/35. criacao, movimentacao e edicao continuam intactas na visao Pipeline aberto', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /onClick=\{handleOpenCreate\}/);
  assert.match(contents, /handleMoveOpportunity\(opportunity, event\.target\.value\)/);
  assert.match(contents, /onClick=\{\(\) => handleOpenEdit\(opportunity\)\}/);
  assert.match(contents, /onClick=\{\(\) => handleOpenOutcomeConfirm\(opportunity\)\}/);
});

test('36. "Perguntar à Uni" continua desabilitado e sem handler', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /<Button variant="secondary" disabled title="Disponível em breve\.">/);
});

test('37. nao existe drag and drop em nenhuma das duas visoes', async () => {
  const contents = await source('CRMPage.jsx');
  assert.doesNotMatch(contents, /draggable/);
  assert.doesNotMatch(contents, /onDragStart|onDrop/);
});

test('38/39. nao existe nova rota nem paginacao (busca e escopo aprovado da 7.5.10)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.doesNotMatch(contents, /react-router|useNavigate|<Route/);
  assert.doesNotMatch(contents, /page\s*[:=]\s*\d|pageSize|Paginação|Próxima página/i);
});

test('stagesById e construido a partir de pipeline.stages, mesmo padrao de clientsById', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /const stagesById = useMemo\(\s*\n\s*\(\) => new Map\(pipeline\.stages\.map\(\(stage\) => \[stage\.id, stage\]\)\),/,
  );
});

test('erro/loading permanecem compartilhados entre as duas visoes (mesma instancia unica do hook)', async () => {
  const contents = await source('CRMPage.jsx');
  // A navegacao Pipeline aberto/Encerradas fica sempre visivel (nao e
  // substituida pelo card de erro) -- so o {content} interno muda.
  const navIndex = contents.indexOf("onClick={() => setView('open')}");
  const errorCardIndex = contents.indexOf('hasError) {');
  assert.ok(navIndex > -1 && errorCardIndex > -1);
});

// --- Subfase 7.5.9: indicadores gerenciais do CRM ------------------------------------

test('21. os sete indicadores aparecem, com os rotulos exatos pedidos', async () => {
  const contents = await source('CRMPage.jsx');
  for (const label of [
    'Oportunidades abertas',
    'Valor em negociação',
    'Oportunidades ganhas',
    'Taxa de conversão',
    'Ticket médio ganho',
    'Valor ganho',
    'Valor perdido',
  ]) {
    assert.match(contents, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('22. a secao de indicadores aparece antes da navegacao Pipeline aberto/Encerradas', async () => {
  const contents = await source('CRMPage.jsx');
  const metricsIndex = contents.indexOf('metricsSection');
  const navIndex = contents.indexOf("onClick={() => setView('open')}");
  assert.ok(metricsIndex > -1 && navIndex > -1);
  assert.ok(metricsIndex < navIndex);
});

test('23/24. indicadores nao sao duplicados por aba -- uma unica secao, fora do bloco de conteudo por view', async () => {
  const contents = await source('CRMPage.jsx');
  const metricsSectionOccurrences = contents.match(/className=\{styles\.metricsSection\}/g) ?? [];
  assert.equal(metricsSectionOccurrences.length, 1);
  // A secao de metricas fica fora do "content" (que e o unico bloco que
  // muda conforme view === 'open'/'closed'), entao permanece visivel nas
  // duas abas automaticamente.
  const metricsIndex = contents.indexOf('metricsSection');
  const contentVarIndex = contents.indexOf('let content;');
  assert.ok(metricsIndex > contentVarIndex);
});

test('25. viewer consegue visualizar os indicadores (nao condicionado a canManageOpportunity/canUpdate)', async () => {
  const contents = await source('CRMPage.jsx');
  const metricsBlock = contents.slice(
    contents.indexOf('{canShowMetrics ? ('),
    contents.indexOf(') : null}\n\n      <section className={styles.pipelineSection}'),
  );
  assert.doesNotMatch(metricsBlock, /canManageOpportunity|canUpdate/);
});

test('26. valores monetarios dos indicadores usam formatCurrency (mesmo formatador do CRM)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /formatCurrency\(metrics\.openValue\)/);
  assert.match(contents, /formatCurrency\(metrics\.averageWonTicket\)/);
  assert.match(contents, /formatCurrency\(metrics\.wonValue\)/);
  assert.match(contents, /formatCurrency\(metrics\.lostValue\)/);
});

test('27/28/29. taxa de conversao usa formatConversionRate (% com no maximo uma casa decimal, pt-BR)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /formatConversionRate\(metrics\.conversionRate\)/);
  assert.match(
    contents,
    /import \{ calculateCrmMetrics, formatConversionRate \} from '\.\/crm\/crmMetrics\.js';/,
  );
});

test('30/31. indicadores nao renderizam durante loading nem erro (canShowMetrics exige !isLoading && !hasError)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /const canShowMetrics = Boolean\(workspaceId\) && pipeline\.isConfigured && !isLoading && !hasError;/,
  );
  assert.match(contents, /\{canShowMetrics \? \(/);
});

test('32/33/34/35/36. criacao, movimentacao, edicao, encerramento e filtros de encerradas continuam intactos', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /onClick=\{handleOpenCreate\}/);
  assert.match(contents, /handleMoveOpportunity\(opportunity, event\.target\.value\)/);
  assert.match(contents, /onClick=\{\(\) => handleOpenEdit\(opportunity\)\}/);
  assert.match(contents, /onClick=\{\(\) => handleOpenOutcomeConfirm\(opportunity\)\}/);
  assert.match(contents, /onClick=\{\(\) => setOutcomeFilter\(filter\.value\)\}/);
});

test('37/38/39. nenhum refresh/reload/nova query e usado para recalcular os indicadores', async () => {
  const contents = await source('CRMPage.jsx');
  const metricsMemoBlock = contents.slice(
    contents.indexOf('const metrics = useMemo('),
    contents.indexOf('const clientsById = useMemo'),
  );
  assert.doesNotMatch(metricsMemoBlock, /refresh\(/);
  assert.doesNotMatch(metricsMemoBlock, /window\.location|location\.reload/);
  assert.doesNotMatch(metricsMemoBlock, /listOpportunities|supabase/i);
  assert.match(
    contents,
    /const metrics = useMemo\(\s*\n\s*\(\) => calculateCrmMetrics\(pipeline\.opportunities\),\s*\n\s*\[pipeline\.opportunities\],\s*\n\s*\);/,
  );
});

test('40. nao existe grafico nos indicadores', async () => {
  const contents = await source('CRMPage.jsx');
  const metricsBlock = contents.slice(
    contents.indexOf('{canShowMetrics ? ('),
    contents.indexOf(') : null}\n\n      <section className={styles.pipelineSection}'),
  );
  assert.doesNotMatch(metricsBlock, /<svg|chart|Chart/i);
});

// --- Subfase 7.5.10: busca, ordenacao e contadores de oportunidades -------------------

test('23/24. input de busca de oportunidades existe, com label acessivel', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /id="crm-opportunity-search"/);
  assert.match(contents, /type="search"/);
  assert.match(contents, /label="Buscar oportunidades"/);
});

test('usa normalizeSearchText de src\\/utils\\/searchText.js, nao importa de Financeiro', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /import \{ normalizeSearchText \} from '\.\.\/utils\/searchText\.js';/);
  assert.doesNotMatch(contents, /financeiro/i);
});

test('25/26. matchesOpportunitySearch cobre titulo e nome do cliente associado', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /function matchesOpportunitySearch\(opportunity, normalizedQuery, clientsById\) \{\s*\n\s*if \(!normalizedQuery\) return true;\s*\n\s*const clientName = clientsById\.get\(opportunity\.client_id\)\?\.name;\s*\n\s*return \[opportunity\.title, clientName\]\.some\(/,
  );
});

test('27. busca funciona no Pipeline aberto (searchedOpenOpportunities alimenta o agrupamento por etapa)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /const searchedOpenOpportunities = useMemo\(\s*\n\s*\(\) =>\s*\n\s*openOpportunities\.filter\(\(opportunity\) =>\s*\n\s*matchesOpportunitySearch\(opportunity, normalizedOpportunitySearch, clientsById\),/,
  );
});

test('28. busca funciona em Encerradas (filteredClosedOpportunities aplica matchesOpportunitySearch)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /return byOutcome\.filter\(\(opportunity\) =>\s*\n\s*matchesOpportunitySearch\(opportunity, normalizedOpportunitySearch, clientsById\),/,
  );
});

test('29. Encerradas combina busca com o filtro de outcome (byOutcome primeiro, depois busca)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /const byOutcome =\s*\n\s*outcomeFilter === 'all'\s*\n\s*\? closedOpportunities\s*\n\s*: closedOpportunities\.filter\(\(opportunity\) => opportunity\.outcome === outcomeFilter\);/,
  );
});

test('30/31. busca nao chama refresh nem reload', async () => {
  const contents = await source('CRMPage.jsx');
  assert.doesNotMatch(contents, /setOpportunitySearch[\s\S]{0,40}refresh\(\)/);
  assert.doesNotMatch(contents, /window\.location|location\.reload/);
});

test('32. Kanban mantem todas as colunas mesmo com busca ativa (Map inicializado a partir de pipeline.stages, nao de searchedOpenOpportunities)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /for \(const stage of pipeline\.stages\) \{\s*\n\s*grouped\.set\(stage\.id, \[\]\);\s*\n\s*\}\s*\n\s*for \(const opportunity of searchedOpenOpportunities\)/,
  );
});

test('33. coluna sem resultado de busca continua visivel, com mensagem propria ("Nenhuma oportunidade para esta busca.")', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /Nenhuma oportunidade para esta busca\./);
});

test('34. estado de busca vazia em Encerradas usa mensagem propria, diferente da mensagem de filtro vazio', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /Nenhuma oportunidade encontrada para esta busca\./);
  assert.match(contents, /Nenhuma oportunidade encontrada para este resultado\./);
});

test('35/38/39. ordenacao de Encerradas: Mais recentes, Maior valor, Menor valor e Título A–Z', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /const CLOSED_SORT_OPTIONS = \[\s*\n\s*\{ value: 'recent', label: 'Mais recentes' \},\s*\n\s*\{ value: 'value-desc', label: 'Maior valor' \},\s*\n\s*\{ value: 'value-asc', label: 'Menor valor' \},\s*\n\s*\{ value: 'title', label: 'Título A–Z' \},/,
  );
  assert.match(contents, /toSafeTimestamp\(b\.updated_at\) - toSafeTimestamp\(a\.updated_at\)/);
});

test('39. ordenacao de Encerradas usa updated_at para "Mais recentes"', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /function sortClosedOpportunities\(opportunities, sortOrder\) \{\s*\n\s*const sorted = \[\.\.\.opportunities\];/,
  );
});

test('40. data invalida em updated_at nao quebra a ordenacao (toSafeTimestamp trata como zero)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /function toSafeTimestamp\(value\) \{\s*\n\s*if \(!value\) return 0;\s*\n\s*const time = new Date\(value\)\.getTime\(\);\s*\n\s*return Number\.isFinite\(time\) \? time : 0;/,
  );
});

test('41. sortClosedOpportunities nao muta o array original (usa [...opportunities])', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /const sorted = \[\.\.\.opportunities\];/);
});

test('42-47. contadores de oportunidades: total/filtradas em abertas e encerradas', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(
    contents,
    /const opportunityResultCount =\s*\n\s*view === 'open'\s*\n\s*\? normalizedOpportunitySearch\s*\n\s*\? `\$\{searchedOpenOpportunities\.length\} de \$\{openOpportunities\.length\} oportunidades abertas`\s*\n\s*: `\$\{openOpportunities\.length\} oportunidades abertas`\s*\n\s*: normalizedOpportunitySearch \|\| outcomeFilter !== 'all'\s*\n\s*\? `\$\{sortedClosedOpportunities\.length\} de \$\{closedOpportunities\.length\} oportunidades encerradas`\s*\n\s*: `\$\{closedOpportunities\.length\} oportunidades encerradas`;/,
  );
  assert.match(contents, /<span className=\{styles\.resultCount\}>\{opportunityResultCount\}<\/span>/);
});

test('busca/ordenacao/filtro de outcome nao resetam ao trocar de view (nenhum handler dedicado de troca de aba redefine esses estados)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.doesNotMatch(contents, /onClick=\{\(\) => setView\('open'\)\}[\s\S]{0,10}setOpportunitySearch/);
  assert.doesNotMatch(contents, /onClick=\{\(\) => setView\('closed'\)\}[\s\S]{0,10}setOpportunitySearch/);
});

test('busca/toolbar so aparecem quando ha dados reais carregados (canShowToolbar === canShowMetrics)', async () => {
  const contents = await source('CRMPage.jsx');
  assert.match(contents, /const canShowToolbar = canShowMetrics;/);
  assert.match(contents, /\{canShowToolbar \? \(/);
});
