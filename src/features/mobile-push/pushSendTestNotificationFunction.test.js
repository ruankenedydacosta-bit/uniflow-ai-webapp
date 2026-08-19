import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// ============================================================================
// PUSH1 -- cobertura estrutural (source-regex) da Edge Function
// push-send-test-notification. Mesmo padrao ja usado para as demais Edge
// Functions deste projeto (Deno/TS + npm: specifier nao roda sob
// `node --test`): o codigo precisa CONTER a validacao/branch certa, nunca
// executamos o handler.
// ============================================================================

const SOURCE = readFileSync(
  new URL('../../../supabase/functions/push-send-test-notification/index.ts', import.meta.url),
  'utf8',
);

test('usa a biblioteca oficial web-push via npm: specifier -- nunca reimplementa criptografia VAPID/aes128gcm a mao', () => {
  assert.match(SOURCE, /import webpush from 'npm:web-push@3\.6\.7';/);
});

test('exige Authorization Bearer -- nunca aceita chamada sem sessao', () => {
  assert.match(SOURCE, /if \(!authorization\.startsWith\('Bearer '\)\) \{/);
});

test('resolve o destinatario SEMPRE a partir do proprio JWT -- nunca aceita user_id/workspace_id do corpo para decidir quem recebe', () => {
  assert.match(SOURCE, /const userId = await getAuthenticatedUserId\(authorization, supabaseUrl, anonKey\);/);
  assert.doesNotMatch(SOURCE, /payload\?\.\s*user_id/);
  assert.doesNotMatch(SOURCE, /body\.user_id/);
});

test('payload da notificacao e fixo no backend -- nunca le titulo/corpo/url do corpo da requisicao', () => {
  const constBlock = SOURCE.slice(SOURCE.indexOf('const TEST_NOTIFICATION_PAYLOAD'));
  assert.match(constBlock, /title: 'Uni ✦',/);
  assert.match(constBlock, /body: 'Notificações ativadas\. A Uni pode te lembrar do que realmente importa\.',/);
  assert.doesNotMatch(SOURCE, /await request\.json\(\)/);
});

test('busca subscriptions filtrando por user_id E revoked_at is null -- nunca envia para subscription revogada', () => {
  const fnBody = SOURCE.slice(
    SOURCE.indexOf('async function listActiveSubscriptions'),
    SOURCE.indexOf('async function revokeSubscription'),
  );
  assert.match(fnBody, /user_id: `eq\.\$\{userId\}`/);
  assert.match(fnBody, /revoked_at: 'is\.null'/);
});

test('usa Authorization do PROPRIO usuario para ler e revogar subscriptions -- nunca service role', () => {
  assert.doesNotMatch(SOURCE, /SUPABASE_SERVICE_ROLE_KEY/);
  const listFnBody = SOURCE.slice(
    SOURCE.indexOf('async function listActiveSubscriptions'),
    SOURCE.indexOf('async function revokeSubscription'),
  );
  assert.match(listFnBody, /Authorization: authorization,/);
  const revokeFnBody = SOURCE.slice(SOURCE.indexOf('async function revokeSubscription'), SOURCE.indexOf('const TEST_NOTIFICATION_PAYLOAD'));
  assert.match(revokeFnBody, /Authorization: authorization,/);
});

test('404/410 do push service marca a subscription como revogada -- outros erros nao revogam', () => {
  const catchBlock = SOURCE.slice(SOURCE.indexOf('} catch (error) {'), SOURCE.indexOf('  }));'));
  assert.match(catchBlock, /statusCode === 404 \|\| statusCode === 410/);
  assert.match(catchBlock, /await revokeSubscription\(/);
  assert.match(catchBlock, /failed \+= 1;/);
});

test('resposta ao cliente e sanitizada -- so contadores, nunca endpoint/chaves das subscriptions', () => {
  const returnStatement = SOURCE.slice(SOURCE.lastIndexOf('return jsonResponse(200,'));
  assert.match(returnStatement, /\{ sent, revoked, failed \}/);
  assert.doesNotMatch(returnStatement, /endpoint|p256dh|auth:/);
});

test('secrets exigidos incluem VAPID_PRIVATE_KEY -- funcao recusa operar sem configuracao completa', () => {
  assert.match(SOURCE, /VAPID_PUBLIC_KEY.*VAPID_PRIVATE_KEY.*VAPID_SUBJECT/s);
  assert.match(SOURCE, /return jsonResponse\(503, errorBody\('SERVICE_UNAVAILABLE'/);
});
