import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// PUSH1 -- useWebPush.js. Sem Testing Library/jsdom no repositorio: cobertura
// estrutural por leitura de fonte, mesmo padrao ja usado por
// useNotifications.test.js.
// ============================================================================

test('requestPermission so e chamado dentro de enableNotifications (gesto explicito do usuario), nunca no mount/efeito', async () => {
  const content = await source('useWebPush.js');
  const effectBody = content.slice(content.indexOf('useEffect(() => {'), content.indexOf('const enableNotifications'));
  assert.doesNotMatch(effectBody, /requestPermission/);
  const enableBody = content.slice(
    content.indexOf('const enableNotifications = useCallback'),
    content.indexOf('const disableNotifications = useCallback'),
  );
  assert.match(enableBody, /await Notification\.requestPermission\(\);/);
});

test('subscribe usa userVisibleOnly true e a chave publica VAPID -- nunca a privada', async () => {
  const content = await source('useWebPush.js');
  const enableBody = content.slice(
    content.indexOf('const enableNotifications = useCallback'),
    content.indexOf('const disableNotifications = useCallback'),
  );
  assert.match(enableBody, /userVisibleOnly: true,/);
  assert.match(enableBody, /applicationServerKey: urlBase64ToUint8Array\(VAPID_PUBLIC_KEY\),/);
  assert.doesNotMatch(content, /VAPID_PRIVATE_KEY/);
});

test('chave publica VAPID vem de VITE_VAPID_PUBLIC_KEY -- nunca hardcoded', async () => {
  const content = await source('useWebPush.js');
  assert.match(content, /const VAPID_PUBLIC_KEY = \(import\.meta\.env \?\? \{\}\)\.VITE_VAPID_PUBLIC_KEY \?\? '';/);
});

test('mount reconcilia com a subscription real do navegador antes de assumir ENABLED', async () => {
  const content = await source('useWebPush.js');
  const effectBody = content.slice(content.indexOf('useEffect(() => {'), content.indexOf('const enableNotifications'));
  assert.match(effectBody, /registration\.pushManager\.getSubscription\(\);/);
});

// PUSH1 (correcao de race): bug real visto no teste fisico Android -- uma
// subscription local "orfa" (existe no browser, nunca foi persistida ou
// foi revogada no banco) fazia o mount declarar ENABLED sem confirmar
// nada, deixando "Enviar notificação de teste" clicavel antes de existir
// qualquer linha em push_subscriptions (404 real nos logs). A correcao:
// self-healing -- AWAIT a persistencia antes de declarar ENABLED.
test('mount NUNCA declara ENABLED so por existir subscription local -- sempre persiste (self-healing) e aguarda antes', async () => {
  const content = await source('useWebPush.js');
  const effectBody = content.slice(content.indexOf('useEffect(() => {'), content.indexOf('const enableNotifications'));
  assert.doesNotMatch(effectBody, /setStatus\(subscription \? PUSH_STATUS\.ENABLED/);
  assert.match(effectBody, /const result = await persistBrowserSubscription\(\{ userId, workspaceId, subscription, capabilities \}\);/);
  const persistIndex = effectBody.indexOf('await persistBrowserSubscription');
  const enabledIndex = effectBody.indexOf('setStatus(PUSH_STATUS.ENABLED);');
  assert.ok(persistIndex > -1 && enabledIndex > persistIndex, 'ENABLED so pode vir DEPOIS da persistencia aguardada');
});

test('self-healing do mount nunca gera uma subscription nova -- so persiste a que o browser ja tinha (subscribe() nunca e chamado no mount)', async () => {
  const content = await source('useWebPush.js');
  const effectBody = content.slice(content.indexOf('useEffect(() => {'), content.indexOf('const enableNotifications'));
  assert.doesNotMatch(effectBody, /pushManager\.subscribe\(/);
});

test('self-healing que falha (ex.: sem rede) nunca finge ENABLED -- volta pro estado neutro', async () => {
  const content = await source('useWebPush.js');
  const effectBody = content.slice(content.indexOf('useEffect(() => {'), content.indexOf('const enableNotifications'));
  const resultErrorBlock = effectBody.slice(effectBody.indexOf('if (result.error) {'), effectBody.indexOf('setStatus(PUSH_STATUS.ENABLED);'));
  assert.match(resultErrorBlock, /setStatus\(PUSH_STATUS\.DEFAULT\);/);
});

test('enableNotifications e o self-healing do mount reusam a MESMA funcao de persistencia -- nunca duas implementacoes desalinhadas', async () => {
  const content = await source('useWebPush.js');
  const occurrences = content.match(/await persistBrowserSubscription\(\{ userId, workspaceId, subscription, capabilities \}\)/g) ?? [];
  assert.equal(occurrences.length, 2, 'mount effect e enableNotifications devem chamar persistBrowserSubscription exatamente uma vez cada');
});

test('disableNotifications desinscreve o browser E revoga no backend -- nunca so um dos dois', async () => {
  const content = await source('useWebPush.js');
  const disableBody = content.slice(
    content.indexOf('const disableNotifications = useCallback'),
    content.indexOf('const sendTest = useCallback'),
  );
  assert.match(disableBody, /await subscription\.unsubscribe\(\);/);
  assert.match(disableBody, /await revokePushSubscription\(userId, endpoint\);/);
});

test('sendTest chama sempre o mesmo service central -- nunca uma segunda implementacao de envio', async () => {
  const content = await source('useWebPush.js');
  assert.match(content, /import \{ sendTestNotification \} from '\.\/pushEdgeFunctions\.js';/);
  const sendTestBody = content.slice(content.indexOf('const sendTest = useCallback'));
  assert.match(sendTestBody, /await sendTestNotification\(\{ workspaceId \}\);/);
});

test('sem suporte ou sem configuracao, enableNotifications/disableNotifications retornam cedo sem lancar', async () => {
  const content = await source('useWebPush.js');
  const enableBody = content.slice(
    content.indexOf('const enableNotifications = useCallback'),
    content.indexOf('const disableNotifications = useCallback'),
  );
  assert.match(enableBody, /if \(!capabilities\.isSupported \|\| !isPushConfigured \|\| !userId\) return null;/);
  const disableBody = content.slice(
    content.indexOf('const disableNotifications = useCallback'),
    content.indexOf('const sendTest = useCallback'),
  );
  assert.match(disableBody, /if \(!capabilities\.isSupported \|\| !userId\) return null;/);
});
