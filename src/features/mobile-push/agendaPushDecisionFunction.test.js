import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// ============================================================================
// AGPUSH1 -- cobertura estrutural (source-regex) da Edge Function
// agenda-push-decision. Mesmo padrao das demais Edge Functions deste
// projeto (Deno/TS nao roda sob `node --test`).
// ============================================================================

const SOURCE = readFileSync(
  new URL('../../../supabase/functions/agenda-push-decision/index.ts', import.meta.url),
  'utf8',
);

test('offset so aceita 30, 60 ou none -- qualquer outro valor e rejeitado antes de qualquer chamada ao banco', () => {
  assert.match(SOURCE, /const VALID_OFFSETS = new Set\(\['30', '60', 'none'\]\);/);
  assert.match(SOURCE, /if \(!VALID_OFFSETS\.has\(offset\)\) \{/);
  const validationIndex = SOURCE.indexOf('if (!VALID_OFFSETS.has(offset))');
  const firstDbCallIndex = SOURCE.indexOf('await applyDecisionAsUser(');
  assert.ok(validationIndex > -1 && firstDbCallIndex > validationIndex, 'validacao de offset deve vir antes de qualquer escrita');
});

test('agenda_item_id e validado como UUID antes de qualquer chamada ao banco -- nunca aceita string arbitraria', () => {
  assert.match(SOURCE, /const UUID_RE = \/\^\[0-9a-f\]/);
  assert.match(SOURCE, /if \(!UUID_RE\.test\(agendaItemId\)\) \{/);
});

test('caminho autenticado (sessao) repassa o JWT do proprio chamador ao PostgREST -- nunca usa service role para este caminho', () => {
  const fnBody = SOURCE.slice(
    SOURCE.indexOf('async function applyDecisionAsUser'),
    SOURCE.indexOf('async function applyDecisionWithToken'),
  );
  assert.match(fnBody, /Authorization: authorization,/);
  assert.doesNotMatch(fnBody, /serviceRoleKey/);
});

test('caminho de token (Service Worker sem sessao) usa service role, mas filtra por agenda_item_id E decision_token -- nunca aceita user_id do chamador', () => {
  const fnBody = SOURCE.slice(
    SOURCE.indexOf('async function applyDecisionWithToken'),
    SOURCE.indexOf('Deno.serve'),
  );
  assert.match(fnBody, /Authorization: `Bearer \$\{serviceRoleKey\}`,/);
  assert.match(fnBody, /agenda_item_id: `eq\.\$\{agendaItemId\}`,/);
  assert.match(fnBody, /decision_token: `eq\.\$\{token\}`,/);
  assert.doesNotMatch(fnBody, /user_id:/);
});

test('ambos os caminhos de escrita filtram reminder_decision_at is.null -- primeira decisao vence, nunca repergunta', () => {
  const userFnBody = SOURCE.slice(
    SOURCE.indexOf('async function applyDecisionAsUser'),
    SOURCE.indexOf('async function applyDecisionWithToken'),
  );
  const tokenFnBody = SOURCE.slice(
    SOURCE.indexOf('async function applyDecisionWithToken'),
    SOURCE.indexOf('Deno.serve'),
  );
  assert.match(userFnBody, /reminder_decision_at: 'is\.null',/);
  assert.match(tokenFnBody, /reminder_decision_at: 'is\.null',/);
});

test('sem Authorization Bearer e sem token valido, a requisicao e rejeitada -- nunca cai silenciosamente em nenhum dos dois caminhos', () => {
  const handlerBody = SOURCE.slice(SOURCE.indexOf('Deno.serve(async (request)'));
  assert.match(handlerBody, /return jsonResponse\(401, errorBody\('AUTH_REQUIRED'/);
});

test('resposta nunca revela se o item nao existia, pertencia a outro usuario ou ja tinha sido decidido -- sempre 200 com applied:boolean', () => {
  assert.match(SOURCE, /return jsonResponse\(200, \{ applied \}, origin\);/);
});
