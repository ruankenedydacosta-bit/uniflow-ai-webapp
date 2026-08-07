import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// OPENAI2 -- uniChatDataService.js. Sem cliente Supabase real em teste
// (isSupabaseConfigured e false), cobertura estrutural por leitura de fonte
// -- mesmo padrao ja usado por categoryService.test.js/authService.test.js.
// Tabelas EXISTENTES (uni_conversations/uni_messages), nenhuma nova criada.
// ============================================================================

test('usa as tabelas existentes uni_conversations e uni_messages, nenhuma tabela nova', async () => {
  const content = await source('uniChatDataService.js');
  assert.match(content, /const CONVERSATIONS_TABLE = 'uni_conversations';/);
  assert.match(content, /const MESSAGES_TABLE = 'uni_messages';/);
});

test('listConversations isola por usuario E por workspace (user_id + workspace_id + workspace_type)', async () => {
  const content = await source('uniChatDataService.js');
  const fnBody = content.slice(
    content.indexOf('export async function listConversations'),
    content.indexOf('export async function listAllConversations'),
  );
  assert.match(fnBody, /\.eq\('user_id', userId\)/);
  assert.match(fnBody, /\.eq\('workspace_id', workspaceId\)/);
  assert.match(fnBody, /\.eq\('workspace_type', wsType\)/);
});

test('listConversations ordena cronologicamente (updated_at desc) e exclui arquivadas', async () => {
  const content = await source('uniChatDataService.js');
  const fnBody = content.slice(
    content.indexOf('export async function listConversations'),
    content.indexOf('export async function listAllConversations'),
  );
  assert.match(fnBody, /\.is\('archived_at', null\)/);
  assert.match(fnBody, /\.order\('updated_at', \{ ascending: false \}\)/);
});

test('createConversation grava user_id e workspace_id recebidos -- nunca cria para outro usuario/workspace', async () => {
  const content = await source('uniChatDataService.js');
  const fnBody = content.slice(
    content.indexOf('export async function createConversation'),
    content.indexOf('export async function updateConversationTitle'),
  );
  assert.match(fnBody, /user_id: userId,/);
  assert.match(fnBody, /workspace_id: workspaceId,/);
});

test('updateConversationTitle/archiveConversation/deleteConversation sempre filtram por user_id -- isolamento por usuario', async () => {
  const content = await source('uniChatDataService.js');
  for (const fn of ['updateConversationTitle', 'archiveConversation', 'deleteConversation']) {
    const start = content.indexOf(`export async function ${fn}`);
    const end = content.indexOf('export async function', start + 1);
    const fnBody = content.slice(start, end === -1 ? undefined : end);
    assert.match(fnBody, /\.eq\('user_id', userId\)/, `${fn} deve filtrar por user_id`);
  }
});

test('loadMessages ordena cronologicamente (created_at ascending) -- ordem de leitura correta', async () => {
  const content = await source('uniChatDataService.js');
  const fnBody = content.slice(
    content.indexOf('export async function loadMessages'),
    content.indexOf('export async function saveMessage('),
  );
  assert.match(fnBody, /\.order\('created_at', \{ ascending: true \}\)/);
});

test('saveMessage trata violacao de unicidade (23505) buscando a mensagem ja existente -- nunca duplica', async () => {
  const content = await source('uniChatDataService.js');
  const fnBody = content.slice(
    content.indexOf('export async function saveMessage('),
    content.indexOf('export async function saveMessages'),
  );
  assert.match(fnBody, /if \(error\.code === '23505'\) \{/);
  assert.match(fnBody, /\.eq\('client_message_id', dbMsg\.client_message_id\)/);
});

test('saveMessages reutiliza saveMessage por item para tratar 23505 sem perder mensagens novas', async () => {
  const content = await source('uniChatDataService.js');
  const fnBody = content.slice(
    content.indexOf('export async function saveMessages'),
    content.indexOf('// —————— MIGRATION'),
  );
  assert.match(fnBody, /await saveMessage\(convId, message, userId\)/);
  assert.match(fnBody, /const uniqueMessages = Array\.from\(new Map\(/);
});

test('BUG REAL: saveMessages nao usa upsert contra indice parcial nem insert atomico de lote', async () => {
  const content = await source('uniChatDataService.js');
  const fnBody = content.slice(
    content.indexOf('export async function saveMessages'),
    content.indexOf('// —————— MIGRATION'),
  );
  assert.doesNotMatch(fnBody, /\.upsert\(/);
  assert.doesNotMatch(fnBody, /\.insert\(/);
});

test('falha de persistencia (erro na query) nunca lanca -- retorna null/false para o chamador tratar sem tela branca', async () => {
  const content = await source('uniChatDataService.js');
  assert.doesNotMatch(content, /throw /);
});

test('messageToDb nunca envia resposta parcial -- sempre o content completo da mensagem final', async () => {
  const content = await source('uniChatDataService.js');
  const fnBody = content.slice(
    content.indexOf('function messageToDb'),
    content.indexOf('function formatTimestamp'),
  );
  assert.match(fnBody, /content: msg\.text \|\| '',/);
});

test('conexao offline/online e rastreada e notificada aos assinantes (banner de status no chat)', async () => {
  const content = await source('uniChatDataService.js');
  assert.match(content, /export function getConnectionStatus\(\)/);
  assert.match(content, /export function subscribeConnectionStatus\(fn\)/);
});

// ============================================================================
// SUPORTE1 -- conversas de suporte reaproveitam uni_conversations/uni_messages
// (conversation_type='support'), mas com funções PRÓPRIAS de listagem/criação
// -- nunca filtradas por workspace/PF-PJ como o chat financeiro.
// ============================================================================

test('listConversations (financeiro) agora também filtra por conversation_type=financial -- nunca mistura com conversas de suporte', async () => {
  const content = await source('uniChatDataService.js');
  const fnBody = content.slice(
    content.indexOf('export async function listConversations'),
    content.indexOf('export async function listAllConversations'),
  );
  assert.match(fnBody, /\.eq\('conversation_type', 'financial'\)/);
});

test('listSupportConversations filtra por user_id + conversation_type=support, sem nenhum filtro de workspace/PF-PJ', async () => {
  const content = await source('uniChatDataService.js');
  const fnBody = content.slice(
    content.indexOf('export async function listSupportConversations'),
    content.indexOf('export async function createSupportConversation'),
  );
  assert.match(fnBody, /\.eq\('user_id', userId\)/);
  assert.match(fnBody, /\.eq\('conversation_type', 'support'\)/);
  assert.doesNotMatch(fnBody, /\.eq\('workspace_type'/);
  assert.doesNotMatch(fnBody, /\.eq\('workspace_id'/);
});

test('createSupportConversation grava conversation_type=support e o user_id do usuário autenticado', async () => {
  const content = await source('uniChatDataService.js');
  const fnBody = content.slice(
    content.indexOf('export async function createSupportConversation'),
    content.indexOf('export async function updateConversationTitle'),
  );
  assert.match(fnBody, /conversation_type: 'support',/);
  assert.match(fnBody, /user_id: userId,/);
});

test('dbToConversation expõe conversationType (default financial quando a coluna não vem no SELECT)', async () => {
  const content = await source('uniChatDataService.js');
  const fnBody = content.slice(
    content.indexOf('function dbToConversation'),
    content.indexOf('function dbToMessage'),
  );
  assert.match(fnBody, /conversationType: row\.conversation_type \|\| 'financial',/);
});

// ============================================================================
// BUG REAL (BUG 5): merge de mensagens por identidade estável. Mensagens
// locais e do Supabase se fundem pela MESMA identidade (client_message_id)
// -- nunca pelo índice do array nem pelo id do banco (dbId pode diferir
// entre ambientes e duplicar a mesma mensagem). O serviço preserva a
// identidade nos dois sentidos (dbToMessage/messageToDb); o merge em si
// acontece na hidratação do chat (UniChatPage.test.js).
// ============================================================================

test('BUG REAL (BUG 5): dbToMessage preserva a identidade original (client_message_id) e o dbId separadamente', async () => {
  const content = await source('uniChatDataService.js');
  const fnBody = content.slice(
    content.indexOf('function dbToMessage'),
    content.indexOf('function messageToDb'),
  );
  assert.match(fnBody, /id: row\.client_message_id \|\| row\.id,/);
  assert.match(fnBody, /dbId: row\.id/);
});

test('BUG REAL (BUG 5): messageToDb persiste client_message_id em todas as gravações (fila offline inclusa)', async () => {
  const content = await source('uniChatDataService.js');
  const fnBody = content.slice(
    content.indexOf('function messageToDb'),
    content.indexOf('function formatTimestamp'),
  );
  assert.match(fnBody, /client_message_id: msg\.clientMessageId \|\| msg\.id,/);
});
