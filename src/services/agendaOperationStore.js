import { createAgendaClientOperationId } from './agendaService.js';

export const AGENDA_OPERATION_STORAGE_KEY = 'uniflow:agenda:pending-operations:v2';
export const AGENDA_OPERATION_STATE = Object.freeze({ PENDING: 'pending' });

let inTabMutex = Promise.resolve();

function operationError(code, message) {
  return Object.assign(new Error(message), { code });
}

function defaultStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value ?? null;
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export async function createAgendaIntentFingerprint(intent) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof TextEncoder !== 'function') {
    throw operationError(
      'AGENDA_OPERATION_STORAGE_UNAVAILABLE',
      'Não foi possível validar a operação da Agenda neste navegador.',
    );
  }
  const canonicalIntent = JSON.stringify(canonicalize(intent));
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(canonicalIntent));
  return `sha256:${bytesToHex(digest)}`;
}

function assertScope({ userId, workspaceId, origin }) {
  if (!userId || !workspaceId || !origin) {
    throw operationError(
      'AGENDA_OPERATION_SCOPE_REQUIRED',
      'Não foi possível identificar a operação da Agenda.',
    );
  }
}

function isValidRecord(record) {
  return Boolean(
    record
    && typeof record.clientOperationId === 'string'
    && typeof record.userId === 'string'
    && typeof record.workspaceId === 'string'
    && typeof record.origin === 'string'
    && /^sha256:[0-9a-f]{64}$/.test(record.fingerprint)
    && record.state === AGENDA_OPERATION_STATE.PENDING,
  );
}

function readRecords(storage) {
  if (!storage) {
    throw operationError(
      'AGENDA_OPERATION_STORAGE_UNAVAILABLE',
      'O armazenamento seguro da operação não está disponível.',
    );
  }
  try {
    const raw = storage.getItem(AGENDA_OPERATION_STORAGE_KEY);
    if (raw == null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isValidRecord)) {
      throw new Error('invalid operation records');
    }
    return parsed;
  } catch {
    throw operationError(
      'AGENDA_OPERATION_STORAGE_UNAVAILABLE',
      'Não foi possível verificar a operação pendente da Agenda.',
    );
  }
}

function sameRecord(left, right) {
  return left.clientOperationId === right.clientOperationId
    && left.userId === right.userId
    && left.workspaceId === right.workspaceId
    && left.origin === right.origin
    && left.fingerprint === right.fingerprint
    && left.state === right.state;
}

function writeRecordsWithReadback(storage, records) {
  try {
    storage.setItem(AGENDA_OPERATION_STORAGE_KEY, JSON.stringify(records));
  } catch {
    throw operationError(
      'AGENDA_OPERATION_STORAGE_UNAVAILABLE',
      'Não foi possível persistir a operação pendente da Agenda.',
    );
  }
  const persisted = readRecords(storage);
  if (
    persisted.length !== records.length
    || records.some((record, index) => !sameRecord(record, persisted[index]))
  ) {
    throw operationError(
      'AGENDA_OPERATION_STORAGE_UNAVAILABLE',
      'A operação pendente da Agenda não pôde ser confirmada no armazenamento.',
    );
  }
}

async function withInTabMutex(callback) {
  const previous = inTabMutex;
  let release;
  inTabMutex = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    return await callback();
  } finally {
    release();
  }
}

function matchesScope(record, { userId, workspaceId, origin }) {
  return record.userId === userId
    && record.workspaceId === workspaceId
    && record.origin === origin;
}

export async function getOrCreateAgendaOperation({
  userId,
  workspaceId,
  origin,
  intent,
  preferredOperationId,
  storage = defaultStorage(),
  createOperationId = createAgendaClientOperationId,
}) {
  assertScope({ userId, workspaceId, origin });
  const fingerprint = await createAgendaIntentFingerprint(intent);

  return withInTabMutex(async () => {
    const records = readRecords(storage);
    const index = records.findIndex((record) => matchesScope(record, {
      userId, workspaceId, origin,
    }));
    const existing = records[index] ?? null;

    if (existing) {
      if (preferredOperationId && preferredOperationId !== existing.clientOperationId) {
        throw operationError(
          'AGENDA_OPERATION_PAYLOAD_CONFLICT',
          'A operação restaurada não corresponde ao fluxo atual da Agenda.',
        );
      }
      if (existing.fingerprint !== fingerprint) {
        if (!preferredOperationId) {
          throw operationError(
            'AGENDA_OPERATION_PAYLOAD_CONFLICT',
            'Os dados da operação restaurada são diferentes. Cancele e inicie novamente.',
          );
        }
        const updated = { ...existing, fingerprint };
        const nextRecords = [...records];
        nextRecords[index] = updated;
        writeRecordsWithReadback(storage, nextRecords);
        return Object.freeze({ ...updated, restored: true });
      }
      writeRecordsWithReadback(storage, records);
      return Object.freeze({ ...existing, restored: true });
    }

    const record = {
      clientOperationId: preferredOperationId ?? createOperationId(),
      userId,
      workspaceId,
      origin,
      fingerprint,
      state: AGENDA_OPERATION_STATE.PENDING,
    };
    writeRecordsWithReadback(storage, [...records, record]);
    return Object.freeze({ ...record, restored: false });
  });
}

export async function getCurrentAgendaOperation({
  userId,
  workspaceId,
  origin,
  storage = defaultStorage(),
}) {
  assertScope({ userId, workspaceId, origin });
  return withInTabMutex(async () => {
    const records = readRecords(storage);
    return records.find((record) => matchesScope(record, {
      userId, workspaceId, origin,
    })) ?? null;
  });
}

export async function clearAgendaOperation({
  userId,
  workspaceId,
  origin,
  clientOperationId,
  storage = defaultStorage(),
}) {
  assertScope({ userId, workspaceId, origin });
  if (!clientOperationId) return false;
  return withInTabMutex(async () => {
    const records = readRecords(storage);
    const remaining = records.filter((record) => !(
      matchesScope(record, { userId, workspaceId, origin })
      && record.clientOperationId === clientOperationId
    ));
    if (remaining.length === records.length) return false;
    writeRecordsWithReadback(storage, remaining);
    return true;
  });
}
