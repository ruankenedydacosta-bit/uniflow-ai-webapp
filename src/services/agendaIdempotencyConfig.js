export const AGENDA_IDEMPOTENCY_FLAG_KEY = 'VITE_AGENDA_IDEMPOTENCY_ENABLED';

export function resolveAgendaIdempotencyEnabled(env = {}) {
  return env[AGENDA_IDEMPOTENCY_FLAG_KEY] === 'true';
}

export const AGENDA_IDEMPOTENCY_ENABLED = resolveAgendaIdempotencyEnabled(
  import.meta.env ?? {},
);
