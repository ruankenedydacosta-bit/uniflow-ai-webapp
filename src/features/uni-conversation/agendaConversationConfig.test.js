import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENDA_CONTEXTUAL_FOLLOWUP_FLAG_KEY,
  resolveAgendaContextualFollowupEnabled,
} from './agendaConversationConfig.js';

test('follow-up contextual da Agenda permanece desligado por padrão', () => {
  assert.equal(resolveAgendaContextualFollowupEnabled({}), false);
  assert.equal(
    resolveAgendaContextualFollowupEnabled({ [AGENDA_CONTEXTUAL_FOLLOWUP_FLAG_KEY]: 'false' }),
    false,
  );
});

test('follow-up contextual da Agenda exige ativação explícita', () => {
  assert.equal(
    resolveAgendaContextualFollowupEnabled({ [AGENDA_CONTEXTUAL_FOLLOWUP_FLAG_KEY]: 'true' }),
    true,
  );
});
