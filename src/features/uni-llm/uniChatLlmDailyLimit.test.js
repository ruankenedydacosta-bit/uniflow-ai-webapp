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

const INTERPRET_SOURCE = readFileSync(
  new URL('../../../supabase/functions/uni-interpret/index.ts', import.meta.url),
  'utf8',
);
const MIGRATION_054_SOURCE = readFileSync(
  new URL('../../../supabase/migrations/20261007101852_054_uni_llm_custo_por_plano.sql', import.meta.url),
  'utf8',
);

// Migration 054: o teto único de 300 chamadas por dia virou teto por plano,
// com chamadas do dia e custo do mês.
test('a IA do chat reserva a chamada antes da OpenAI e registra o custo depois', () => {
  const reserveAt = EDGE_SOURCE.indexOf('await reservarChamada(');
  const providerAt = EDGE_SOURCE.indexOf('await callOpenAiAdapter(');
  const costAt = EDGE_SOURCE.indexOf('await registrarCusto(');
  assert.ok(reserveAt > 0 && providerAt > reserveAt && costAt > providerAt);
});

test('teto atingido responde 429 com código próprio; sem contador, falha fechado', () => {
  assert.match(EDGE_SOURCE, /if \(dailyCall === 'teto_diario' \|\| dailyCall === 'teto_mensal'\) \{[\s\S]*?respondJson\(429, \{[\s\S]*?'MONTHLY_LIMIT' : 'DAILY_LIMIT'/);
  assert.match(EDGE_SOURCE, /if \(dailyCall === 'indisponivel'\) \{[\s\S]*?respondJson\(503,/);
  assert.doesNotMatch(EDGE_SOURCE, /UNI_LLM_DAILY_CALL_LIMIT/);
});

test('a uni-interpret usa o mesmo teto e registra o custo da chamada', () => {
  const reserveAt = INTERPRET_SOURCE.indexOf('await reservarChamada(');
  const providerAt = INTERPRET_SOURCE.indexOf('await interpretarComOpenAi(');
  const costAt = INTERPRET_SOURCE.indexOf('await registrarCusto(');
  assert.ok(reserveAt > 0 && providerAt > reserveAt && costAt > providerAt);
});

test('tetos por plano ficam em cerca de 7% do preço e só service_role mexe no contador', () => {
  assert.match(MIGRATION_054_SOURCE, /ai_daily_call_limit = 40, ai_monthly_cost_brl = 1\.00 where id = 'essencial'/);
  assert.match(MIGRATION_054_SOURCE, /ai_daily_call_limit = 80, ai_monthly_cost_brl = 2\.00 where id = 'uni_voz'/);
  assert.match(MIGRATION_054_SOURCE, /ai_daily_call_limit = 200, ai_monthly_cost_brl = 5\.00 where id = 'uni_voz_plus'/);
  for (const assinatura of ['uni_llm_user_tier_id(uuid)', 'uni_llm_reserve_call(uuid)', 'uni_llm_record_cost(uuid, numeric)']) {
    assert.ok(MIGRATION_054_SOURCE.includes(`revoke execute on function public.${assinatura} from public, anon, authenticated;`), assinatura);
    assert.ok(MIGRATION_054_SOURCE.includes(`grant execute on function public.${assinatura} to service_role;`), assinatura);
  }
});

test('só service_role chama o contador, e a tabela fica fechada ao app', () => {
  assert.match(MIGRATION_SOURCE, /revoke execute on function public\.uni_llm_consume_call\(uuid, integer\) from public, anon, authenticated;/);
  assert.match(MIGRATION_SOURCE, /grant execute on function public\.uni_llm_consume_call\(uuid, integer\) to service_role;/);
  assert.match(MIGRATION_SOURCE, /revoke all on table public\.uni_llm_daily_usage from anon, authenticated;/);
  assert.match(MIGRATION_SOURCE, /where usage\.calls < p_daily_limit/);
});
