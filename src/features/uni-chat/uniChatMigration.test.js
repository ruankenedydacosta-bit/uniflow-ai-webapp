import assert from 'node:assert/strict';
import test from 'node:test';

function workspaceModeToType(mode) {
  return mode === 'empresa' ? 'business' : 'personal';
}

function messageToDb(msg, conversationId, userId) {
  const meta = {};
  if (msg.highlight) meta.highlight = msg.highlight;
  if (msg.confirmation) meta.confirmation = msg.confirmation;
  if (msg.time) meta.displayTime = msg.time;
  return {
    conversation_id: conversationId,
    user_id: userId,
    role: msg.from === 'user' ? 'user' : 'assistant',
    message_type: msg.type || 'text',
    content: msg.text || '',
    metadata: meta,
    client_message_id: msg.clientMessageId || msg.id,
  };
}

function dbToConversation(row) {
  return {
    id: row.id,
    title: row.title || '',
    mode: row.workspace_type === 'business' ? 'empresa' : 'pessoal',
    messages: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function dbToMessage(row) {
  const meta = row.metadata || {};
  const msg = {
    id: row.client_message_id || row.id,
    dbId: row.id,
    from: row.role === 'user' ? 'user' : 'uni',
    type: row.message_type || 'text',
    text: row.content || '',
    time: meta.displayTime || '',
  };
  if (meta.highlight) msg.highlight = meta.highlight;
  if (meta.confirmation) msg.confirmation = meta.confirmation;
  return msg;
}

function simulateMigration(localConvs, workspaceMap) {
  let migrated = 0;
  let errors = 0;
  let skipped = 0;
  let hasFailure = false;

  for (const conv of localConvs) {
    const wsType = workspaceModeToType(conv.mode);
    const workspaceId = workspaceMap?.[wsType];

    if (!workspaceId) {
      skipped++;
      hasFailure = true;
      continue;
    }

    if (conv._alreadyExists) {
      migrated++;
      continue;
    }

    if (conv._insertError) {
      errors++;
      hasFailure = true;
      continue;
    }

    migrated++;
  }

  return { migrated, errors, skipped, complete: !hasFailure };
}

test('conversa PF recebe workspace pessoal', () => {
  const map = { personal: 'uuid-pf', business: 'uuid-pj' };

  const wsType = workspaceModeToType('pessoal');
  const wsId = map[wsType];

  assert.equal(wsType, 'personal');
  assert.equal(wsId, 'uuid-pf');
});

test('conversa PJ recebe workspace empresarial', () => {
  const map = { personal: 'uuid-pf', business: 'uuid-pj' };

  const wsType = workspaceModeToType('empresa');
  const wsId = map[wsType];

  assert.equal(wsType, 'business');
  assert.equal(wsId, 'uuid-pj');
});

test('workspace ausente nao marca migracao concluida', () => {
  const localConvs = [
    { mode: 'pessoal', title: 'Conv A', messages: [] },
    { mode: 'empresa', title: 'Conv B', messages: [] },
  ];
  const map = { personal: 'uuid-pf' };

  const result = simulateMigration(localConvs, map);

  assert.equal(result.skipped, 1);
  assert.equal(result.complete, false);
});

test('nova tentativa nao duplica conversas', () => {
  const localConvs = [
    { mode: 'pessoal', title: 'Conversa PF', messages: [], _alreadyExists: true },
    { mode: 'empresa', title: 'Conversa PJ', messages: [], _alreadyExists: true },
  ];
  const map = { personal: 'uuid-pf', business: 'uuid-pj' };

  const result = simulateMigration(localConvs, map);

  assert.equal(result.migrated, 2);
  assert.equal(result.errors, 0);
  assert.equal(result.skipped, 0);
});

test('erro de insercao nao marca migracao concluida', () => {
  const localConvs = [
    { mode: 'pessoal', title: 'Conversa PF', messages: [], _insertError: true },
  ];
  const map = { personal: 'uuid-pf' };

  const result = simulateMigration(localConvs, map);

  assert.equal(result.errors, 1);
  assert.equal(result.complete, false);
});

test('migracao completa quando todas as conversas elegiveis sao persistidas', () => {
  const localConvs = [
    { mode: 'pessoal', title: 'Conv PF', messages: [] },
    { mode: 'empresa', title: 'Conv PJ', messages: [] },
  ];
  const map = { personal: 'uuid-pf', business: 'uuid-pj' };

  const result = simulateMigration(localConvs, map);

  assert.equal(result.migrated, 2);
  assert.equal(result.errors, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.complete, true);
});

test('messageToDb preserva highlight e confirmation', () => {
  const msg = {
    id: 'msg-1',
    clientMessageId: 'client-abc',
    from: 'uni',
    type: 'text',
    text: 'Seu saldo é R$ 1.000',
    time: '14:30',
    highlight: 'R$ 1.000',
    confirmation: { title: 'Teste', status: 'pending', rows: [] },
  };

  const dbMsg = messageToDb(msg, 'conv-uuid', 'user-uuid');

  assert.equal(dbMsg.role, 'assistant');
  assert.equal(dbMsg.message_type, 'text');
  assert.equal(dbMsg.content, 'Seu saldo é R$ 1.000');
  assert.equal(dbMsg.client_message_id, 'client-abc');
  assert.deepEqual(dbMsg.metadata, {
    highlight: 'R$ 1.000',
    confirmation: { title: 'Teste', status: 'pending', rows: [] },
    displayTime: '14:30',
  });
});

test('messageToDb mapeia user role corretamente', () => {
  const msg = {
    id: 'msg-2',
    from: 'user',
    type: 'text',
    text: 'Olá!',
    time: '14:31',
  };

  const dbMsg = messageToDb(msg, 'conv-uuid', 'user-uuid');

  assert.equal(dbMsg.role, 'user');
  assert.equal(dbMsg.client_message_id, 'msg-2');
});

test('dbToConversation mapeia business para modo empresa', () => {
  const row = {
    id: 'uuid-1',
    title: 'Conversa empresa',
    workspace_type: 'business',
    created_at: '2025-06-01T00:00:00Z',
    updated_at: '2025-06-01T00:00:00Z',
    archived_at: null,
  };

  const conv = dbToConversation(row);

  assert.equal(conv.mode, 'empresa');
  assert.equal(conv.id, 'uuid-1');
  assert.equal(conv.title, 'Conversa empresa');
});

test('dbToConversation mapeia personal para modo pessoal', () => {
  const row = {
    id: 'uuid-2',
    title: '',
    workspace_type: 'personal',
    created_at: '2025-06-01T00:00:00Z',
    updated_at: '2025-06-01T00:00:00Z',
    archived_at: null,
  };

  const conv = dbToConversation(row);

  assert.equal(conv.mode, 'pessoal');
  assert.equal(conv.title, '');
});

test('dbToMessage restaura highlight do metadata', () => {
  const row = {
    id: 'db-msg-1',
    role: 'assistant',
    message_type: 'text',
    content: 'Seu saldo é R$ 1.000',
    client_message_id: 'client-abc',
    created_at: '2025-06-01T14:30:00Z',
    metadata: { highlight: 'R$ 1.000', displayTime: '14:30' },
  };

  const msg = dbToMessage(row);

  assert.equal(msg.from, 'uni');
  assert.equal(msg.text, 'Seu saldo é R$ 1.000');
  assert.equal(msg.highlight, 'R$ 1.000');
  assert.equal(msg.id, 'client-abc');
});

test('dbToMessage restaura confirmation do metadata', () => {
  const confirmation = { title: 'Nova despesa', status: 'pending', rows: [] };
  const row = {
    id: 'db-msg-2',
    role: 'assistant',
    message_type: 'confirmation',
    content: 'Confirme os dados',
    client_message_id: 'client-conf',
    created_at: '2025-06-01T14:31:00Z',
    metadata: { confirmation },
  };

  const msg = dbToMessage(row);

  assert.equal(msg.type, 'confirmation');
  assert.deepEqual(msg.confirmation, confirmation);
});

test('dbToMessage mapeia user role corretamente', () => {
  const row = {
    id: 'db-msg-3',
    role: 'user',
    message_type: 'text',
    content: 'Oi',
    client_message_id: 'client-user',
    created_at: '2025-06-01T14:32:00Z',
    metadata: {},
  };

  const msg = dbToMessage(row);

  assert.equal(msg.from, 'user');
});
