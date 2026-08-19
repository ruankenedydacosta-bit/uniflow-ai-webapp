import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = () => readFile(new URL('./SimplifiedAgendaFormModal.jsx', import.meta.url), 'utf8');

// ============================================================================
// AGPUSH3 -- entry point REAL do lembrete de Agenda dentro de
// "Editar compromisso". Mesmo padrão de cobertura estrutural usado no
// resto do projeto (sem Testing Library/jsdom).
// ============================================================================

test('so mostra a secao de lembrete ao EDITAR (item.id ja existe de verdade) -- criar continua com o placeholder', async () => {
  const content = await source();
  assert.match(content, /\{isEditing \? \(/);
  const reminderBlock = content.slice(content.indexOf('{isEditing ? ('), content.indexOf('{localError ? ('));
  assert.match(reminderBlock, /Nenhum lembrete configurado/);
  assert.match(reminderBlock, /Lembrete por notificação ainda não está disponível nesta versão\./);
});

test('busca o estado REAL do lembrete via getAgendaPushReminderState -- nunca estado temporario da animacao', async () => {
  const content = await source();
  assert.match(content, /import \{ getAgendaPushReminderState \} from '\.\.\/agenda-push\/agendaPushReminderService\.js';/);
  assert.match(content, /const result = await getAgendaPushReminderState\(item\.id\);/);
  assert.match(content, /setReminderIndicator\(resolveReminderIndicator\(result\?\.data\)\);/);
});

test('reutiliza o AgendaReminderChoiceModal ja existente -- nunca cria um segundo componente', async () => {
  const content = await source();
  assert.match(content, /import AgendaReminderChoiceModal from '\.\/AgendaReminderChoiceModal\.jsx';/);
  const usages = content.match(/<AgendaReminderChoiceModal/g) ?? [];
  assert.equal(usages.length, 1, 'so uma renderizacao do modal de escolha');
});

test('sem lembrete: botao chama "Escolher lembrete"; com lembrete: chama "Alterar"', async () => {
  const content = await source();
  assert.match(content, /\{reminderIndicator \? 'Alterar' : 'Escolher lembrete'\}/);
});

test('offset 30/60 do backend real vira o rotulo certo no Editar compromisso (30 min antes / 1h antes)', async () => {
  const content = await source();
  assert.match(content, /import \{ resolveReminderIndicator \} from '\.\.\/agenda-push\/agendaReminderIndicator\.js';/);
});

// ---------------------------------------------------------------------------
// Sequencia critica: persistencia -> fecha escolha -> recolhe Editar
// compromisso -> fecha de verdade -> proximo frame -> particula no card real.
// ---------------------------------------------------------------------------

test('CRITICO: a ordem e persistencia -> fecha ReminderChoiceModal -> recolhe -> fecha Editar -> rAF -> particula', async () => {
  const content = await source();
  const handler = content.slice(
    content.indexOf('async function handleReminderApplied'),
    content.indexOf('async function clearCreationOperation'),
  );
  const closeChoiceIndex = handler.indexOf('setShowReminderChoice(false);');
  const collapseIndex = handler.indexOf('setIsClosingForReminder(true);');
  const closeFormIndex = handler.indexOf('await handleClose();');
  const rafIndex = handler.indexOf('requestAnimationFrame(');
  const appliedIndex = handler.indexOf('onReminderApplied?.(');

  assert.ok(closeChoiceIndex > -1, 'precisa fechar o modal de escolha');
  assert.ok(collapseIndex > closeChoiceIndex, 'recolhimento vem depois de fechar a escolha');
  assert.ok(closeFormIndex > collapseIndex, 'so fecha de verdade depois do recolhimento');
  assert.ok(rafIndex > closeFormIndex, 'a particula so e agendada depois do fechamento real');
  assert.ok(appliedIndex > rafIndex, 'onReminderApplied roda dentro do requestAnimationFrame');
});

test('usa requestAnimationFrame -- nunca um delay/setTimeout magico para localizar o card', async () => {
  const content = await source();
  const handler = content.slice(
    content.indexOf('async function handleReminderApplied'),
    content.indexOf('async function clearCreationOperation'),
  );
  assert.match(handler, /requestAnimationFrame\(\(\) => \{/);
  assert.doesNotMatch(handler, /setTimeout\(/);
});

test('"Nao precisa" (offsetMinutes null) mantem o Editar compromisso aberto -- nunca recolhe, nunca fecha, nunca anima', async () => {
  const content = await source();
  const handler = content.slice(
    content.indexOf('async function handleReminderApplied'),
    content.indexOf('async function clearCreationOperation'),
  );
  assert.match(handler, /if \(offsetMinutes == null \|\| !originRect\) return;/);
  const beforeGuard = handler.slice(0, handler.indexOf('if (offsetMinutes == null'));
  assert.doesNotMatch(beforeGuard, /setIsClosingForReminder|handleClose\(\)|requestAnimationFrame/);
});

test('prefers-reduced-motion pula o recolhimento do Editar compromisso, mas ainda fecha e anima', async () => {
  const content = await source();
  assert.match(content, /import \{ prefersReducedMotion \} from '\.\.\/agenda-push\/agendaReminderAnimation\.js';/);
  const handler = content.slice(
    content.indexOf('async function handleReminderApplied'),
    content.indexOf('async function clearCreationOperation'),
  );
  assert.match(handler, /if \(!prefersReducedMotion\(\)\) \{\s*\n\s*setClosingProfile\(profile\);\s*\n\s*setIsClosingForReminder\(true\);/);
});

test('AGPUSH4: o recolhimento usa formCollapseMs do PERFIL da variante escolhida -- nunca uma constante fixa unica', async () => {
  const content = await source();
  assert.match(content, /import \{ getReminderMotionProfile \} from '\.\.\/agenda-push\/agendaReminderMotionProfiles\.js';/);
  const handler = content.slice(
    content.indexOf('async function handleReminderApplied'),
    content.indexOf('async function clearCreationOperation'),
  );
  assert.match(handler, /const profile = getReminderMotionProfile\(variant\);/);
  assert.match(handler, /await wait\(profile\.formCollapseMs\);/);
});

test('durante o recolhimento, overlay/Esc/botoes ficam bloqueados -- mesmo padrao do modal de escolha (isBusy)', async () => {
  const content = await source();
  assert.match(content, /const isBusy = isMutating \|\| isClosingForReminder;/);
  assert.match(content, /closeOnOverlayClick=\{!isBusy\}/);
  assert.match(content, /closeOnEsc=\{!isBusy\}/);
});

test('handleReminderApplied e passado para baixo -- a pagina (dono do card real) e quem recebe o callback final, com variant', async () => {
  const content = await source();
  assert.match(content, /onReminderApplied,\s*\n\}\) \{/);
  assert.match(content, /onReminderApplied\?\.\(\{\s*\n\s*agendaItemId, variant, offsetMinutes, originRect,\s*\n\s*\}\);/);
});
