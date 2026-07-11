export function cloneRecords(records = []) {
  return records.map((record) =>
    record.metadata
      ? { ...record, metadata: { ...record.metadata } }
      : { ...record },
  );
}

export function upsertRecord(records, nextRecord) {
  const recordIndex = records.findIndex((record) => record.id === nextRecord.id);

  if (recordIndex === -1) {
    return [nextRecord, ...records];
  }

  return records.map((record) =>
    record.id === nextRecord.id ? nextRecord : record,
  );
}

export function removeRecord(records, recordId) {
  return records.filter((record) => record.id !== recordId);
}

export function createDemoRecord(prefix, payload) {
  return {
    id: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...payload,
    source_type: 'manual',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function createDemoResult(data) {
  return {
    data,
    error: null,
    isConfigured: false,
  };
}
