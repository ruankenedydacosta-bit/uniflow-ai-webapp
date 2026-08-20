import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// ============================================================================
// UNIUPD3 -- cobertura estrutural (source-regex) da Edge Function
// uni-updates-push-dispatch. Mesmo padrao ja usado para agenda-push-dispatch
// (Deno/TS + npm: specifier nao roda sob `node --test`).
// ============================================================================

const SOURCE = readFileSync(
  new URL('../../../supabase/functions/uni-updates-push-dispatch/index.ts', import.meta.url),
  'utf8',
);

test('usa a biblioteca oficial web-push via npm: specifier -- nunca reimplementa criptografia VAPID/aes128gcm a mao', () => {
  assert.match(SOURCE, /import webpush from 'npm:web-push@3\.6\.7';/);
});

test('exige o segredo de disparo PROPRIO via RPC verify_uni_updates_dispatch_secret -- nunca reaproveita verify_agenda_dispatch_secret', () => {
  assert.match(SOURCE, /rest\/v1\/rpc\/verify_uni_updates_dispatch_secret/);
  assert.match(SOURCE, /if \(!isAuthorized\) \{/);
  assert.doesNotMatch(SOURCE, /verify_agenda_dispatch_secret/);
});

test('usa SUPABASE_SERVICE_ROLE_KEY -- worker sem sessao de usuario, disparado pelo proprio banco', () => {
  assert.match(SOURCE, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('candidatos vem SEMPRE de uni_updates_push_candidates() -- nunca aceita user_id/update_id do corpo da requisicao', () => {
  assert.match(SOURCE, /fn: 'uni_updates_push_candidates'/);
  assert.doesNotMatch(SOURCE, /body\.user_id/);
  assert.doesNotMatch(SOURCE, /body\.update_id/);
});

test('envio usa INSERT...ON CONFLICT DO NOTHING (resolution=ignore-duplicates) na chave composta (user_id, update_id) como trava de idempotencia', () => {
  const fnBody = SOURCE.slice(
    SOURCE.indexOf('async function claimDispatchRow'),
    SOURCE.indexOf('async function listActiveSubscriptionsForUser'),
  );
  assert.match(fnBody, /on_conflict=user_id,update_id/);
  assert.match(fnBody, /resolution=ignore-duplicates,return=representation/);
});

test('subscriptions ativas filtram por user_id e revoked_at is.null -- so as do proprio destinatario, nunca de outro usuario', () => {
  const fnBody = SOURCE.slice(
    SOURCE.indexOf('async function listActiveSubscriptionsForUser'),
    SOURCE.indexOf('async function revokeSubscription'),
  );
  assert.match(fnBody, /user_id: `eq\.\$\{userId\}`,/);
  assert.match(fnBody, /revoked_at: 'is\.null',/);
});

test('404/410 do push service revoga a subscription -- mesmo tratamento de erro de agenda-push-dispatch', () => {
  const fnBody = SOURCE.slice(
    SOURCE.indexOf('async function sendToUserSubscriptions'),
    SOURCE.indexOf('async function processCandidates'),
  );
  assert.match(fnBody, /statusCode === 404 \|\| statusCode === 410/);
  assert.match(fnBody, /await revokeSubscription\(/);
});

test('payload do push usa o MESMO titulo/mensagem da notificacao in-app (useUniUpdates.js) -- nunca um texto divergente entre canais', () => {
  const fnBody = SOURCE.slice(
    SOURCE.indexOf('function buildUpdatePayload'),
    SOURCE.indexOf('async function sendToUserSubscriptions'),
  );
  assert.match(fnBody, /title: '🚀 Nova atualização da Uni',/);
  assert.match(fnBody, /body: 'A Uni recebeu melhorias para deixar sua experiência ainda melhor\.',/);
});

test('url do payload aponta para o deep link da Central de Novidades -- mesmo formato de buildNovidadeUrl (uniUpdatesData.js)', () => {
  const fnBody = SOURCE.slice(
    SOURCE.indexOf('function buildUpdatePayload'),
    SOURCE.indexOf('async function sendToUserSubscriptions'),
  );
  assert.match(fnBody, /const url = `\/app\/conta\/sobre\?novidade=\$\{candidate\.update_id\}`;/);
});

test('tag estavel por novidade (uni-update-<id>) -- reenvio para a MESMA versao substitui na bandeja, nunca empilha', () => {
  const fnBody = SOURCE.slice(
    SOURCE.indexOf('function buildUpdatePayload'),
    SOURCE.indexOf('async function sendToUserSubscriptions'),
  );
  assert.match(fnBody, /tag: `uni-update-\$\{candidate\.update_id\}`,/);
});

test('so aceita POST -- nunca processa GET/outros metodos', () => {
  assert.match(SOURCE, /if \(request\.method !== 'POST'\) \{/);
  assert.match(SOURCE, /405/);
});

test('sem VAPID/service role configurados, responde 503 antes de qualquer chamada ao banco', () => {
  const fnBody = SOURCE.slice(SOURCE.indexOf('Deno.serve'));
  assert.match(fnBody, /if \(!supabaseUrl \|\| !serviceRoleKey \|\| !vapidPublicKey \|\| !vapidPrivateKey \|\| !vapidSubject\) \{/);
  assert.match(fnBody, /503/);
});
