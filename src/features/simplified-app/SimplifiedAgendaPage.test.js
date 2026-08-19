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
  assert.match(content, /reminder \? \(\s*\n\s*<span className=\{styles\.reminderChip\}/);
  assert.match(content, /<BellIcon \/>/);
  assert.match(content, /\{reminder\.label\}/);
});

test('o estado real entra ANTES da animacao -- o indicador ja e verdade quando a particula sai', async () => {
  const content = await source();
  const handler = content.slice(content.indexOf('function handleReminderApplied'), content.indexOf('function selectToday'));
  const applyIndex = handler.indexOf('applyDecision(agendaItemId, offsetMinutes)');
  const playIndex = handler.indexOf('playReminderAppliedAnimation(');
  assert.ok(applyIndex > -1 && playIndex > applyIndex, 'applyDecision precisa vir antes da animacao');
});

test('"Nao precisa" (offsetMinutes null) nunca dispara particula ate o card', async () => {
  const content = await source();
  const handler = content.slice(content.indexOf('function handleReminderApplied'), content.indexOf('function selectToday'));
  assert.match(handler, /if \(offsetMinutes == null \|\| !originRect\) return;/);
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
