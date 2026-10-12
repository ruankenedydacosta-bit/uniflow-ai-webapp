import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = () => readFile(new URL('./SimplifiedAgendaPage.jsx', import.meta.url), 'utf8');

// ============================================================================
// AGPUSH1 -- cobertura do deep link de push de Agenda (?item=<id>[&
// reminderPrompt=1]) adicionado a SimplifiedAgendaPage.jsx. Mesmo padrao de
// cobertura estrutural usado no resto do projeto (sem Testing Library/
// jsdom); o resto da pagina (calendario/CRUD) e pre-existente e nao e
// coberto aqui.
// ============================================================================

test('resolve o item do deep link via getAgendaItem -- RLS ja garante ownership, nunca confia so no id da URL', async () => {
  const content = await source();
  assert.match(content, /import \{ getAgendaItem \} from '\.\.\/\.\.\/services\/agendaService\.js';/);
  assert.match(content, /const result = await getAgendaItem\(workspaceId, itemId\);/);
});

test('reminderPrompt=1 abre AgendaReminderChoiceModal -- ?item= sozinho so navega o calendario ate o dia, sem abrir nada', async () => {
  const content = await source();
  assert.match(content, /import AgendaReminderChoiceModal from '\.\/AgendaReminderChoiceModal\.jsx';/);
  assert.match(content, /if \(searchParams\.get\('reminderPrompt'\) === '1'\) \{/);
  assert.match(content, /setReminderPromptItem\(item\);/);
});

test('limpa os parametros da URL depois de processar o deep link -- reload/voltar nao reabre a pergunta sozinho', async () => {
  const content = await source();
  const effectBody = content.slice(content.indexOf("const itemId = searchParams.get('item');"), content.indexOf('return () => {\n      cancelled = true;'));
  assert.match(effectBody, /params\.delete\('item'\);/);
  assert.match(effectBody, /params\.delete\('reminderPrompt'\);/);
  assert.match(effectBody, /\{ replace: true \}/);
});

test('sem workspaceId ou sem ?item=, o efeito nao faz nenhuma chamada (retorna cedo)', async () => {
  const content = await source();
  assert.match(content, /if \(!itemId \|\| !workspaceId\) return undefined;/);
});

// ============================================================================
// AGPUSH2 -- indicador de lembrete no card + microinteracao.
// ============================================================================

const css = () => readFile(new URL('./simplifiedAgenda.module.css', import.meta.url), 'utf8');

test('o indicador do card vem do estado PERSISTIDO, nunca de "a animacao rodou"', async () => {
  const content = await source();
  assert.match(content, /import \{ useAgendaReminderStates \} from '\.\.\/agenda-push\/useAgendaReminderStates\.js';/);
  assert.match(content, /const \{ statesByItemId, applyDecision \} = useAgendaReminderStates\(visibleItemIds\);/);
  assert.match(content, /const reminder = resolveReminderIndicator\(statesByItemId\.get\(item\.id\)\);/);
});

test('o card mostra o chip com sino + rotulo quando ha lembrete, e nada quando nao ha', async () => {
  const content = await source();
  assert.match(content, /import \{ BellIcon, ChevronRightIcon \} from '\.\/SimplifiedIcons\.jsx';/);
  const reminderBranch = content.slice(content.indexOf('reminder ? ('), content.indexOf('reminder ? (') + 600);
  assert.match(reminderBranch, /<span key=\{reminder\.label\} className=\{styles\.reminderChip\}/);
  assert.match(content, /<BellIcon \/>/);
  assert.match(content, /\{reminder\.label\}/);
});

// AGPUSH4: a v1 revelava o indicador IMEDIATAMENTE (applyDecision antes da
// animacao). O refinamento pediu o oposto -- o estado persistido ja esta
// salvo (feito antes de chegar aqui), mas a REVELACAO VISUAL do indicador
// so acontece quando a particula termina de ser absorvida (onAbsorbed),
// nunca antes. Ver AgendaReminderChoiceModal.jsx para a garantia de que o
// backend ja foi persistido primeiro.
test('AGPUSH4: a revelacao visual do indicador e adiada ate a particula ser absorvida -- via onAbsorbed, nunca antes de playReminderAppliedAnimation', async () => {
  const content = await source();
  const handler = content.slice(content.indexOf('function handleReminderApplied'), content.indexOf('function selectToday'));
  assert.match(handler, /onAbsorbed: \(\) => applyDecision\(agendaItemId, offsetMinutes\),/);
  const onAbsorbedIndex = handler.indexOf('onAbsorbed:');
  const playCallIndex = handler.indexOf('playReminderAppliedAnimation(');
  assert.ok(onAbsorbedIndex > playCallIndex, 'onAbsorbed deve estar DENTRO da chamada a playReminderAppliedAnimation, nunca um applyDecision solto antes dela');
});

test('"Nao precisa" (offsetMinutes null) aplica o estado na hora (sem particula para esperar) e nunca dispara animacao', async () => {
  const content = await source();
  const handler = content.slice(content.indexOf('function handleReminderApplied'), content.indexOf('function selectToday'));
  assert.match(handler, /if \(offsetMinutes == null \|\| !originRect\) \{\s*\n\s*applyDecision\(agendaItemId, offsetMinutes\);\s*\n\s*return;\s*\n\s*\}/);
});

test('card fora da tela: NUNCA scroll automatico nem navegacao -- so nao ha particula', async () => {
  const content = await source();
  const handler = content.slice(content.indexOf('function handleReminderApplied'), content.indexOf('function selectToday'));
  assert.doesNotMatch(handler, /scrollIntoView|scrollTo|navigate\(/);
});

test('o card de destino e localizado por um atributo estavel, nunca por classe de estilo', async () => {
  const content = await source();
  assert.match(content, /export const AGENDA_REMINDER_TARGET_ATTRIBUTE = 'data-agenda-reminder-target';/);
  assert.match(content, /\{\.\.\.\{ \[AGENDA_REMINDER_TARGET_ATTRIBUTE\]: item\.id \}\}/);
  assert.match(content, /document\.querySelector\(\s*\n?\s*`\[\$\{AGENDA_REMINDER_TARGET_ATTRIBUTE\}="\$\{agendaItemId\}"\]`/);
});

test('a microinteracao e cancelada ao sair da tela -- nenhuma particula sobrevive ao unmount', async () => {
  const content = await source();
  assert.match(content, /import \{\s*\n\s*cancelReminderAppliedAnimation,\s*\n\s*playReminderAppliedAnimation,\s*\n\} from '\.\.\/agenda-push\/agendaReminderAnimation\.js';/);
  assert.match(content, /useEffect\(\(\) => cancelReminderAppliedAnimation, \[\]\);/);
});

test('as classes da animacao vem do CSS module (o modulo de animacao segue JS puro)', async () => {
  const content = await source();
  assert.match(content, /import animationStyles from '\.\.\/agenda-push\/agendaReminderAnimation\.module\.css';/);
  assert.match(content, /overlay: animationStyles\.overlay,/);
  assert.match(content, /particle: animationStyles\.particle,/);
});

test('o chip cabe na altura que o card ja tinha -- titulo e indicador empilhados, sem comprimir o conteudo', async () => {
  const content = await css();
  const start = content.indexOf('.itemMain {');
  const itemMain = content.slice(start, content.indexOf('}', start));
  assert.match(itemMain, /flex-direction: column;/);
  assert.match(itemMain, /min-width: 0;/);

  const chipStart = content.indexOf('.reminderChip {');
  const chip = content.slice(chipStart, content.indexOf('}', chipStart));
  // 15px (titulo) + 2px (gap) + ~13px (chip) + 20px (padding) <= 54px de
  // min-height ja existente no .itemButton.
  assert.match(chip, /font-size: 11px;/);
  assert.match(chip, /text-overflow: ellipsis;/);
  assert.match(chip, /white-space: nowrap;/);
});

test('o chip usa token de marca existente, nunca uma cor nova', async () => {
  const content = await css();
  const chipStart = content.indexOf('.reminderChip {');
  const chip = content.slice(chipStart, content.indexOf('}', chipStart));
  assert.match(chip, /color: var\(--uf-app-primary-text\);/);
});

test('o lembrete tambem entra no aria-label do card (leitor de tela nunca perde a informacao)', async () => {
  const content = await source();
  assert.match(content, /\$\{reminder \? `, lembrete \$\{reminder\.label\}` : ''\}/);
});

// ============================================================================
// AGPUSH3 -- entry point real (Editar compromisso) reusa a MESMA
// handleReminderApplied ja usada pelo deep link/fallback. Uma unica
// implementacao do "o que fazer quando um lembrete e aplicado", nunca duas
// logicas de particula desalinhadas.
// ============================================================================

test('SimplifiedAgendaFormModal (Editar compromisso) recebe a MESMA handleReminderApplied do deep link -- fonte unica da logica de particula', async () => {
  const content = await source();
  const occurrences = content.match(/onReminderApplied=\{handleReminderApplied\}/g) ?? [];
  assert.equal(occurrences.length, 2, 'AgendaReminderChoiceModal (deep link) e SimplifiedAgendaFormModal (editar) devem repassar a mesma funcao');
});

test('o card e localizado por agenda_item_id (atributo estavel), nunca por titulo -- dois compromissos com o mesmo titulo nunca se confundem', async () => {
  const content = await source();
  assert.match(content, /export const AGENDA_REMINDER_TARGET_ATTRIBUTE = 'data-agenda-reminder-target';/);
  // O atributo e escrito com item.id (uuid real), nunca item.title.
  const attrUsage = content.slice(content.indexOf('{...{ [AGENDA_REMINDER_TARGET_ATTRIBUTE]'), content.indexOf('}}', content.indexOf('{...{ [AGENDA_REMINDER_TARGET_ATTRIBUTE]')) + 2);
  assert.match(attrUsage, /item\.id/);
  assert.doesNotMatch(attrUsage, /item\.title/);
});

test('conta lançada com antecedência entra no calendário; tocar nela abre o Financeiro, nunca a edição de compromisso', async () => {
  const content = await source();
  assert.match(content, /useScheduledTransactionAgendaItems\(\{\s+workspaceId,/);
  assert.match(content, /groupAgendaItemsByDay\(\[\.\.\.agenda\.items, \.\.\.scheduledTransactions\.items\]\)/);
  assert.match(content, /onClick=\{isProjected \? \(\) => navigate\(SIMPLIFIED_ROUTES\.RECORDS\) : \(\) => openEdit\(item\)\}/);
  assert.match(content, /\$\{isProjected \? ', abrir no Financeiro' : ''\}/);
});

test('conta projetada nunca vai para a consulta de lembretes (id com prefixo não existe em agenda_push_reminders)', async () => {
  const content = await source();
  assert.match(content, /selectedDayItems\.filter\(\(item\) => !isProjectedTransactionItem\(item\)\)/);
});

test('o resumo de amanhã só aparece com as contas do Financeiro carregadas, nunca afirma "nenhuma conta" sem dado', async () => {
  const content = await source();
  assert.match(content, /!scheduledTransactions\.isLoading && !scheduledTransactions\.error \? \(/);
});

test('a Home junta as contas lançadas com antecedência aos compromissos de hoje e amanhã', async () => {
  const home = await readFile(new URL('./SimplifiedHomeAgenda.jsx', import.meta.url), 'utf8');
  assert.match(home, /buildHomeTimeline\(\[\.\.\.agenda\.items, \.\.\.scheduledTransactions\.items\], now\)/);
});

test('o hook guarda o resultado com a chave da consulta e busca de novo quando o Financeiro muda', async () => {
  const hook = await readFile(new URL('./useScheduledTransactionAgendaItems.js', import.meta.url), 'utf8');
  assert.match(hook, /const queryKey = workspaceId \? `\$\{workspaceId\}\|\$\{dateFrom\}\|\$\{dateTo\}` : null;/);
  assert.match(hook, /if \(loaded\.queryKey !== queryKey\) return \{ items: NO_ITEMS, isLoading: true, error: null \};/);
  assert.match(hook, /window\.addEventListener\(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged\);/);
  assert.match(hook, /\[queryKey, workspaceId, dateFrom, dateTo, reloadToken\]/);
  assert.match(hook, /\} catch \{\n\s+next = \{ queryKey, items: NO_ITEMS, error: LOAD_ERROR \};/);
});

test('a busca das contas é enxuta: só despesa e receita previstas, só os campos da projeção', async () => {
  const service = await readFile(new URL('../../services/transactionService.js', import.meta.url), 'utf8');
  const fnBody = service.slice(
    service.indexOf('export async function listScheduledTransactionCandidates'),
    service.indexOf('export async function getTransaction'),
  );
  assert.match(fnBody, /\.select\(SCHEDULED_TRANSACTION_FIELDS\)/);
  assert.match(fnBody, /\.in\('transaction_type', \['expense', 'income'\]\)/);
  assert.match(fnBody, /\.eq\('status', 'pending'\)/);
  assert.match(fnBody, /fetchAllPages\(/);
  assert.match(service, /const SCHEDULED_TRANSACTION_FIELDS =\n {2}'id, description, transaction_type, status, transaction_date, created_at, updated_at';/);
});
