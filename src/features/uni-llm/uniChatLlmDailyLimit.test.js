import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const EDGE_SOURCE = readFileSync(
  new URL('../../../supabase/functions/uni-chat-llm/index.ts', import.meta.url),
  'utf8',
);
const MIGRATION_SOURCE = readFileSync(
  new URL('../../../supabase/migrations/20261007001255_053_uni_llm_daily_usage.sql', import.meta.url),
  'utf8',
);

test('a IA do chat consome o teto diário antes de chamar a OpenAI', () => {
  const consumeAt = EDGE_SOURCE.indexOf('await consumeDailyCall(');
  const providerAt = EDGE_SOURCE.indexOf('await callOpenAiAdapter(');
  assert.ok(consumeAt > 0 && providerAt > consumeAt);
  assert.match(EDGE_SOURCE, /rpc\/uni_llm_consume_call/);
  assert.match(EDGE_SOURCE, /p_user_id: userId, p_daily_limit: dailyLimit/);
});

test('teto atingido responde 429 com código próprio; sem contador, falha fechado', () => {
  assert.match(EDGE_SOURCE, /if \(dailyCall === 'limit_reached'\) \{[\s\S]*?respondJson\(429, \{[\s\S]*?code: 'DAILY_LIMIT'/);
  assert.match(EDGE_SOURCE, /if \(dailyCall === 'unavailable'\) \{[\s\S]*?respondJson\(503,/);
  assert.match(EDGE_SOURCE, /if \(!serviceRoleKey\) return 'unavailable';/);
});

test('o teto vem do secret e tem padrão quando o valor é inválido', () => {
  assert.match(EDGE_SOURCE, /const DEFAULT_DAILY_CALL_LIMIT = 300;/);
  assert.match(EDGE_SOURCE, /resolveDailyCallLimit\(Deno\.env\.get\('UNI_LLM_DAILY_CALL_LIMIT'\)\)/);
});

test('só service_role chama o contador, e a tabela fica fechada ao app', () => {
  assert.match(MIGRATION_SOURCE, /revoke execute on function public\.uni_llm_consume_call\(uuid, integer\) from public, anon, authenticated;/);
  assert.match(MIGRATION_SOURCE, /grant execute on function public\.uni_llm_consume_call\(uuid, integer\) to service_role;/);
  assert.match(MIGRATION_SOURCE, /revoke all on table public\.uni_llm_daily_usage from anon, authenticated;/);
  assert.match(MIGRATION_SOURCE, /where usage\.calls < p_daily_limit/);
});
