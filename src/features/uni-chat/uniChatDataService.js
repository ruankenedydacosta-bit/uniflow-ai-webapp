import { supabase, isSupabaseConfigured } from '../../services/supabaseClient';
import * as local from './chatHistory';

const CONVERSATIONS_TABLE = 'uni_conversations';
const MESSAGES_TABLE = 'uni_messages';
const MIGRATION_MARKER_KEY = 'uniflow.uni-chat.migration.v1';

let _isOnline = isSupabaseConfigured;

export function isOnline() {
  return _isOnline;
}

function setOnlineStatus(online) {
  _isOnline = online;
}

async function getUserId() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
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
    time: meta.displayTime || formatTimestamp(row.created_at),
  };
  if (meta.highlight) msg.highlight = meta.highlight;
  if (meta.confirmation) msg.confirmation = meta.confirmation;
  return msg;
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

function formatTimestamp(ts) {
  try {
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function workspaceModeToType(mode) {
  return mode === 'empresa' ? 'business' : 'personal';
}

// —————— CONVERSATIONS ——————

export async function listConversations(workspaceId, mode) {
  if (!supabase) return null;
  const userId = await getUserId();
  if (!userId) return null;

  const wsType = workspaceModeToType(mode);
  const { data, error } = await supabase
    .from(CONVERSATIONS_TABLE)
    .select('id, title, workspace_type, created_at, updated_at, archived_at')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .eq('workspace_type', wsType)
    .is('archived_at', null)
    .order('updated_at', { ascending: false });

  if (error) {
    setOnlineStatus(false);
    return null;
  }

  setOnlineStatus(true);
  return data.map(dbToConversation);
}

export async function listAllConversations(workspaceIds) {
  if (!supabase) return null;
  const userId = await getUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from(CONVERSATIONS_TABLE)
    .select('id, title, workspace_type, created_at, updated_at, archived_at')
    .eq('user_id', userId)
    .in('workspace_id', workspaceIds)
    .is('archived_at', null)
    .order('updated_at', { ascending: false });

  if (error) {
    setOnlineStatus(false);
    return null;
  }

  setOnlineStatus(true);
  return data.map(dbToConversation);
}

export async function createConversation(mode, workspaceId) {
  if (!supabase) return null;
  const userId = await getUserId();
  if (!userId) return null;

  const wsType = workspaceModeToType(mode);
  const { data, error } = await supabase
    .from(CONVERSATIONS_TABLE)
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      workspace_type: wsType,
      title: '',
    })
    .select('id, title, workspace_type, created_at, updated_at, archived_at')
    .single();

  if (error) {
    setOnlineStatus(false);
    return null;
  }

  setOnlineStatus(true);
  return dbToConversation(data);
}

export async function updateConversationTitle(convId, title) {
  if (!supabase) return false;
  const userId = await getUserId();
  if (!userId) return false;

  const { error } = await supabase
    .from(CONVERSATIONS_TABLE)
    .update({ title })
    .eq('id', convId)
    .eq('user_id', userId);

  if (error) {
    setOnlineStatus(false);
    return false;
  }

  setOnlineStatus(true);
  return true;
}

export async function archiveConversation(convId) {
  if (!supabase) return false;
  const userId = await getUserId();
  if (!userId) return false;

  const { error } = await supabase
    .from(CONVERSATIONS_TABLE)
    .update({ archived_at: new Date().toISOString() })
    .eq('id', convId)
    .eq('user_id', userId);

  if (error) {
    setOnlineStatus(false);
    return false;
  }

  setOnlineStatus(true);
  return true;
}

export async function deleteConversation(convId) {
  if (!supabase) return false;
  const userId = await getUserId();
  if (!userId) return false;

  const { error } = await supabase
    .from(CONVERSATIONS_TABLE)
    .delete()
    .eq('id', convId)
    .eq('user_id', userId);

  if (error) {
    setOnlineStatus(false);
    return false;
  }

  setOnlineStatus(true);
  return true;
}

// —————— MESSAGES ——————

export async function loadMessages(convId) {
  if (!supabase) return null;
  const userId = await getUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from(MESSAGES_TABLE)
    .select('id, role, message_type, content, metadata, client_message_id, created_at')
    .eq('conversation_id', convId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    setOnlineStatus(false);
    return null;
  }

  setOnlineStatus(true);
  return data.map(dbToMessage);
}

export async function saveMessage(convId, msg, userIdOverride) {
  if (!supabase) return null;
  const userId = userIdOverride || await getUserId();
  if (!userId) return null;

  const dbMsg = messageToDb(msg, convId, userId);

  try {
    const { data, error } = await supabase
      .from(MESSAGES_TABLE)
      .insert(dbMsg)
      .select('id, role, message_type, content, metadata, client_message_id, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        const { data: existing } = await supabase
          .from(MESSAGES_TABLE)
          .select('id, role, message_type, content, metadata, client_message_id, created_at')
          .eq('conversation_id', convId)
          .eq('client_message_id', dbMsg.client_message_id)
          .single();
        if (existing) return dbToMessage(existing);
      }
      setOnlineStatus(false);
      return null;
    }

    setOnlineStatus(true);
    return dbToMessage(data);
  } catch {
    setOnlineStatus(false);
    return null;
  }
}

export async function saveMessages(convId, msgs) {
  if (!supabase || msgs.length === 0) return false;
  const userId = await getUserId();
  if (!userId) return false;

  const dbMsgs = msgs.map(m => messageToDb(m, convId, userId));

  const { error } = await supabase
    .from(MESSAGES_TABLE)
    .insert(dbMsgs);

  if (error) {
    setOnlineStatus(false);
    return false;
  }

  setOnlineStatus(true);
  return true;
}

// —————— MIGRATION ——————

export function isMigrationComplete() {
  try {
    return localStorage.getItem(MIGRATION_MARKER_KEY) === 'done';
  } catch {
    return false;
  }
}

export function markMigrationComplete() {
  try {
    localStorage.setItem(MIGRATION_MARKER_KEY, 'done');
  } catch {
    /* noop */
  }
}

export async function migrateLocalHistory(workspaceMap) {
  if (!supabase) return { migrated: 0, errors: 0, skipped: 0 };
  if (isMigrationComplete()) return { migrated: 0, errors: 0, skipped: 0 };

  const userId = await getUserId();
  if (!userId) return { migrated: 0, errors: 0, skipped: 0 };

  const localConvs = local.loadHistory();
  if (localConvs.length === 0) {
    markMigrationComplete();
    return { migrated: 0, errors: 0, skipped: 0 };
  }

  let migrated = 0;
  let errors = 0;
  let skipped = 0;
  let hasFailure = false;

  for (const conv of localConvs) {
    try {
      const wsType = workspaceModeToType(conv.mode);
      const workspaceId = workspaceMap?.[wsType];

      if (!workspaceId) {
        skipped++;
        hasFailure = true;
        continue;
      }

      const { data: existing } = await supabase
        .from(CONVERSATIONS_TABLE)
        .select('id')
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .eq('workspace_type', wsType)
        .eq('title', conv.title || '')
        .maybeSingle();

      if (existing) {
        migrated++;
        continue;
      }

      const { data: convRow, error: convErr } = await supabase
        .from(CONVERSATIONS_TABLE)
        .insert({
          user_id: userId,
          workspace_id: workspaceId,
          workspace_type: wsType,
          title: conv.title || '',
        })
        .select('id')
        .single();

      if (convErr || !convRow) {
        errors++;
        hasFailure = true;
        continue;
      }

      const dbId = convRow.id;

      if (conv.messages && conv.messages.length > 0) {
        const localMsgs = conv.messages.map(m => messageToDb(m, dbId, userId));
        const { error: msgErr } = await supabase
          .from(MESSAGES_TABLE)
          .insert(localMsgs);

        if (msgErr) {
          errors++;
          hasFailure = true;
          await supabase
            .from(CONVERSATIONS_TABLE)
            .delete()
            .eq('id', dbId);
          continue;
        }
      }

      migrated++;
    } catch {
      errors++;
      hasFailure = true;
    }
  }

  if (!hasFailure) {
    markMigrationComplete();
  }

  return { migrated, errors, skipped };
}
