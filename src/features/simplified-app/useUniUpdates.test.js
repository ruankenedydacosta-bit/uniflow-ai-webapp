import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = () => readFile(new URL('useUniUpdates.js', import.meta.url), 'utf8');

// ============================================================================
// UNIUPD1 -- useUniUpdates.js. Sem Testing Library/jsdom no repositorio:
// cobertura estrutural por leitura de fonte, mesmo padrao ja usado por
// useNotifications.test.js. (buildNovidadeUrl mora em uniUpdatesData.js,
// modulo puro sem import de React/Session -- coberto em
// uniUpdatesData.test.js via import direto.)
// ============================================================================

test('reaproveita buildNovidadeUrl de uniUpdatesData.js -- nunca duplica a montagem do link', async () => {
  const content = await source();
  assert.match(content, /import \{ buildNovidadeUrl, resolvePendingUpdate \} from '\.\/uniUpdatesData\.js';/);
});

test('chave exclusivamente pelo user.id da sessao (nunca por workspaceId sozinho)', async () => {
  const content = await source();
  assert.match(content, /const \{ user, workspace \} = useSession\(\);/);
  assert.match(content, /const userId = user\?\.id \?\? null;/);
});

test('limit e repassado ao service -- Home pede limit:1, Sobre pede o historico completo, sem duplicar mecanismo', async () => {
  const content = await source();
  assert.match(content, /export function useUniUpdates\(\{ limit \} = \{\}\)/);
  assert.match(content, /listActiveUpdates\(\{ limit \}\)/);
});

test('sem usuario (login/logout), a lista e sempre resetada', async () => {
  const content = await source();
  const fnBody = content.slice(
    content.indexOf('const refresh = useCallback'),
    content.indexOf('useEffect(() => {\n    // Mesmo'),
  );
  assert.match(fnBody, /if \(!isSupabaseConfigured \|\| !userId\) \{/);
  assert.match(fnBody, /setUpdates\(EMPTY_LIST\);/);
  assert.match(fnBody, /setSeenUpdateIds\(EMPTY_LIST\);/);
});

test('refresh usa requestId para descartar resposta tardia', async () => {
  const content = await source();
  const fnBody = content.slice(
    content.indexOf('const refresh = useCallback'),
    content.indexOf('useEffect(() => {\n    // Mesmo'),
  );
  assert.match(fnBody, /const requestId = \+\+requestIdRef\.current;/);
  assert.match(fnBody, /if \(requestId !== requestIdRef\.current\) return null;/);
});

test('pendingUpdate e calculado via resolvePendingUpdate, com userCreatedAt -- usuario novo nao ve destaque de historico', async () => {
  const content = await source();
  assert.match(content, /const userCreatedAt = user\?\.created_at \?\? null;/);
  assert.match(
    content,
    /const pendingUpdate = resolvePendingUpdate\(\{ updates, seenUpdateIds, userCreatedAt \}\);/,
  );
});

test('notificacao companheira so dispara uma vez por novidade detectada (guard local) e verifica dedup no banco antes de criar', async () => {
  const content = await source();
  const fnBody = content.slice(
    content.indexOf('useEffect(() => {\n    if (!pendingUpdate'),
    content.indexOf('// "Atualização concluída"'),
  );
  assert.match(fnBody, /if \(notifiedUpdateIdRef\.current === pendingUpdate\.id\) return;/);
  assert.match(fnBody, /const existing = await hasUpdateNotification\(userId, pendingUpdate\.id\);/);
  assert.match(fnBody, /if \(existing\.error \|\| existing\.data\) return;/);
});

test('notificacao criada usa type uni, titulo/mensagem fixos do UNIUPD1 e actionUrl interno seguro', async () => {
  const content = await source();
  assert.match(content, /title: UPDATE_NOTIFICATION_TITLE,/);
  assert.match(content, /message: UPDATE_NOTIFICATION_MESSAGE,/);
  assert.match(content, /actionUrl: buildNovidadeUrl\(pendingUpdate\.id\),/);
  assert.match(content, /'🚀 Nova atualização da Uni'/);
  assert.match(content, /'A Uni recebeu melhorias para deixar sua experiência ainda melhor\.'/);
});

test('markAsSeen e otimista e reverte em caso de erro -- nunca obriga o usuario a esperar', async () => {
  const content = await source();
  const fnBody = content.slice(
    content.indexOf('const markAsSeen = useCallback'),
    content.indexOf('const updatesWithSeen'),
  );
  assert.match(fnBody, /setSeenUpdateIds\(\(current\) => \(current\.includes\(updateId\) \? current : \[\.\.\.current, updateId\]\)\);/);
  assert.match(fnBody, /if \(result\.error\) \{\s*\n\s*setSeenUpdateIds\(previous\);/);
});
