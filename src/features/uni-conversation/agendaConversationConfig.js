export const AGENDA_CONTEXTUAL_FOLLOWUP_FLAG_KEY = 'VITE_UNI_AGENDA_CONTEXTUAL_FOLLOWUP_ENABLED';

export function resolveAgendaContextualFollowupEnabled(env = {}) {
  return env[AGENDA_CONTEXTUAL_FOLLOWUP_FLAG_KEY] === 'true';
}

export const AGENDA_CONTEXTUAL_FOLLOWUP_ENABLED = resolveAgendaContextualFollowupEnabled(
  import.meta.env ?? {},
);
