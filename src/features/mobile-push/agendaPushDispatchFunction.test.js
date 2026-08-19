import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// ============================================================================
// AGPUSH1 -- cobertura estrutural (source-regex) da Edge Function
// agenda-push-dispatch. Mesmo padrao ja usado para push-send-test-notification
// (Deno/TS + npm: specifier nao roda sob `node --test`).
// ============================================================================

const SOURCE = readFileSync(
  new URL('../../../supabase/functions/agenda-push-dispatch/index.ts', import.meta.url),
  'utf8',
);

test('usa a biblioteca oficial web-push via npm: specifier -- nunca reimplementa criptografia VAPID/aes128gcm a mao', () => {
  assert.match(SOURCE, /import webpush from 'npm:web-push@3\.6\.7';/);
});

test('exige o segredo de disparo via RPC verify_agenda_dispatch_secret -- nunca aceita chamada sem ele', () => {
  assert.match(SOURCE, /rest\/v1\/rpc\/verify_agenda_dispatch_secret/);
  assert.match(SOURCE, /if \(!isAuthorized\) \{/);
});

test('usa SUPABASE_SERVICE_ROLE_KEY -- worker precisa enxergar todos os workspaces, ao contrario das Edge Functions escopadas ao usuario', () => {
  assert.match(SOURCE, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('candidatos vem SEMPRE das funcoes SQL de elegibilidade -- nunca aceita agenda_item_id/user_id/workspace_id do corpo da requisicao', () => {
  assert.match(SOURCE, /rpc\/\$\{fn\}/);
  assert.doesNotMatch(SOURCE, /body\.agenda_item_id/);
  assert.doesNotMatch(SOURCE, /body\.user_id/);
});

test('pergunta usa INSERT...ON CONFLICT DO NOTHING (resolution=ignore-duplicates) como trava de idempotencia -- so quem cria a linha envia', () => {
  const fnBody = SOURCE.slice(
    SOURCE.indexOf('async function claimPromptRow'),
    SOURCE.indexOf('async function claimReminderRow'),
  );
  assert.match(fnBody, /on_conflict=agenda_item_id/);
  assert.match(fnBody, /resolution=ignore-duplicates,return=representation/);
});

test('lembrete efetivo usa UPDATE condicional (reminder_sent_at is.null) como trava de idempotencia -- so quem reivindica a linha envia', () => {
  const fnBody = SOURCE.slice(
    SOURCE.indexOf('async function claimReminderRow'),
    SOURCE.indexOf('async function listActiveSubscriptionsForUser'),
  );
  assert.match(fnBody, /reminder_sent_at=is\.null/);
  assert.match(fnBody, /Prefer: 'return=representation'/);
});

test('actions no payload da pergunta so quando subscription.platform === android -- iOS nunca recebe actions', () => {
  const fnBody = SOURCE.slice(
    SOURCE.indexOf('function buildPromptPayload'),
    SOURCE.indexOf('function buildReminderPayload'),
  );
  assert.match(fnBody, /const isAndroid = subscription\.platform === 'android';/);
  assert.match(fnBody, /\.\.\.\(isAndroid \? \{/);
});

test('actions usam identificadores internos estaveis (agenda_remind_30/60/none), nunca o texto do botao como chave', () => {
  assert.match(SOURCE, /action: 'agenda_remind_30'/);
  assert.match(SOURCE, /action: 'agenda_remind_60'/);
  assert.match(SOURCE, /action: 'agenda_remind_none'/);
});

test('decision_token viaja so dentro do payload de push (nunca em texto visivel) e e o mesmo devolvido pelo INSERT da pergunta', () => {
  const fnBody = SOURCE.slice(
    SOURCE.indexOf('function buildPromptPayload'),
    SOURCE.indexOf('function buildReminderPayload'),
  );
  assert.match(fnBody, /decision_token: decisionToken,/);
});

test('horario mostrado ao usuario e sempre convertido para America/Sao_Paulo -- nunca UTC cru', () => {
  assert.match(SOURCE, /function formatSaoPauloTime/);
  assert.match(SOURCE, /timeZone: TIMEZONE/);
  const bodyLine = SOURCE.slice(SOURCE.indexOf('function buildPromptPayload'));
  assert.match(bodyLine, /formatSaoPauloTime\(candidate\.starts_at\)/);
});

test('janela de horario da pergunta e 18h-20h America/Sao_Paulo -- nunca de madrugada', () => {
  assert.match(SOURCE, /PROMPT_WINDOW_START_HOUR = 18;/);
  assert.match(SOURCE, /PROMPT_WINDOW_END_HOUR = 20;/);
  assert.match(SOURCE, /hour >= PROMPT_WINDOW_START_HOUR && hour < PROMPT_WINDOW_END_HOUR/);
});

test('modo de teste interno (test_bypass_window) so pula a janela de horario -- nunca muda a chamada a RPC de elegibilidade, e so e lido depois de validar o segredo de disparo', () => {
  const dispatchBody = SOURCE.slice(SOURCE.indexOf('Deno.serve(async (request)'));
  const secretCheckIndex = dispatchBody.indexOf('isAuthorized');
  const bypassIndex = dispatchBody.indexOf('bypassPromptWindow');
  assert.ok(secretCheckIndex > -1 && bypassIndex > secretCheckIndex, 'bypass so deve ser lido depois de validar o segredo');
  // processPrompts (chamado quando dentro da janela OU bypass) sempre
  // invoca agenda_push_prompt_candidates sem nenhum parametro -- o bypass
  // nunca e repassado para dentro da regra de elegibilidade em SQL.
  assert.match(SOURCE, /fn: 'agenda_push_prompt_candidates' \}\);/);
});

test('multi-device: envia para TODAS as subscriptions ativas do usuario (revoked_at is null), decisao e do compromisso nao do dispositivo', () => {
  const fnBody = SOURCE.slice(
    SOURCE.indexOf('async function listActiveSubscriptionsForUser'),
    SOURCE.indexOf('async function revokeSubscription'),
  );
  assert.match(fnBody, /revoked_at: 'is\.null'/);
});

test('404/410 do push service revoga a subscription -- mesmo padrao de push-send-test-notification', () => {
  const catchBlock = SOURCE.slice(SOURCE.indexOf('} catch (error) {'), SOURCE.indexOf('return { sent, revoked, failed'));
  assert.match(catchBlock, /statusCode === 404 \|\| statusCode === 410/);
  assert.match(catchBlock, /await revokeSubscription\(/);
});

test('nunca persiste um horario absoluto de lembrete -- reminder_sent_at e o unico timestamp de controle, starts_at sempre vem da RPC (live join)', () => {
  assert.doesNotMatch(SOURCE, /reminder_at\b/);
});
