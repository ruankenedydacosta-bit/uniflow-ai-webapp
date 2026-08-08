import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const ROOT = new URL('./', import.meta.url);
const source = (path) => readFile(new URL(path, ROOT), 'utf8');

test('AgendaPage nao usa mais o mock (agenda.mock.js/agendaMock), arquivo removido (codigo morto, Subfase 8.8)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.doesNotMatch(contents, /agenda\.mock\.js/);
  assert.doesNotMatch(contents, /agendaMock/);
  await assert.rejects(() => access(new URL('agenda/agenda.mock.js', ROOT)));
});

test('AgendaPage nao contem as areas removidas do mock (focusGrid/guidanceGrid/todayFocus/week/uniReading/nextAction)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.doesNotMatch(contents, /focusGrid/);
  assert.doesNotMatch(contents, /guidanceGrid/);
  assert.doesNotMatch(contents, /todayFocus/);
  assert.doesNotMatch(contents, /\bweek\b/);
  assert.doesNotMatch(contents, /uniReading/);
  assert.doesNotMatch(contents, /nextAction/);
});

test('usa useAgenda importado diretamente do hook (sem depender do barrel para nao alterar hooks/index.js)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /import \{ useAgenda \} from '\.\.\/hooks\/useAgenda\.js';/);
  assert.match(contents, /const agenda = useAgenda\(\{/);
});

test('usa useClients para resolver o nome dos clientes vinculados', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /import \{ useClients, useWorkspaceRole \} from '\.\.\/hooks';/);
  assert.match(contents, /const clientsState = useClients\(\{ workspaceId \}\);/);
});

test('valores iniciais dos filtros: periodo next7, status scheduled, tipo all', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /const DEFAULT_PERIOD_FILTER = 'next7';/);
  assert.match(contents, /const DEFAULT_STATUS_FILTER = 'scheduled';/);
  assert.match(contents, /const DEFAULT_ITEM_TYPE_FILTER = 'all';/);
  assert.match(
    contents,
    /const \[periodFilter, setPeriodFilter\] = useState\(DEFAULT_PERIOD_FILTER\);/,
  );
  assert.match(
    contents,
    /const \[statusFilter, setStatusFilter\] = useState\(DEFAULT_STATUS_FILTER\);/,
  );
  assert.match(
    contents,
    /const \[itemTypeFilter, setItemTypeFilter\] = useState\(DEFAULT_ITEM_TYPE_FILTER\);/,
  );
});

test('nao passa clientId para useAgenda nesta subfase (itemType agora e o filtro real)', async () => {
  const contents = await source('AgendaPage.jsx');
  const hookCallBlock = contents.slice(
    contents.indexOf('const agenda = useAgenda({'),
    contents.indexOf('});', contents.indexOf('const agenda = useAgenda({')),
  );
  assert.doesNotMatch(hookCallBlock, /clientId/);
  assert.match(hookCallBlock, /itemType: itemTypeFilter === 'all' \? undefined : itemTypeFilter,/);
});

test('status e undefined quando filtro e "all" (nunca filtra implicitamente)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /status: statusFilter === 'all' \? undefined : statusFilter,/);
});

test('periodo "all" nao envia startsFrom/startsTo (range vira null)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /const range = useMemo\(\s*\n\s*\(\) => \(periodFilter === 'all' \? null : computeRangeForPeriod\(periodFilter, todayReference\)\),/,
  );
  assert.match(contents, /startsFrom: range\?\.startsFrom,/);
  assert.match(contents, /startsTo: range\?\.startsTo,/);
});

test('intervalo de periodo calculado a partir de uma referencia congelada por montagem (useMemo com deps vazias)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /const todayReference = useMemo\(\(\) => new Date\(\), \[\]\);/,
  );
  assert.match(
    contents,
    /function computeRangeForPeriod\(period, referenceDate\) \{/,
  );
});

test('computeRangeForPeriod distingue "today" (fim em +1 dia) de "next7" (fim em +7 dias)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /end\.setDate\(end\.getDate\(\) \+ \(period === 'today' \? 1 : 7\)\);/,
  );
});

test('agrupamento por dia usa chave local (YYYY-MM-DD via getFullYear/getMonth/getDate, nunca UTC)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /function toLocalDateKey\(value\) \{\s*\n\s*const date = new Date\(value\);/,
  );
  assert.match(contents, /date\.getFullYear\(\)/);
  assert.match(contents, /date\.getMonth\(\) \+ 1/);
  assert.match(contents, /date\.getDate\(\)/);
  assert.doesNotMatch(contents, /getUTCFullYear|getUTCMonth|getUTCDate|toISOString\(\)\.slice/);
  assert.match(contents, /function groupAgendaItemsByDay\(items\)/);
});

test('rotulos Hoje/Amanha calculados localmente, demais dias usam formatDate', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /if \(dateKey === todayKey\) return 'Hoje';/);
  assert.match(contents, /if \(dateKey === tomorrowKey\) return 'Amanhã';/);
  assert.match(contents, /return formatDate\(new Date\(year, month - 1, day\)\);/);
});

test('rotulos de tipo (pt-BR) vem de AGENDA_ITEM_TYPE_LABELS (agendaFormUtils.js), fonte unica compartilhada com AgendaFormModal.jsx -- AgendaPage.jsx nao duplica o mapa localmente', async () => {
  const pageContents = await source('AgendaPage.jsx');
  assert.match(
    pageContents,
    /import \{ AGENDA_ITEM_TYPE_LABELS as ITEM_TYPE_LABELS \} from '\.\/agenda\/agendaFormUtils\.js';/,
  );
  assert.doesNotMatch(pageContents, /const ITEM_TYPE_LABELS = \{/);

  const utilsContents = await source('agenda/agendaFormUtils.js');
  const expectedPairs = {
    meeting: 'Reunião',
    appointment: 'Compromisso',
    task: 'Tarefa',
    payment_due: 'Vencimento',
    receivable: 'Recebimento',
    reminder: 'Lembrete',
    other: 'Outro',
  };
  for (const [type, label] of Object.entries(expectedPairs)) {
    assert.match(utilsContents, new RegExp(`${type}: '${label}'`));
  }
});

test('status em pt-BR cobrem scheduled/completed/cancelled', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /scheduled: 'Agendado'/);
  assert.match(contents, /completed: 'Concluído'/);
  assert.match(contents, /cancelled: 'Cancelado'/);
});

test('is_all_day exibe "Dia inteiro"', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /function formatAgendaItemTime\(item\) \{\s*\n\s*if \(item\.is_all_day\) return 'Dia inteiro';/,
  );
});

test('item sem ends_at exibe somente a hora inicial', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /if \(!item\.ends_at\) return startLabel;/);
});

test('cliente opcional: exibe nome quando encontrado, omite a linha quando ausente, sem mensagem de erro', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /const client = item\.client_id \? clientsById\.get\(item\.client_id\) : null;/,
  );
  assert.match(contents, /\{client \? <span>\{client\.name\}<\/span> : null\}/);
  assert.doesNotMatch(contents, /Cliente indisponível/);
});

test('loading combinado considera agenda e clientes juntos', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /agenda\.isLoading \|\| clientsState\.isLoading/);
  assert.match(contents, /Carregando agenda\.\.\./);
});

test('erro combinado usa mensagens amigaveis e retry chamando os dois refresh', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /Não foi possível carregar a agenda\./);
  assert.match(contents, /Não foi possível carregar os clientes vinculados\./);
  assert.match(
    contents,
    /async function handleRetry\(\) \{\s*\n\s*await Promise\.all\(\[agenda\.refresh\(\), clientsState\.refresh\(\)\]\);/,
  );
  assert.doesNotMatch(contents, /agenda\.error\.message/);
  assert.doesNotMatch(contents, /clientsState\.error\.message/);
});

test('empty state usa mensagem especifica dos proximos 7 dias, nao um texto generico', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /Nenhum compromisso agendado para os próximos 7 dias\./);
});

test('"Perguntar à Uni" permanece desabilitado e sem handler', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /<Button variant="secondary" disabled title="Disponível em breve\.">\s*\n\s*Perguntar à Uni/,
  );
});

// --- Subfase 8.4: criacao de compromisso --------------------------------------------

test('importa useWorkspaceRole (do barrel) e AgendaFormModal (direto, fora do barrel)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /import \{ useClients, useWorkspaceRole \} from '\.\.\/hooks';/);
  assert.match(contents, /import AgendaFormModal from '\.\/agenda\/AgendaFormModal\.jsx';/);
});

test('volta a obter user de useSession (necessario para useWorkspaceRole)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /const \{ user, workspace \} = useSession\(\);/);
});

test('useWorkspaceRole e chamado com workspaceId/ownerUserId/userId', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /const workspaceRole = useWorkspaceRole\(\{\s*\n\s*workspaceId,\s*\n\s*ownerUserId: workspace\?\.owner_user_id,\s*\n\s*userId: user\?\.id,\s*\n\s*\}\);/,
  );
});

test('botao "Novo compromisso" fica habilitado somente quando canOpenCreate e verdadeiro', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /const canOpenCreate =\s*\n\s*Boolean\(workspaceId\) &&\s*\n\s*agenda\.isConfigured &&\s*\n\s*workspaceRole\.canUpdate === true &&\s*\n\s*!workspaceRole\.isLoading &&\s*\n\s*!agenda\.isMutating;/,
  );
  assert.match(
    contents,
    /<Button disabled=\{!canOpenCreate\} title=\{getCreateButtonTitle\(\)\} onClick=\{handleOpenCreate\}>\s*\n\s*Novo compromisso/,
  );
});

test('getCreateButtonTitle explica o motivo do bloqueio (viewer, loading, sem workspace, sem config)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /Você não possui permissão para criar compromissos\./);
  assert.match(contents, /Selecione um espaço de trabalho\./);
  assert.match(contents, /Carregando permissões\.\.\./);
});

test('handleOpenCreate respeita canOpenCreate, limpa editingItem/statusChangeTarget/deletingItem, abre isCreateOpen (somente um modal por vez)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /function handleOpenCreate\(\) \{\s*\n\s*if \(!canOpenCreate\) return;[\s\S]*?setEditingItem\(null\);\s*\n\s*setStatusChangeTarget\(null\);\s*\n\s*setDeletingItem\(null\);\s*\n\s*setIsCreateOpen\(true\);\s*\n\s*\}/,
  );
});

test('AgendaFormModal (criacao) e renderizado condicionalmente por isCreateOpen, mode="create", recebendo agenda e clientsState', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /\{isCreateOpen \? \(\s*\n\s*<AgendaFormModal\s*\n\s*key=\{`create-agenda-item-\$\{workspaceId\}`\}\s*\n\s*open\s*\n\s*mode="create"\s*\n\s*agenda=\{agenda\}\s*\n\s*clientsState=\{clientsState\}\s*\n\s*userId=\{user\?\.id\}\s*\n\s*workspaceId=\{workspaceId\}\s*\n\s*onClose=\{handleCloseCreate\}\s*\n\s*\/>\s*\n\s*\) : null\}/,
  );
});

test('integracao com agenda.createItem/updateItem e delegada ao AgendaFormModal (AgendaPage nao chama nenhum dos dois diretamente)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.doesNotMatch(contents, /agenda\.createItem\(/);
  assert.doesNotMatch(contents, /agenda\.updateItem\(/);
});

test('nao implementa exclusao (fora de escopo desta subfase)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.doesNotMatch(contents, /removeItem\(/);
});

// --- Subfase 8.5: edicao de compromisso ---------------------------------------------

test('estado editingItem existe, inicia null', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /const \[editingItem, setEditingItem\] = useState\(null\);/);
});

test('canEditAgendaItem usa workspaceRole.canUpdate, isLoading e agenda.isMutating -- sem considerar o status do item', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /const canEditAgendaItem =\s*\n\s*workspaceRole\.canUpdate === true && !workspaceRole\.isLoading && !agenda\.isMutating;/,
  );
  assert.doesNotMatch(contents, /canEditAgendaItem[\s\S]{0,10}item\.status/);
});

test('handleOpenEdit respeita canEditAgendaItem, fecha criacao/status change/exclusao, define editingItem', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /function handleOpenEdit\(item\) \{\s*\n\s*if \(!canEditAgendaItem\) return;\s*\n\s*setIsCreateOpen\(false\);\s*\n\s*setStatusChangeTarget\(null\);\s*\n\s*setDeletingItem\(null\);\s*\n\s*setEditingItem\(item\);\s*\n\s*\}/,
  );
});

test('handleCloseEdit nao fecha durante mutation e limpa editingItem', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /function handleCloseEdit\(\) \{\s*\n\s*if \(agenda\.isMutating\) return;\s*\n\s*setEditingItem\(null\);\s*\n\s*\}/,
  );
});

test('botao "Editar" por card: texto simples, sem icone, com aria-label dinamico e gate por canEditAgendaItem', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /<Button\s*\n\s*variant="ghost"\s*\n\s*size="sm"\s*\n\s*disabled=\{!canEditAgendaItem\}\s*\n\s*aria-label=\{`Editar \$\{item\.title\}`\}\s*\n\s*onClick=\{\(\) => handleOpenEdit\(item\)\}\s*\n\s*>\s*\n\s*Editar\s*\n\s*<\/Button>/,
  );
});

test('nao existe menu de tres pontos, icone de edicao nem clique no card inteiro', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.doesNotMatch(contents, /role="menu"/);
  assert.doesNotMatch(contents, /<svg/);
  assert.doesNotMatch(contents, /onClick=\{\(\) => handleOpenEdit\(item\)\}[\s\S]{0,80}<Card/);
});

test('AgendaFormModal (edicao) e renderizado condicionalmente por editingItem, mode="edit", prop item e key baseada no id', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /\{editingItem \? \(\s*\n\s*<AgendaFormModal\s*\n\s*key=\{`edit-agenda-item-\$\{editingItem\.id\}`\}\s*\n\s*open\s*\n\s*mode="edit"\s*\n\s*item=\{editingItem\}\s*\n\s*agenda=\{agenda\}\s*\n\s*clientsState=\{clientsState\}\s*\n\s*userId=\{user\?\.id\}\s*\n\s*workspaceId=\{workspaceId\}\s*\n\s*onClose=\{handleCloseEdit\}\s*\n\s*\/>\s*\n\s*\) : null\}/,
  );
});

test('exclusividade entre criacao e edicao: abrir criacao limpa editingItem, abrir edicao fecha isCreateOpen', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /function handleOpenCreate\(\) \{[\s\S]*?setEditingItem\(null\);/);
  assert.match(contents, /function handleOpenEdit\(item\) \{[\s\S]*?setIsCreateOpen\(false\);/);
});

test('refresh apos update permanece responsabilidade do AgendaFormModal, nao de AgendaPage', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.doesNotMatch(contents, /agenda\.refresh\(\)[\s\S]{0,40}editingItem/);
});

test('itens concluidos/cancelados continuam com o botao Editar habilitado quando canEditAgendaItem e verdadeiro (Editar nunca checa item.status)', async () => {
  const contents = await source('AgendaPage.jsx');
  const editarButtonBlock = contents.slice(
    contents.indexOf('aria-label={`Editar'),
    contents.indexOf('</Button>', contents.indexOf('aria-label={`Editar')),
  );
  assert.doesNotMatch(editarButtonBlock, /item\.status/);
});

// --- Subfase 8.6: concluir e cancelar compromisso -----------------------------------

test('estado statusChangeTarget existe, inicia null', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /const \[statusChangeTarget, setStatusChangeTarget\] = useState\(null\);/);
});

test('canChangeAgendaStatus e uma constante separada de canEditAgendaItem, mesma matriz de papeis', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /const canChangeAgendaStatus =\s*\n\s*workspaceRole\.canUpdate === true && !workspaceRole\.isLoading && !agenda\.isMutating;/,
  );
  const occurrences = contents.match(/canChangeAgendaStatus =/g) ?? [];
  assert.equal(occurrences.length, 1);
  assert.doesNotMatch(contents, /canEditAgendaItem = canChangeAgendaStatus|canChangeAgendaStatus = canEditAgendaItem/);
});

test('scheduled mostra os botoes Concluir e Cancelar; completed/cancelled nao mostram nenhum', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /\{item\.status === 'scheduled' \? \(/);
  const statusActionsBlock = contents.slice(
    contents.indexOf("item.status === 'scheduled' ? ("),
    contents.indexOf(') : null}', contents.indexOf("item.status === 'scheduled' ? (")),
  );
  assert.match(statusActionsBlock, />\s*\n\s*Concluir\s*\n\s*<\/Button>/);
  assert.match(statusActionsBlock, />\s*\n\s*Cancelar\s*\n\s*<\/Button>/);
});

test('botao Concluir: variant secondary, aria-label dinamico, gate por canChangeAgendaStatus, chama handleRequestStatusChange(item, "completed")', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /<Button\s*\n\s*variant="secondary"\s*\n\s*size="sm"\s*\n\s*disabled=\{!canChangeAgendaStatus\}\s*\n\s*aria-label=\{`Concluir \$\{item\.title\}`\}\s*\n\s*onClick=\{\(\) => handleRequestStatusChange\(item, 'completed'\)\}\s*\n\s*>\s*\n\s*Concluir\s*\n\s*<\/Button>/,
  );
});

test('botao Cancelar: variant ghost, aria-label dinamico, gate por canChangeAgendaStatus, chama handleRequestStatusChange(item, "cancelled")', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /<Button\s*\n\s*variant="ghost"\s*\n\s*size="sm"\s*\n\s*disabled=\{!canChangeAgendaStatus\}\s*\n\s*aria-label=\{`Cancelar \$\{item\.title\}`\}\s*\n\s*onClick=\{\(\) => handleRequestStatusChange\(item, 'cancelled'\)\}\s*\n\s*>\s*\n\s*Cancelar\s*\n\s*<\/Button>/,
  );
});

test('handleRequestStatusChange respeita canChangeAgendaStatus, aceita somente completed/cancelled, fecha criacao/edicao/exclusao, define statusChangeTarget', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /function handleRequestStatusChange\(item, targetStatus\) \{\s*\n\s*if \(!canChangeAgendaStatus\) return;\s*\n\s*if \(targetStatus !== 'completed' && targetStatus !== 'cancelled'\) return;\s*\n\s*setIsCreateOpen\(false\);\s*\n\s*setEditingItem\(null\);\s*\n\s*setDeletingItem\(null\);\s*\n\s*setStatusChangeTarget\(\{ item, targetStatus \}\);\s*\n\s*\}/,
  );
});

test('handleCloseStatusChange nao fecha durante mutation e limpa statusChangeTarget', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /function handleCloseStatusChange\(\) \{\s*\n\s*if \(agenda\.isMutating\) return;\s*\n\s*setStatusChangeTarget\(null\);\s*\n\s*\}/,
  );
});

test('exclusividade: abrir criacao/edicao tambem limpa statusChangeTarget; abrir status fecha criacao e edicao', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /function handleOpenCreate\(\) \{[\s\S]*?setStatusChangeTarget\(null\);/);
  assert.match(contents, /function handleOpenEdit\(item\) \{[\s\S]*?setStatusChangeTarget\(null\);/);
  assert.match(contents, /function handleRequestStatusChange\(item, targetStatus\) \{[\s\S]*?setIsCreateOpen\(false\);[\s\S]*?setEditingItem\(null\);/);
});

test('AgendaStatusConfirmModal e renderizado condicionalmente por statusChangeTarget, key baseada em id + targetStatus, item e targetStatus passados corretamente', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /\{statusChangeTarget \? \(\s*\n\s*<AgendaStatusConfirmModal\s*\n\s*key=\{`agenda-status-\$\{statusChangeTarget\.item\.id\}-\$\{statusChangeTarget\.targetStatus\}`\}\s*\n\s*item=\{statusChangeTarget\.item\}\s*\n\s*targetStatus=\{statusChangeTarget\.targetStatus\}\s*\n\s*agenda=\{agenda\}\s*\n\s*onClose=\{handleCloseStatusChange\}\s*\n\s*\/>\s*\n\s*\) : null\}/,
  );
});

test('integracao com agenda.setItemStatus e delegada ao AgendaStatusConfirmModal (AgendaPage nao chama diretamente)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.doesNotMatch(contents, /agenda\.setItemStatus\(/);
});

test('importa AgendaStatusConfirmModal diretamente (fora do barrel)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /import AgendaStatusConfirmModal from '\.\/agenda\/AgendaStatusConfirmModal\.jsx';/);
});

test('nao implementa reabertura para scheduled, edicao de status no formulario, toast, menu ou icones; exclusao e delegada ao modal, nao chamada diretamente', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.doesNotMatch(contents, /agenda\.removeItem\(|deleteAgendaItem/);
  assert.doesNotMatch(contents, /role="menu"/);
  assert.doesNotMatch(contents, /<svg/);
  assert.doesNotMatch(contents, /handleRequestStatusChange\([^)]*'scheduled'/);
});

// --- Subfase 8.7: excluir compromisso -------------------------------------------------

test('estado deletingItem existe, inicia null', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /const \[deletingItem, setDeletingItem\] = useState\(null\);/);
});

test('canDeleteAgendaItem usa workspaceRole.canDelete (nao canUpdate), isLoading e agenda.isMutating', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /const canDeleteAgendaItem =\s*\n\s*workspaceRole\.canDelete === true && !workspaceRole\.isLoading && !agenda\.isMutating;/,
  );
  assert.doesNotMatch(contents, /const canDeleteAgendaItem[\s\S]{0,10}canUpdate/);
});

test('botao Excluir aparece nos 3 status (scheduled, completed e cancelled), fora do bloco condicional de scheduled', async () => {
  const contents = await source('AgendaPage.jsx');
  const excluirButtonBlock = contents.slice(
    contents.indexOf('aria-label={`Excluir'),
    contents.indexOf('</Button>', contents.indexOf('aria-label={`Excluir')),
  );
  assert.doesNotMatch(excluirButtonBlock, /item\.status/);
  // O botao Excluir vem depois do bloco condicional {item.status === 'scheduled' ? (...) : null},
  // ou seja, fora dele -- renderizado sempre, independente do status.
  const scheduledBlockEnd = contents.indexOf(') : null}', contents.indexOf("item.status === 'scheduled' ? ("));
  const excluirIndex = contents.indexOf('aria-label={`Excluir');
  assert.ok(excluirIndex > scheduledBlockEnd);
});

test('botao Excluir: texto "Excluir", variant danger, aria-label dinamico, gate por canDeleteAgendaItem, ultimo na linha de acoes (depois de Editar)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /<Button\s*\n\s*variant="danger"\s*\n\s*size="sm"\s*\n\s*disabled=\{!canDeleteAgendaItem\}\s*\n\s*aria-label=\{`Excluir \$\{item\.title\}`\}\s*\n\s*onClick=\{\(\) => handleRequestDelete\(item\)\}\s*\n\s*>\s*\n\s*Excluir\s*\n\s*<\/Button>\s*\n\s*<\/div>/,
  );
  const editarIndex = contents.indexOf('aria-label={`Editar');
  const excluirIndex = contents.indexOf('aria-label={`Excluir');
  assert.ok(excluirIndex > editarIndex);
});

test('handleRequestDelete respeita canDeleteAgendaItem, fecha criacao/edicao/status, define deletingItem', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /function handleRequestDelete\(item\) \{\s*\n\s*if \(!canDeleteAgendaItem\) return;\s*\n\s*setIsCreateOpen\(false\);\s*\n\s*setEditingItem\(null\);\s*\n\s*setStatusChangeTarget\(null\);\s*\n\s*setDeletingItem\(item\);\s*\n\s*\}/,
  );
});

test('handleCloseDelete nao fecha durante mutation e limpa deletingItem', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /function handleCloseDelete\(\) \{\s*\n\s*if \(agenda\.isMutating\) return;\s*\n\s*setDeletingItem\(null\);\s*\n\s*\}/,
  );
});

test('exclusividade: abrir criacao, edicao ou status tambem limpa deletingItem; abrir exclusao fecha os outros tres', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /function handleOpenCreate\(\) \{[\s\S]*?setDeletingItem\(null\);/);
  assert.match(contents, /function handleOpenEdit\(item\) \{[\s\S]*?setDeletingItem\(null\);/);
  assert.match(contents, /function handleRequestStatusChange\(item, targetStatus\) \{[\s\S]*?setDeletingItem\(null\);/);
  assert.match(
    contents,
    /function handleRequestDelete\(item\) \{[\s\S]*?setIsCreateOpen\(false\);[\s\S]*?setEditingItem\(null\);[\s\S]*?setStatusChangeTarget\(null\);/,
  );
});

test('AgendaDeleteConfirmModal e renderizado condicionalmente por deletingItem, key baseada no id, item passado corretamente', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /\{deletingItem \? \(\s*\n\s*<AgendaDeleteConfirmModal\s*\n\s*key=\{`delete-agenda-item-\$\{deletingItem\.id\}`\}\s*\n\s*item=\{deletingItem\}\s*\n\s*agenda=\{agenda\}\s*\n\s*onClose=\{handleCloseDelete\}\s*\n\s*\/>\s*\n\s*\) : null\}/,
  );
});

test('importa AgendaDeleteConfirmModal diretamente (fora do barrel)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /import AgendaDeleteConfirmModal from '\.\/agenda\/AgendaDeleteConfirmModal\.jsx';/);
});

test('nao implementa lixeira, restauracao nem exclusao em massa', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.doesNotMatch(contents, /handleRestore|Restaurar|selectedItems|bulkDelete/);
});

// --- Subfase 8.3.2: filtros e visualizacao ------------------------------------------

test('filtro de periodo tem as 3 opcoes esperadas', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /const PERIOD_FILTERS = \[\s*\n\s*\{ value: 'today', label: 'Hoje' \},\s*\n\s*\{ value: 'next7', label: 'Próximos 7 dias' \},\s*\n\s*\{ value: 'all', label: 'Todos' \},\s*\n\s*\];/,
  );
});

test('filtro de status tem as 4 opcoes esperadas', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /const STATUS_FILTERS = \[\s*\n\s*\{ value: 'all', label: 'Todos' \},\s*\n\s*\{ value: 'scheduled', label: 'Agendados' \},\s*\n\s*\{ value: 'completed', label: 'Concluídos' \},\s*\n\s*\{ value: 'cancelled', label: 'Cancelados' \},\s*\n\s*\];/,
  );
});

test('filtro de tipo e um select com "Todos" + os 7 tipos derivados de ITEM_TYPE_LABELS', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /const ITEM_TYPE_FILTERS = \[\s*\n\s*\{ value: 'all', label: 'Todos' \},\s*\n\s*\.\.\.Object\.entries\(ITEM_TYPE_LABELS\)\.map\(\(\[value, label\]\) => \(\{ value, label \}\)\),\s*\n\s*\];/,
  );
  assert.match(contents, /id="agenda-type-filter"/);
  assert.match(contents, /<select/);
});

test('toggles de periodo e status usam aria-pressed', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /aria-pressed=\{periodFilter === filter\.value\}/);
  assert.match(contents, /aria-pressed=\{statusFilter === filter\.value\}/);
});

test('grupos de toggle tem role="group" e aria-label descritivo', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /role="group" aria-label="Filtrar por período"/);
  assert.match(contents, /role="group" aria-label="Filtrar por status"/);
});

test('select de tipo tem label associado via htmlFor/id', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /htmlFor="agenda-type-filter"/);
  assert.match(contents, /id="agenda-type-filter"/);
});

test('subtitulo do hero e dinamico conforme o periodo selecionado', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /const PERIOD_SUBTITLES = \{\s*\n\s*today: 'Acompanhe seus compromissos de hoje\.',\s*\n\s*next7: 'Acompanhe seus compromissos dos próximos 7 dias\.',\s*\n\s*all: 'Acompanhe todos os seus compromissos\.',\s*\n\s*\};/,
  );
  assert.match(contents, /<p>\{PERIOD_SUBTITLES\[periodFilter\]\}<\/p>/);
});

test('contador mostra apenas o total atual, sem "de Y"', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /\{agenda\.items\.length\} \{agenda\.items\.length === 1 \? 'compromisso' : 'compromissos'\}/,
  );
  assert.doesNotMatch(contents, /\bde \$\{/);
});

test('empty state diferencia filtros padrao de filtros customizados', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(
    contents,
    /const isDefaultFilters =\s*\n\s*periodFilter === DEFAULT_PERIOD_FILTER &&\s*\n\s*statusFilter === DEFAULT_STATUS_FILTER &&\s*\n\s*itemTypeFilter === DEFAULT_ITEM_TYPE_FILTER;/,
  );
  assert.match(contents, /Nenhum compromisso encontrado para os filtros selecionados\./);
  assert.match(contents, /isDefaultFilters\s*\n\s*\? 'Nenhum compromisso agendado para os próximos 7 dias\.'/);
});

test('toolbar de filtros so aparece fora de loading/erro (canShowToolbar)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /const canShowToolbar = !isLoading && !hasError;/);
  assert.match(contents, /\{canShowToolbar \? \(/);
});

test('agrupamento por dia e ordenacao cronologica continuam preservados (nenhuma logica de sort/group alterada)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.match(contents, /function groupAgendaItemsByDay\(items\)/);
  assert.match(contents, /const groupedByDay = useMemo\(\(\) => groupAgendaItemsByDay\(agenda\.items\), \[agenda\.items\]\);/);
});

test('mudar filtros nao usa edicao, acoes de status, exclusao, busca textual, calendario ou paginacao (criacao e a unica mutacao desta subfase)', async () => {
  const contents = await source('AgendaPage.jsx');
  assert.doesNotMatch(contents, /updateItem\(|setItemStatus\(|removeItem\(/);
  assert.doesNotMatch(contents, /type="search"/);
  assert.doesNotMatch(contents, /page\s*[:=]\s*\d|pageSize/i);
});
