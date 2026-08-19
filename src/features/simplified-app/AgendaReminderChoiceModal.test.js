import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = () => readFile(new URL('./AgendaReminderChoiceModal.jsx', import.meta.url), 'utf8');

// ============================================================================
// AGPUSH1 -- AgendaReminderChoiceModal.jsx (fallback iPhone/deep link).
// Mesmo padrao de cobertura estrutural usado no resto do projeto (sem
// Testing Library/jsdom).
// ============================================================================

test('sempre confere o estado atual no servidor antes de oferecer a escolha -- nunca assume que ainda esta pendente', async () => {
  const content = await source();
  assert.match(content, /import \{ getAgendaPushReminderState \} from '\.\.\/agenda-push\/agendaPushReminderService\.js';/);
  assert.match(content, /const result = await getAgendaPushReminderState\(item\.id\);/);
});

test('se ja houver reminder_decision_at, mostra so uma confirmacao -- nunca reoferece a escolha (outro dispositivo pode ja ter decidido)', async () => {
  const content = await source();
  assert.match(content, /const decisionMade = Boolean\(result\?\.data\?\.reminder_decision_at\);/);
  assert.match(content, /state\.decisionMade \?/);
  assert.match(content, /Já registramos sua escolha para este compromisso\./);
});

test('as tres escolhas usam exatamente os offsets aceitos pela Edge Function (30, 60, none)', async () => {
  const content = await source();
  assert.match(content, /\{ offset: '30', label: '30 min antes' \}/);
  assert.match(content, /\{ offset: '60', label: '1h antes' \}/);
  assert.match(content, /\{ offset: 'none', label: 'Não precisa' \}/);
});

test('escolha e enviada via sendAgendaReminderDecision (caminho autenticado) -- nunca uma segunda implementacao de escrita', async () => {
  const content = await source();
  assert.match(content, /import \{ sendAgendaReminderDecision \} from '\.\.\/mobile-push\/pushEdgeFunctions\.js';/);
  assert.match(content, /await sendAgendaReminderDecision\(\{ agendaItemId: item\.id, offset \}\);/);
});

test('bloqueia fechamento enquanto envia -- mesmo padrao de AgendaStatusConfirmModal', async () => {
  const content = await source();
  assert.match(content, /closeOnOverlayClick=\{!isSubmitting\}/);
  assert.match(content, /closeOnEsc=\{!isSubmitting\}/);
});
