import { createAgendaClientOperationId } from './agendaService.js';

export const AGENDA_OPERATION_STORAGE_KEY = 'uniflow:agenda:create-operations:v1';
const AGENDA_OPERATION_LOCK_NAME = 'uniflow:agenda:create-operations:v1';

let inProcessLock = Promise.resolve();

function defaultStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
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
    throw new Error('AGENDA_OPERATION_FINGERPRINT_UNAVAILABLE');
  }
  const canonicalIntent = JSON.stringify(canonicalize(intent));
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(canonicalIntent));
  return `sha256:${bytesToHex(digest)}`;
}

function readRecords(storage) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(AGENDA_OPERATION_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((record) => (
      record
      && typeof record.userId === 'string'
      && typeof record.workspaceId === 'string'
      && typeof record.origin === 'string'
      && /^sha256:[0-9a-f]{64}$/.test(record.fingerprint)
      && typeof record.clientOperationId === 'string'
    ));
  } catch {
    return [];
  }
}

function writeRecords(storage, records) {
  if (!storage) return false;
  try {
    storage.setItem(AGENDA_OPERATION_STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

function assertScope({ userId, workspaceId, origin }) {
  if (!userId || !workspaceId || !origin) {
    throw new Error('AGENDA_OPERATION_SCOPE_REQUIRED');
  }
}

async function withInProcessLock(callback) {
  const previous = inProcessLock;
  let release;
  inProcessLock = new Promise((resolve) => { release = resolve; });
  await previous;
  try {
    return await callback();
  } finally {
    release();
  }
}

async function withOperationLock(callback) {
  if (globalThis.navigator?.locks?.request) {
    return globalThis.navigator.locks.request(AGENDA_OPERATION_LOCK_NAME, callback);
  }
  return withInProcessLock(callback);
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

  return withOperationLock(async () => {
    const records = readRecords(storage);
    const existing = records.find((record) => (
      record.userId === userId
      && record.workspaceId === workspaceId
      && record.origin === origin
      && record.fingerprint === fingerprint
    ));
    if (existing) return Object.freeze({ ...existing, restored: true });

    const record = {
      userId,
      workspaceId,
      origin,
      fingerprint,
      clientOperationId: preferredOperationId ?? createOperationId(),
    };
    writeRecords(storage, [...records, record]);
    return Object.freeze({ ...record, restored: false });
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
  return withOperationLock(async () => {
    const records = readRecords(storage);
    const remaining = records.filter((record) => !(
      record.userId === userId
      && record.workspaceId === workspaceId
      && record.origin === origin
      && record.clientOperationId === clientOperationId
    ));
    if (remaining.length === records.length) return false;
    writeRecords(storage, remaining);
    return true;
  });
}

export async function clearAgendaOperationsForOrigin({
  userId,
  workspaceId,
  origin,
  storage = defaultStorage(),
}) {
  assertScope({ userId, workspaceId, origin });
  return withOperationLock(async () => {
    const records = readRecords(storage);
    const remaining = records.filter((record) => !(
      record.userId === userId
      && record.workspaceId === workspaceId
      && record.origin === origin
    ));
    if (remaining.length === records.length) return false;
    writeRecords(storage, remaining);
    return true;
  });
}

export async function clearAgendaOperationByIntent({
  userId,
  workspaceId,
  origin,
  intent,
  storage = defaultStorage(),
}) {
  assertScope({ userId, workspaceId, origin });
  const fingerprint = await createAgendaIntentFingerprint(intent);
  return withOperationLock(async () => {
    const records = readRecords(storage);
    const remaining = records.filter((record) => !(
      record.userId === userId
      && record.workspaceId === workspaceId
      && record.origin === origin
      && record.fingerprint === fingerprint
    ));
    if (remaining.length === records.length) return false;
    writeRecords(storage, remaining);
    return true;
  });
}
