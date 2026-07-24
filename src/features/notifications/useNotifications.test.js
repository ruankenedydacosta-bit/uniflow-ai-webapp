import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// NOTIF1 -- useNotifications.js. Fonte unica de lista/contagem, compartilhada
// pelo sino desktop e pelo painel mobile. Sem Testing Library/jsdom no
// repositorio: cobertura estrutural por leitura de fonte, mesmo padrao ja
// usado para outros hooks (ver useReports.test.js).
// ============================================================================

test('chave exclusivamente pelo user.id da sessao (nunca por workspaceId sozinho)', async () => {
  const content = await source('useNotifications.js');
  assert.match(content, /const \{ user, workspace \} = useSession\(\);/);
  assert.match(content, /const userId = user\?\.id \?\? null;/);
});

test('sem usuario (login/logout), a lista e sempre resetada -- nunca preserva notificacoes do usuario anterior', async () => {
  const content = await source('useNotifications.js');
  const fnBody = content.slice(
    content.indexOf('const refresh = useCallback'),
    content.indexOf('const markAsRead = useCallback'),
  );
  assert.match(
    fnBody,
    /if \(!isSupabaseConfigured \|\| !userId\) \{\s*\n\s*setNotifications\(EMPTY_LIST\);\s*\n\s*setError\(null\);\s*\n\s*setIsLoading\(false\);\s*\n\s*return null;/,
  );
});

test('refresh usa requestId para descartar resposta tardia de um usuario que ja trocou -- nunca sobrescreve o usuario novo com dado do antigo', async () => {
  const content = await source('useNotifications.js');
  const fnBody = content.slice(
    content.indexOf('const refresh = useCallback'),
    content.indexOf('const markAsRead = useCallback'),
  );
  assert.match(fnBody, /const requestId = \+\+requestIdRef\.current;/);
  assert.match(fnBody, /if \(requestId !== requestIdRef\.current\) return null;/);
});

test('troca de usuario invalida qualquer requisicao anterior em andamento (requestIdRef incrementado no efeito de load)', async () => {
  const content = await source('useNotifications.js');
  const fnBody = content.slice(
    content.indexOf('useEffect(() => {'),
    content.indexOf('const markAsRead = useCallback'),
  );
  assert.match(fnBody, /requestIdRef\.current \+= 1;/);
  assert.match(fnBody, /\[userId, workspaceId\]|\[refresh\]/);
});

test('refresh passa workspaceId ao service (isolamento por workspace reaproveitado de notificationsService)', async () => {
  const content = await source('useNotifications.js');
  const fnBody = content.slice(
    content.indexOf('const refresh = useCallback'),
    content.indexOf('const markAsRead = useCallback'),
  );
  assert.match(fnBody, /const result = await listNotifications\(userId, \{ workspaceId \}\);/);
});

test('markAsRead atualiza a lista local otimisticamente apos sucesso do service, sem duplicar logica de fetch', async () => {
  const content = await source('useNotifications.js');
  const fnBody = content.slice(
    content.indexOf('const markAsRead = useCallback'),
    content.indexOf('const markAllAsRead = useCallback'),
  );
  assert.match(fnBody, /await markNotificationAsRead\(userId, notificationId\);/);
  assert.match(fnBody, /if \(!result\.error\) \{/);
});

test('markAllAsRead atualiza todas as nao lidas localmente apos sucesso do service', async () => {
  const content = await source('useNotifications.js');
  const fnBody = content.slice(content.indexOf('const markAllAsRead = useCallback'));
  assert.match(fnBody, /await markAllNotificationsAsRead\(userId, \{ workspaceId \}\);/);
});

test('unreadCount deriva de countUnread(notifications) -- fonte unica de contagem, nunca um contador paralelo', async () => {
  const content = await source('useNotifications.js');
  assert.match(content, /import \{ countUnread \} from '\.\/notificationFormatting\.js';/);
  assert.match(content, /unreadCount: countUnread\(notifications\),/);
});

test('nao usa Supabase Realtime -- so carregamento inicial + refresh manual', async () => {
  const content = await source('useNotifications.js');
  assert.doesNotMatch(content, /\.channel\(|\.subscribe\(|realtime/i);
});
