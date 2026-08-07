import { supabase, isSupabaseConfigured } from '../../services/supabaseClient.js';
import { loadHistory as loadLocalHistory } from './chatHistory.js';

const CONVERSATIONS_TABLE = 'uni_conversations';
const MESSAGES_TABLE = 'uni_messages';
const MIGRATION_MARKER_KEY = 'uniflow.uni-chat.migration.v1';

let _connectionStatus = isSupabaseConfigured ? 'online' : 'offline';
let _statusListeners = [];

export function getConnectionStatus() {
  return _connectionStatus;
}

export function subscribeConnectionStatus(fn) {
  _statusListeners.push(fn);
  return () => {
    _statusListeners = _statusListeners.filter((f) => f !== fn);
  };
}

function setConnectionStatus(status) {
  if (status === _connectionStatus) return;
  _connectionStatus = status;
  for (const fn of _statusListeners) {
    try { fn(status); } catch { /* noop */ }
  }
}

function markOnline() {
  setConnectionStatus('online');
}

function markOffline() {
  setConnectionStatus('offline');
}

export function isOnline() {
  return _connectionStatus === 'online';
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
    // SUPORTE1: 'financial' (default, chat da Uni) ou 'support' (Central de
    // Suporte) -- linhas anteriores a esta fase nao tem a coluna preenchida
    // explicitamente no SELECT abaixo, entao caem no default 'financial' do
    // proprio banco; aqui so refletimos o que veio.
    conversationType: row.conversation_type || 'financial',
  };
}

export function dbToMessage(row) {
  const meta = row.metadata || {};
  const msg = {
    id: row.client_message_id || row.id,
    dbId: row.id,
    clientMessageId: row.client_message_id || null,
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
    .select('id, title, workspace_type, conversation_type, created_at, updated_at, archived_at')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .eq('workspace_type', wsType)
    .eq('conversation_type', 'financial')
    .is('archived_at', null)
    .order('updated_at', { ascending: false });

  if (error) {
    markOffline();
    return null;
  }

  markOnline();
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
    markOffline();
    return null;
  }

  markOnline();
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
    markOffline();
    return null;
  }

  markOnline();
  return dbToConversation(data);
}

// —————— SUPORTE1: conversas de suporte (mesma tabela, conversation_type='support') ——————
//
// Deliberadamente funções separadas de listConversations/createConversation
// (financeiro) em vez de um parâmetro extra ali: a Central de Suporte NUNCA
// filtra por workspace/modo PF-PJ (o histórico de suporte é do usuário, não
// do espaço financeiro ativo), então o filtro é genuinamente diferente, não
// apenas um valor a mais no mesmo shape de query.

export async function listSupportConversations() {
  if (!supabase) return null;
  const userId = await getUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from(CONVERSATIONS_TABLE)
    .select('id, title, workspace_type, conversation_type, created_at, updated_at, archived_at')
    .eq('user_id', userId)
    .eq('conversation_type', 'support')
    .is('archived_at', null)
    .order('updated_at', { ascending: false });

  if (error) {
    markOffline();
    return null;
  }

  markOnline();
  return data.map(dbToConversation);
}

export async function createSupportConversation(workspaceId, workspaceType) {
  if (!supabase) return null;
  const userId = await getUserId();
  if (!userId) return null;

  // workspace_id/workspace_type sao NOT NULL na tabela (mesmo schema do
  // chat financeiro) -- guardamos o espaco ativo no momento da criacao so
  // por completude/auditoria futura; a listagem de suporte (acima) nunca
  // filtra por eles, entao um valor "errado" aqui nunca esconde ou mistura
  // conversas de suporte entre si. `workspaceType` aqui ja e o valor final
  // do banco ('personal'/'business', ex.: access.currentWorkspace) -- NAO
  // o `mode` ('pessoal'/'empresa') do chat financeiro, entao nao passa por
  // workspaceModeToType.
  const dbWorkspaceType = workspaceType === 'business' ? 'business' : 'personal';
  const { data, error } = await supabase
    .from(CONVERSATIONS_TABLE)
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      workspace_type: dbWorkspaceType,
      conversation_type: 'support',
      title: '',
    })
    .select('id, title, workspace_type, conversation_type, created_at, updated_at, archived_at')
    .single();

  if (error) {
    markOffline();
    return null;
  }

  markOnline();
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
    markOffline();
    return false;
  }

  markOnline();
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
    markOffline();
    return false;
  }

  markOnline();
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
    markOffline();
    return false;
  }

  markOnline();
  return true;
}

// —————— MESSAGES ——————

export async function loadMessages(convId) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(MESSAGES_TABLE)
    .select('id, role, message_type, content, metadata, client_message_id, created_at')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true });

  if (error) {
    markOffline();
    return null;
  }

  markOnline();
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
          .maybeSingle();
        if (existing) return dbToMessage(existing);
        markOnline();
        return null;
      }
      markOffline();
      return null;
    }

    markOnline();
    return dbToMessage(data);
  } catch {
    markOffline();
    return null;
  }
}

export async function saveMessages(convId, msgs) {
  if (!supabase || msgs.length === 0) return false;
  const userId = await getUserId();
  if (!userId) return false;

  const dbMsgs = msgs.map(m => messageToDb(m, convId, userId));

  // BUG REAL (chaves duplicadas, causa raiz #1): um .insert() com várias
  // linhas é UMA ÚNICA instrução -- se QUALQUER linha colidir com o índice
  // único uni_messages_client_id_uidx (conversation_id, client_message_id),
  // o Postgres rejeita o LOTE INTEIRO (23505), inclusive as mensagens
  // genuinamente novas que nunca tinham sido salvas. O código antigo tratava
  // esse erro como sucesso (`return true`) sem inserir nada -- mensagens
  // novas silenciosamente nunca chegavam ao banco. Isso acontecia sempre que
  // a MESMA conversa local era promovida a uma conversa Supabase mais de uma
  // vez (ex.: duas abas/duas montagens enviando a primeira mensagem quase ao
  // mesmo tempo, cada uma criando sua própria uni_conversations e tentando
  // reenviar o mesmo lote de mensagens locais). upsert com
  // ignoreDuplicates faz cada linha do lote ser resolvida
  // independentemente: linhas novas são inseridas, linhas já existentes
  // (mesmo client_message_id na mesma conversa) são simplesmente puladas --
  // nunca perde dado novo, nunca duplica linha.
  const { error } = await supabase
    .from(MESSAGES_TABLE)
    .upsert(dbMsgs, { onConflict: 'conversation_id,client_message_id', ignoreDuplicates: true });

  if (error) {
    if (error.code === '23505') {
      markOnline();
      return true;
    }
    markOffline();
    return false;
  }

  markOnline();
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

  const localConvs = loadLocalHistory();
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
