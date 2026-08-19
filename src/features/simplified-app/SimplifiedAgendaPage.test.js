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
